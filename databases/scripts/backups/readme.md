# Backing up one database

One document covers each of the five designs. This page holds what they share so no
design repeats it.

| Design | Document | Backup taken from | Restored into |
| --- | --- | --- | --- |
| A asynchronous | [design_a_async.md](design_a_async.md) | either replica | the source only |
| B single primary | [design_b_single_primary.md](design_b_single_primary.md) | any online secondary | the elected primary |
| C multi primary | [design_c_multi_primary.md](design_c_multi_primary.md) | any member | one member with the schema quiesced |
| D routed single primary | [design_d_routed_single_primary.md](design_d_routed_single_primary.md) | any online secondary | the writer the router names |
| E routed multi primary | [design_e_routed_multi_primary.md](design_e_routed_multi_primary.md) | any member | one member you choose yourself |

[mysql_clusters.md](../mysql_clusters.md) describes the designs themselves.

## Terms

* **database** one schema inside a member. This is the unit every document here backs up.
* **logical backup** a file of SQL statements that recreates a schema.
* **physical backup** a copy of the whole data directory.
* **point in time recovery** restoring a backup then replaying the binary log up to a chosen transaction.
* **quiesce** stopping every write to a schema for the length of an operation.

Member and primary and quorum and certification and distributed recovery are defined
in [mysql_clusters.md](../mysql_clusters.md).

## The backup account

Create it on the writable node of a stack. Replication carries it to the rest.

```sql
CREATE USER 'backup'@'%' IDENTIFIED BY 'backup';
GRANT SELECT, SHOW VIEW, EVENT, TRIGGER, LOCK TABLES ON *.* TO 'backup'@'%';
GRANT RELOAD, PROCESS, REPLICATION CLIENT, REPLICATION SLAVE, BACKUP_ADMIN ON *.* TO 'backup'@'%';
```

`REPLICATION SLAVE` is only needed for point in time recovery. Without it a remote
binary log read is refused. `BACKUP_ADMIN` is only needed by `mysqlsh`.

The account cannot restore. A restore runs as `root` or as an account granted writes
on the target schema.

## The tools

The `mysql:8.4` image carries `mysqldump` and `mysqlsh`. It has no `mysqlbinlog` and no
`xtrabackup`. `percona/pmm-client:3.9.0` carries `mysqlbinlog`. The pmm tags use that
image so a monitored stack has already pulled it.

`mysqldump` writes one SQL file. `mysqlsh` writes a directory of compressed TSV with a
recorded binary log position. Use `mysqldump` for a small schema. Use `mysqlsh` for
anything large because it dumps and loads on several threads.

Dumps are written to `/var/tmp/mysql-demo/backups` beside the rendered router
configuration.

## Rules that hold for every design

A partial dump must not carry a GTID position. `--set-gtid-purged=ON` on a single
database records the transactions of the whole server. A scratch server restored from
a 40 row dump of `demo` then claimed 21 transactions it had never run including the
writes to `ledger`. Use `OFF` for a restore into a live server. Use `COMMENTED` when
the position is wanted for point in time recovery.

A group member refuses the position outright.

```
ERROR 3911 (HY000) at line 24: Cannot update GTID_PURGED with the Group Replication plugin running
```

A table with no primary key cannot enter a group. Designs B to E refuse it with error
3098 and the restore stops there. Check a dump taken from design A before loading it
into a group.

A restore is ordinary DML and DDL. It replicates like any other write. Restoring one
database leaves every other database on the member untouched.

`group_replication_transaction_size_limit` is 150000000 bytes. One statement above that
is refused. `mysqldump --net-buffer-length` bounds the size of each generated INSERT.

`mysqlsh` runs as root inside the container so its output is unreadable to the host user.
Pass the host identity and a writable home.

```
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp ...
```

`util.loadDump` needs `local_infile=ON` in the target server. It is off by default and
the load fails with `MYSQLSH 53025`.

## Verifying a backup

Restore every backup once before trusting it. Load it into a scratch server and count
what came back.

```
docker run -d --name mysql-verify -e MYSQL_ROOT_PASSWORD=password \
  -v /var/tmp/mysql-demo/backups:/backups:ro mysql:8.4
docker exec -i -e MYSQL_PWD=password mysql-verify mysql -uroot < /var/tmp/mysql-demo/backups/demo-sp.sql
docker exec -e MYSQL_PWD=password mysql-verify mysql -uroot -e "SELECT COUNT(*) FROM demo.t"
docker rm -f mysql-verify
```

The scratch server has no group plugin so it accepts a dump that a member would refuse.
That is what makes it a test of the file rather than a test of the cluster.
