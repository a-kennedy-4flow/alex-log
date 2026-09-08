# Backing up one database in design D

Design D is design B with a ProxySQL router in front. Read
[design_b_single_primary.md](design_b_single_primary.md) for the backup itself. This
document covers only what the router changes.

| Item | Value |
| --- | --- |
| Members | `mysql-sp-1` and `mysql-sp-2` and `mysql-sp-3` |
| Router | `proxysql-sp` on 6316 client and 6416 admin |
| Network | `mysql-sp` |
| Take the backup from | a member directly |
| Restore into | the member the router names as writer |

## The router is for finding the writer

Designs B and D share a group so they share a backup. The router adds one useful thing
and one hazard. The useful thing is that it already knows which member is writable.

```
docker exec -e MYSQL_PWD=radmin mysql-sp-1 mysql -h proxysql-sp -P 6032 -u radmin --table \
  -e "SELECT hostgroup_id, hostname, status FROM runtime_mysql_servers ORDER BY hostgroup_id, hostname"
```

```
+--------------+------------+--------+
| hostgroup_id | hostname   | status |
+--------------+------------+--------+
| 10           | mysql-sp-1 | ONLINE |
| 11           | mysql-sp-1 | ONLINE |
| 11           | mysql-sp-2 | ONLINE |
| 11           | mysql-sp-3 | ONLINE |
+--------------+------------+--------+
```

Hostgroup 10 holds the writer. Hostgroup 11 holds the readers. A member ProxySQL has
taken out of service reads `SHUNNED` and is not a backup candidate.

```
WRITER=$(docker exec -e MYSQL_PWD=radmin mysql-sp-1 mysql -h proxysql-sp -P 6032 -u radmin --skip-column-names --batch \
  -e "SELECT hostname FROM runtime_mysql_servers WHERE hostgroup_id=10 AND status='ONLINE'")
```

This answers the same question as the group membership query in design B. Either source
is correct. The router is the one the application already trusts.

## Never dump through the router

Connect to the member. Because a) ProxySQL keeps its own user table and the backup
account is not in it b) a consistent snapshot pins the session to the writer hostgroup so
the dump runs on the very member it was meant to spare and c) a session that mixes
statement types is cut off mid stream.

The first reason on its own stops the attempt.

```
mysqldump: Got error: 1045: ProxySQL Error: Access denied for user 'backup'@'172.23.0.4' (using password: YES) when trying to connect
```

The second is the one worth understanding. `runtime_mysql_users` sets
`transaction_persistent` so a transaction stays on one hostgroup. `mysqldump
--single-transaction` opens a transaction before it reads anything.

```
docker exec -e MYSQL_PWD=app mysql-sp-1 mysql -h proxysql-sp -P 6033 -u app demo \
  --skip-column-names --batch -e "START TRANSACTION WITH CONSISTENT SNAPSHOT; SELECT @@hostname; COMMIT"
mysql-sp-1
```

`mysql-sp-1` is the primary. Ten separate sessions reading one statement each spread over
all three members. One session inside a snapshot lands on the writer every time.

The third appears when a restore stream reaches a `SELECT` after its DDL.

```
ERROR 9006 (Y0000) at line 25: ProxySQL Error: connection is locked to hostgroup 10 but trying to reach hostgroup 11
```

So take the backup against the member.

```
docker exec -e MYSQL_PWD=backup mysql-sp-2 \
  mysqldump -ubackup --single-transaction --set-gtid-purged=OFF \
  --routines --events --databases demo > /var/tmp/mysql-demo/backups/demo-sp.sql
```

## Restoring

A restore through the router does land. It also lies about having worked.

```
docker exec -i -e MYSQL_PWD=app mysql-sp-1 mysql -uapp -h proxysql-sp -P 6033 \
  < /var/tmp/mysql-demo/backups/demo-sp.sql
ERROR at line 24: USE must be followed by a database name
```

All three members held the restored rows afterwards. The client still printed an error
and still exited 0. A script reading the exit code learns nothing about either outcome.

Restore against the member the router named.

```
docker exec -i -e MYSQL_PWD=password "$WRITER" mysql -uroot \
  < /var/tmp/mysql-demo/backups/demo-sp.sql
```

The application keeps its endpoint through the whole operation. That is the advantage
design D has over design B. An election during the restore moves the writer and the
clients never learn a new address.

## If the backup must pass through the router

Add the account to ProxySQL and pin it to the writer hostgroup.

```
docker exec -e MYSQL_PWD=radmin mysql-sp-1 mysql -h proxysql-sp -P 6032 -u radmin \
  -e "INSERT INTO mysql_users (username, password, default_hostgroup, transaction_persistent)
      VALUES ('backup', 'backup', 10, 1);
      LOAD MYSQL USERS TO RUNTIME;"
```

The dump then works through the router. It is also served by the primary because the
snapshot pins to hostgroup 10. So the account solves the first reason above and leaves
the second one standing.

The container runs with `--initial` so this is lost on the next rebuild. Add the account
to the role template rather than the running router when it is meant to last.

## What is unchanged from design B

Finding the primary. The GTID rule. The transaction size limit. Flow control. The primary
key requirement. Point in time recovery. All of it is in
[design_b_single_primary.md](design_b_single_primary.md).
