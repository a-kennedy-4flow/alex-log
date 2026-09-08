# Backing up one database in design B

Design B is a group of three members where one accepts writes. Read
[readme.md](readme.md) first for the backup account and the tools.

| Item | Value |
| --- | --- |
| Members | `mysql-sp-1` and `mysql-sp-2` and `mysql-sp-3` |
| Host ports | 3316 and 3317 and 3318 |
| Network | `mysql-sp` |
| Take the backup from | any online secondary |
| Restore into | the current primary |

## Finding the two members that matter

The group elects its primary so neither role is fixed. Ask the group rather than assume.

```
docker exec -e MYSQL_PWD=password mysql-sp-1 mysql -uroot --table \
  -e "SELECT member_host, member_role, member_state FROM performance_schema.replication_group_members ORDER BY member_host"
```

```
+-------------+-------------+--------------+
| member_host | member_role | member_state |
+-------------+-------------+--------------+
| mysql-sp-1  | PRIMARY     | ONLINE       |
| mysql-sp-2  | SECONDARY   | ONLINE       |
| mysql-sp-3  | SECONDARY   | ONLINE       |
+-------------+-------------+--------------+
```

A script wants the two names on their own.

```
PRIMARY=$(docker exec -e MYSQL_PWD=password mysql-sp-1 mysql -uroot --skip-column-names --batch \
  -e "SELECT member_host FROM performance_schema.replication_group_members WHERE member_role='PRIMARY'")
SECONDARY=$(docker exec -e MYSQL_PWD=password mysql-sp-1 mysql -uroot --skip-column-names --batch \
  -e "SELECT member_host FROM performance_schema.replication_group_members WHERE member_role='SECONDARY' AND member_state='ONLINE' ORDER BY member_host LIMIT 1")
```

`member_state` must read `ONLINE`. A member in `RECOVERING` is still fetching the
transactions it missed so its copy of the schema is incomplete.

## Taking the backup

Take it from a secondary. Because a) the primary is the only member serving writes and
b) every secondary holds the same certified transactions so any of them is a fair copy.

```
docker exec -e MYSQL_PWD=backup "$SECONDARY" \
  mysqldump -ubackup --single-transaction --set-gtid-purged=OFF \
  --routines --events --databases demo > /var/tmp/mysql-demo/backups/demo-sp.sql
```

`OFF` is what makes the file restorable. A dump carrying the position is refused by
every member of the group.

```
ERROR 3911 (HY000) at line 24: Cannot update GTID_PURGED with the Group Replication plugin running
```

The same backup through `mysqlsh`.

```
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp --network mysql-sp \
  -v /var/tmp/mysql-demo/backups:/backups mysql:8.4 \
  mysqlsh --uri backup:backup@mysql-sp-2:3306 --js \
  -e "util.dumpSchemas(['demo'],'/backups/demo-sp-shell',{threads:4})"
```

The shell takes a global read lock for the moment it starts. That is harmless on a
secondary and would stall writers on the primary.

An election during a dump is not a problem. The member being read stays readable
whichever role it ends up holding.

## Restoring

Only the primary accepts a restore. A secondary refuses it.

```
ERROR 1290 (HY000) at line 22: The MySQL server is running with the --super-read-only option so it cannot execute this statement
```

The backup account refuses it too because it holds no write rights.

```
ERROR 1044 (42000) at line 22: Access denied for user 'backup'@'%' to database 'demo'
```

Restore into the primary as root.

```
docker exec -i -e MYSQL_PWD=password "$PRIMARY" mysql -uroot \
  < /var/tmp/mysql-demo/backups/demo-sp.sql
```

The group certifies the restore like any other write and both secondaries follow. A
tested run dropped `demo` on the primary then restored it and all three members returned
40 rows while `ledger` never moved.

The shell load needs one setting turned on first.

```
docker exec -e MYSQL_PWD=password "$PRIMARY" mysql -uroot -e "SET GLOBAL local_infile=ON"
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp --network mysql-sp \
  -v /var/tmp/mysql-demo/backups:/backups mysql:8.4 \
  mysqlsh --uri root:password@mysql-sp-1:3306 --js \
  -e "util.loadDump('/backups/demo-sp-shell',{threads:4})"
```

## What a restore does to the group

A restore is a burst of writes on one member that every other member must apply. Flow
control slows every writer in the group while the applier queues drain. A restore of any
size is felt by the application. Run it in a window.

The transaction size limit in [readme.md](readme.md) is reachable by a restore alone.
`mysqldump` packs many rows into one INSERT so a wide table can produce a statement over
the limit. `--net-buffer-length` bounds each generated statement.

## Point in time recovery

The procedure is the one in [design_a_async.md](design_a_async.md). Read the binary log
from a secondary rather than the primary. Restore the dump and replay onto a scratch
server then import the recovered table into the primary as ordinary DML. Because a) the
group already holds those transactions so a direct replay is discarded and b) the replay
would carry the accident with it.
