# Backing up one database in design E

Design E is design C with a ProxySQL router in front. Read
[design_c_multi_primary.md](design_c_multi_primary.md) for the backup itself. This
document covers only what the router changes.

| Item | Value |
| --- | --- |
| Members | `mysql-mp-1` and `mysql-mp-2` and `mysql-mp-3` |
| Router | `proxysql-mp` on 6326 client and 6426 admin |
| Network | `mysql-mp` |
| Take the backup from | a member directly |
| Restore into | one member you choose yourself |

## The router names three writers

```
docker exec -e MYSQL_PWD=radmin mysql-mp-1 mysql -h proxysql-mp -P 6032 -u radmin --table \
  -e "SELECT hostgroup_id, hostname, status FROM runtime_mysql_servers ORDER BY hostgroup_id, hostname"
```

```
+--------------+------------+--------+
| hostgroup_id | hostname   | status |
+--------------+------------+--------+
| 10           | mysql-mp-1 | ONLINE |
| 10           | mysql-mp-2 | ONLINE |
| 10           | mysql-mp-3 | ONLINE |
| 11           | mysql-mp-1 | ONLINE |
| 11           | mysql-mp-2 | ONLINE |
| 11           | mysql-mp-3 | ONLINE |
+--------------+------------+--------+
```

Every member sits in both hostgroups. So the query design D uses to find its restore
target returns three names here and answers nothing. Use it to check that all three are
`ONLINE` rather than to pick one.

The router is worth reading for a second reason. A `SHUNNED` member is one ProxySQL has
taken out of service. It is a poor backup source whatever the group says about it.

## Taking the backup

Against a member. The reasons are the ones in
[design_d_routed_single_primary.md](design_d_routed_single_primary.md) and the first of
them is enough on its own. ProxySQL does not know the backup account.

```
docker exec -e MYSQL_PWD=backup mysql-mp-3 \
  mysqldump -ubackup --single-transaction --set-gtid-purged=OFF \
  --routines --events --databases demo > /var/tmp/mysql-demo/backups/demo-mp.sql
```

## Restoring

Quiesce the schema first. The failure in
[design_c_multi_primary.md](design_c_multi_primary.md) is the same failure here and the
router makes it easier to reach. Because a) all three members accept writes so an
application write can arrive anywhere during the restore b) the router balances so
quiescing one member proves nothing about the other two and c) the members that break go
read only rather than announce themselves.

Then restore against a member and not through the router. Six write transactions sent
through the router in six sessions were served by two different members.

```
for i in $(seq 1 6); do
  docker exec -e MYSQL_PWD=app mysql-mp-1 mysql -h proxysql-mp -P 6033 -u app demo \
    --skip-column-names --batch -e "START TRANSACTION; SELECT @@hostname; COMMIT"
done | sort | uniq -c
      2 mysql-mp-1
      4 mysql-mp-2
```

One `mysql` client is one session so a single restore file stays on one member. A restore
split across sessions does not. That is a restore arriving on two members at once which
is the case design C shows breaking the group.

```
docker exec -i -e MYSQL_PWD=password mysql-mp-1 mysql -uroot \
  < /var/tmp/mysql-demo/backups/demo-mp.sql
```

## Draining a member instead of quiescing the schema

Design E can take one member out of rotation and leave the application running on the
other two.

```
docker exec -e MYSQL_PWD=radmin mysql-mp-1 mysql -h proxysql-mp -P 6032 -u radmin \
  -e "UPDATE mysql_servers SET status='OFFLINE_SOFT' WHERE hostname='mysql-mp-1';
      LOAD MYSQL SERVERS TO RUNTIME;"
```

`OFFLINE_SOFT` lets open transactions finish and refuses new ones. This is worth having
for a backup that must not compete with clients. It is not a substitute for the quiesce
before a restore. Because the drained member still applies every transaction the other
two certify.

Put it back afterwards.

```
docker exec -e MYSQL_PWD=radmin mysql-mp-1 mysql -h proxysql-mp -P 6032 -u radmin \
  -e "UPDATE mysql_servers SET status='ONLINE' WHERE hostname='mysql-mp-1';
      LOAD MYSQL SERVERS TO RUNTIME;"
```

`LOAD MYSQL SERVERS TO RUNTIME` replaces the runtime table with the configured one so
hostgroup 11 disappears from `runtime_mysql_servers` for as long as that takes. The
monitor rebuilds both hostgroups from
`performance_schema.replication_group_members` within fifteen seconds. Setting a member
back by hand only shortens the wait.

## What is unchanged from design C

The consistency setting. The quiesce. The primary key requirement. The repair for a
member that left the group. Point in time recovery. All of it is in
[design_c_multi_primary.md](design_c_multi_primary.md).
