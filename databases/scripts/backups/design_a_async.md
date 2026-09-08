# Backing up one database in design A

Design A is one writable source with two read only replicas. Read
[readme.md](readme.md) first for the backup account and the tools.

| Item | Value |
| --- | --- |
| Members | `mysql-async-1` source and `mysql-async-2` and `mysql-async-3` replicas |
| Host ports | 3306 and 3307 and 3308 |
| Network | `mysql-async` |
| Take the backup from | either replica |
| Restore into | `mysql-async-1` only |

## Where the backup is taken

Take it from a replica. Because a) the source is the only member serving writes b) a
replica is already `super_read_only` so nothing competes with the dump and c) the cost
of a long dump falls on a member no client is using.

The dump is behind the source by the replication lag. Design A acknowledges a commit
before a replica has seen it so whatever had not arrived is not in the backup. Read the
lag before deciding the replica is a fair copy.

```
docker exec -e MYSQL_PWD=password mysql-async-3 mysql -uroot \
  -e "SHOW REPLICA STATUS\G" | grep -E "Replica_IO_Running|Replica_SQL_Running|Seconds_Behind_Source"
```

Back up from the source instead when the backup must be exact to the commit.

## Taking the backup

`--databases demo` names one schema and writes the `CREATE DATABASE` line for it.

```
docker exec -e MYSQL_PWD=backup mysql-async-3 \
  mysqldump -ubackup --single-transaction --set-gtid-purged=COMMENTED \
  --routines --events --databases demo > /var/tmp/mysql-demo/backups/demo-async.sql
```

`--single-transaction` reads the schema from one InnoDB snapshot so the tables agree
with each other. `COMMENTED` writes the GTID position as a comment rather than as a
statement. Point in time recovery needs that position. A restore must never apply it.

The same backup through `mysqlsh`.

```
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp --network mysql-async \
  -v /var/tmp/mysql-demo/backups:/backups mysql:8.4 \
  mysqlsh --uri backup:backup@mysql-async-3:3306 --js \
  -e "util.dumpSchemas(['demo'],'/backups/demo-async-shell',{threads:4})"
```

`@.json` in that directory records the binary log position the dump was taken at. That
is the position point in time recovery starts from.

## Restoring

Only the source accepts a restore. A replica refuses it.

```
ERROR 1290 (HY000) at line 22: The MySQL server is running with the --super-read-only option so it cannot execute this statement
```

Restore into the source and the binary log carries the result to both replicas.

```
docker exec -i -e MYSQL_PWD=password mysql-async-1 mysql -uroot \
  < /var/tmp/mysql-demo/backups/demo-async.sql
```

## Point in time recovery

A backup restores the schema as it stood when the dump began. Everything committed
between that moment and the accident lives in the binary log of the source. Recovery
joins the two on a scratch server then imports the result.

Working from a real run. The backup covered transactions 1 to 20. Transaction 21 was
five more rows. Transaction 22 was `DROP TABLE demo.t`.

Build a scratch server and load the dump.

```
docker run -d --name mysql-pitr --network mysql-async -e MYSQL_ROOT_PASSWORD=password mysql:8.4
docker exec -i -e MYSQL_PWD=password mysql-pitr mysql -uroot \
  < /var/tmp/mysql-demo/backups/demo-async.sql
```

Replay only what the backup missed. `--include-gtids` names the transactions to keep so
the drop is left behind. `--skip-gtids` strips the position bookkeeping the scratch
server does not need.

```
docker run --rm --network mysql-async --entrypoint mysqlbinlog percona/pmm-client:3.9.0 \
  --read-from-remote-server --host mysql-async-1 --port 3306 --user backup --password=backup \
  --database demo --include-gtids='4c387ee9-9bc1-11f1-9cd5-eae876013ce8:21' --skip-gtids \
  binlog.000003 > /var/tmp/mysql-demo/backups/replay.sql
docker exec -i -e MYSQL_PWD=password mysql-pitr mysql -uroot < /var/tmp/mysql-demo/backups/replay.sql
```

The scratch server now holds 45 rows. Forty came from the dump and five from the replay.

Read the GTID of the accident from the source before writing the include list.

```
docker exec -e MYSQL_PWD=password mysql-async-1 mysql -uroot --table \
  -e "SHOW BINLOG EVENTS IN 'binlog.000003'"
```

Move the recovered table back with an ordinary dump and load.

```
docker exec -e MYSQL_PWD=password mysql-pitr \
  mysqldump -uroot --single-transaction --set-gtid-purged=OFF demo t \
  > /var/tmp/mysql-demo/backups/demo-t-recovered.sql
docker exec -i -e MYSQL_PWD=password mysql-async-1 mysql -uroot demo \
  < /var/tmp/mysql-demo/backups/demo-t-recovered.sql
```

Both replicas follow. Never replay a binary log into the source directly. Because a) the
source already holds those transactions in `gtid_executed` so it discards them silently
b) the replay would carry the accident along with the recovery and c) a scratch server
lets the result be inspected before it reaches a client.

## Physical copy

A file copy is instance level. It cannot single out one database. Because a) the InnoDB
data dictionary is shared across every schema in the instance and b) the undo and redo
logs describe the instance rather than a schema.

Take it from a stopped replica.

```
docker stop mysql-async-3
docker run --rm --volumes-from mysql-async-3 -v /var/tmp/mysql-demo/backups:/backups \
  alpine:3.21 tar czf /backups/mysql-async-3-data.tgz -C /var/lib/mysql .
docker start mysql-async-3
```

The replica catches up on its own when it starts. Use this to rebuild a member. Use a
dump to recover a database.
