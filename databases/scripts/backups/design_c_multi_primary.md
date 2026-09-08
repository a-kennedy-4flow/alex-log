# Backing up one database in design C

Design C is a group of three members where every member accepts writes. Read
[readme.md](readme.md) first for the backup account and the tools.

| Item | Value |
| --- | --- |
| Members | `mysql-mp-1` and `mysql-mp-2` and `mysql-mp-3` |
| Host ports | 3326 and 3327 and 3328 |
| Network | `mysql-mp` |
| Take the backup from | any member |
| Restore into | one member with the schema quiesced |

## Where the backup is taken

Any member will do. There is no primary to spare and no secondary to prefer. Check the
member is serving the group before reading it.

```
docker exec -e MYSQL_PWD=password mysql-mp-1 mysql -uroot --table \
  -e "SELECT member_host, member_role, member_state FROM performance_schema.replication_group_members ORDER BY member_host"
```

```
+-------------+-------------+--------------+
| member_host | member_role | member_state |
+-------------+-------------+--------------+
| mysql-mp-1  | PRIMARY     | ONLINE       |
| mysql-mp-2  | PRIMARY     | ONLINE       |
| mysql-mp-3  | PRIMARY     | ONLINE       |
+-------------+-------------+--------------+
```

Every member reads `PRIMARY` here. That is what multi primary means and it is why
picking a member for a backup is arbitrary in this design alone.

## Taking the backup

```
docker exec -e MYSQL_PWD=backup mysql-mp-3 \
  mysqldump -ubackup --single-transaction --set-gtid-purged=OFF \
  --routines --events --databases demo > /var/tmp/mysql-demo/backups/demo-mp.sql
```

A member can be behind the others by the transactions still in its applier queue. A
snapshot on that member is consistent within itself and short of what another member has
already acknowledged. Ask for the stronger guarantee when the backup must match the
group rather than the member.

```
docker exec -e MYSQL_PWD=backup mysql-mp-3 mysql -ubackup \
  -e "SET SESSION group_replication_consistency='BEFORE'"
```

`BEFORE` makes a session wait for every transaction the group has already committed. The
default is `BEFORE_ON_PRIMARY_FAILOVER` which waits only during an election.

## Restoring

Quiesce the schema first. Stop every client writing to `demo` on all three members.

Then restore into one member and one member only.

```
docker exec -i -e MYSQL_PWD=password mysql-mp-1 mysql -uroot \
  < /var/tmp/mysql-demo/backups/demo-mp.sql
```

A tested run dropped `demo` on `mysql-mp-2` then restored it through `mysql-mp-1` and all
three members returned 40 rows while `ledger` never moved.

## Why the schema must be quiesced

This is the failure that separates design C from design B. A restore is DDL. An
application write is DML. Group replication does not support the two arriving on
different members against the same object at the same time.

The test was one member dropping a table while another held an insert into it open.

```
docker exec -e MYSQL_PWD=password mysql-mp-2 mysql -uroot \
  -e "BEGIN; INSERT INTO demo.t (who,note) VALUES (@@hostname,'during-restore'); SELECT SLEEP(5); COMMIT;" &
sleep 2
docker exec -e MYSQL_PWD=password mysql-mp-1 mysql -uroot -e "DROP TABLE demo.t"
wait
```

Both statements reported success. Certification ordered the drop first so the insert
reached the other two members as a row event against a table that had gone.

```
Worker 1 failed executing transaction '22222222-2222-2222-2222-222222222222:1000014';
Error executing row event: 'Table 'demo.t' doesn't exist', Error_code: MY-001146
The applier thread execution was aborted. Unable to process more transactions, this member will now leave the group.
The server was automatically set into read only mode after an error was detected.
```

Two of the three members left the group and went read only. The group carried on with
one member and no quorum to lose.

Repair is manual. A rejoin replays the same transaction and fails the same way so the
transaction has to be marked applied before the member can return.

```
docker exec -e MYSQL_PWD=password mysql-mp-1 mysql -uroot \
  -e "STOP GROUP_REPLICATION;
      SET GTID_NEXT='22222222-2222-2222-2222-222222222222:1000014';
      BEGIN; COMMIT;
      SET GTID_NEXT='AUTOMATIC';"
ansible-playbook -i hosts mysql_clusters.yml --tags multi
```

The empty transaction claims the GTID without doing the work. The row it carried is lost
on every member. That is the cost of the shortcut and it is why the quiesce comes first.

## What this design refuses on top of the shared rules

`group_replication_enforce_update_everywhere_checks` is on here and off in design B. It
adds two refusals to the primary key rule in [readme.md](readme.md). A write to a table
under a cascading foreign key is refused. A `SERIALIZABLE` transaction is refused. Both
report the same error as a missing primary key.

```
ERROR 3098 (HY000): The table does not comply with the requirements by an external plugin.
```

The cascading table is created before the refusal arrives. So a restore loads the schema
and then stops on the first row. Design B accepts both cases so a dump that restored
there proves nothing about here.

Read the schema before loading it.

```
grep -iE "ON DELETE CASCADE|ON UPDATE CASCADE" /var/tmp/mysql-demo/backups/demo-mp.sql
```

## Point in time recovery

The procedure is the one in [design_a_async.md](design_a_async.md). Each member keeps its
own binary log holding the same certified transactions so read whichever one is
convenient. Replay onto a scratch server then import the recovered table into one member
with the schema quiesced.
