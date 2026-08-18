# Five MySQL cluster designs

Five stacks wire the same three MySQL containers five different ways. Each stack
runs on its own network with its own names and its own host ports. Designs D and
E reuse the networks and containers of designs B and C and add a router and a
read only orchestrator on top.

| Design | Role | Writes | Failover | Host ports | Network |
| --- | --- | --- | --- | --- | --- |
| A asynchronous | `mysql_docker_cluster` | source only | manual | 3306 3307 3308 | `mysql-async` |
| B single primary | `mysql_docker_single_primary` | primary only | automatic election | 3316 3317 3318 | `mysql-sp` |
| C multi primary | `mysql_docker_multi_primary` | every member | automatic election | 3326 3327 3328 | `mysql-mp` |
| D routed single primary | B plus `proxysql_single_primary` | primary only | automatic election | 6316 client 6416 admin | `mysql-sp` |
| E routed multi primary | C plus `proxysql_multi_primary` | every member | automatic election | 6326 client 6426 admin | `mysql-mp` |

Each design owns a role and a fact namespace of its own. Design A uses `mysql_async_`
and design B uses `mysql_sp_` and design C uses `mysql_mp_`. Because a) a fact set in one
play survives into the next play for the same host b) a shared namespace would let one
design inherit the ports of another and c) an independent role can be edited without
disturbing the design beside it.

Designs B and C differ in two startup flags. Design B sets
`group_replication_single_primary_mode=ON` with update everywhere checks off. Design C
inverts both.

## Terms

* **member** a mysqld instance that belongs to a group.
* **primary** a member that accepts writes.
* **quorum** the majority of members needed to agree a write.
* **certification** the conflict check that decides which of two competing writes survives.
* **distributed recovery** the process a returning member uses to fetch the transactions it missed.

## Running a design

```
ansible-playbook -i hosts mysql_clusters.yml --tags async
ansible-playbook -i hosts mysql_clusters.yml --tags single
ansible-playbook -i hosts mysql_clusters.yml --tags multi
ansible-playbook -i hosts mysql_clusters.yml --tags routed-single
ansible-playbook -i hosts mysql_clusters.yml --tags routed-multi
ansible-playbook -i hosts mysql_clusters.yml --tags teardown
```

Every play is tagged `never` so nothing runs unless you name a design.
Each play ends by printing the endpoints and the group membership.
Every play is safe to re-run. A second run reports no changes.

Tear down before switching a stack to a different design. Because a) a data volume
carries the transaction history of the design that created it b) group settings must
match across all members and c) a member whose history the group has never seen is
refused with error 3092.

## What each design demonstrates

### Design A asynchronous replication

The source acknowledges a commit before the replicas have seen it. Lose the source
and you lose whatever had not yet reached a replica. Promotion is a manual act.

```
docker exec -e MYSQL_PWD=password mysql-async-1 mysql -uroot \
  -e "CREATE DATABASE demo; CREATE TABLE demo.t (id INT PRIMARY KEY); INSERT INTO demo.t VALUES (1);"
docker exec -e MYSQL_PWD=password mysql-async-2 mysql -uroot -e "SELECT * FROM demo.t"
docker exec -e MYSQL_PWD=password mysql-async-2 mysql -uroot -e "INSERT INTO demo.t VALUES (2)"
```

The last command fails. The replicas run with `super_read_only` on.

### Design B group replication with a single primary

Stop the primary and the remaining two members form a quorum and elect a replacement.

```
docker stop mysql-sp-1
docker exec -e MYSQL_PWD=password mysql-sp-2 mysql -uroot \
  -e "SELECT member_host, member_state, member_role FROM performance_schema.replication_group_members"
```

Re-run the play to bring the stopped member back. It rejoins as a secondary and
distributed recovery fetches everything it missed.

### Design C group replication with every member writable

Two members updating the same row at the same time is settled by certification.
The loser is rolled back at commit time with error 1180.

```
docker exec -e MYSQL_PWD=password mysql-mp-1 mysql -uroot \
  -e "BEGIN; UPDATE demo.t SET note='mp-1' WHERE id=1; SELECT SLEEP(4); COMMIT;" &
docker exec -e MYSQL_PWD=password mysql-mp-2 mysql -uroot \
  -e "BEGIN; UPDATE demo.t SET note='mp-2' WHERE id=1; SELECT SLEEP(4); COMMIT;" &
wait
```

### Design D a single primary group behind a router

Designs B and C elect a primary but neither publishes the result. A client is
left holding a connection to a server that has become read only. ProxySQL closes
that gap. One endpoint keeps pointing at whichever member is currently writable.

Every statement goes through `127.0.0.1:6316` as the `app` user. Reads land on a
secondary and writes land on the primary.

```
docker exec -e MYSQL_PWD=app mysql-sp-1 mysql -h proxysql-sp -P 6033 -u app demo \
  -e "INSERT INTO t (who) VALUES (@@hostname); SELECT @@hostname AS served_the_read"
```

Now kill the primary while a client keeps writing. Not one write is lost and the
client never learns a new address.

```
for i in $(seq 1 16); do
  docker exec -e MYSQL_PWD=app mysql-sp-3 mysql -h proxysql-sp -P 6033 -u app demo \
    -e "INSERT INTO t (who) VALUES (@@hostname)" && echo "$i ok"
  sleep 2
done &
sleep 6 && docker stop mysql-sp-1
```

Then ask which member served what.

```
docker exec -e MYSQL_PWD=app mysql-sp-3 mysql -h proxysql-sp -P 6033 -u app demo \
  -e "SELECT who, COUNT(*) FROM t GROUP BY who"
```

The router state lives on the admin port.

```
docker exec -e MYSQL_PWD=radmin mysql-sp-1 mysql -h proxysql-sp -P 6032 -u radmin \
  -e "SELECT hostgroup_id, hostname, status FROM runtime_mysql_servers"
```

Hostgroup 10 is the writer and 11 the readers and 12 the reserve writers and 13
the offline set. A member ProxySQL has taken out of service reads as `SHUNNED`.

### Design E a multi primary group behind a router

Every member of design C accepts writes so there is no primary to chase. All
three sit in the writer hostgroup and the router balances writes across them.

```
for i in $(seq 1 15); do
  docker exec -e MYSQL_PWD=app mysql-mp-1 mysql -h proxysql-mp -P 6033 -u app demo \
    -e "INSERT INTO t (who) VALUES (@@hostname)"
done
docker exec -e MYSQL_PWD=app mysql-mp-1 mysql -h proxysql-mp -P 6033 -u app demo \
  -e "SELECT who, COUNT(*) FROM t GROUP BY who"
```

Stop one member and the writes carry on across the other two.

### The read only orchestrator

Designs B and C and D and E all carry an orchestrator that views the topology and
changes nothing. It is the same `orchestrator_observer` role and the same
container in each case. The B and D plays share it on `127.0.0.1:6516` and the C
and E plays share it on `127.0.0.1:6526`. Running `routed-single` after `single`
adds the router beside an observer that is already there. Both use the image in
[orchestrator](orchestrator/readme.md).

The observer parameters are written once per stack as a YAML anchor and reused by
the routed play. Because a) the two plays must agree on the container name and
the port b) repeating the block invites one copy drifting from the other and c)
Ansible handles anchors natively.

```
docker exec -e ORCHESTRATOR_API=http://127.0.0.1:3000/api orchestrator-sp \
  orchestrator-client -c topology -i mysql-sp-1:3306
```

Read only is enforced by orchestrator itself and every change is refused with
`Unauthorized`. That includes the discover action so the instances to watch are
handed over as `DiscoverySeeds` at startup instead.

A single primary group draws as one tree. The primary is the root and the
secondaries hang beneath it marked with `‡` rather than the `+` used for ordinary
replicas.

```
mysql-sp-1:3306     [0s,ok,8.4.11,rw,ROW,>>,GTID]
‡ mysql-sp-2:3306 [0s,ok,8.4.11,ro,ROW,>>,GTID]
‡ mysql-sp-3:3306 [0s,ok,8.4.11,ro,ROW,>>,GTID]
```

A multi primary group draws as three separate single node clusters. Orchestrator
builds a tree from replication relationships and in multi primary mode there are
none to build from. Every member is simply writable.

```
mysql-mp-1:3306 [0s,ok,8.4.11,rw,ROW,>>,GTID]
mysql-mp-2:3306 [0s,ok,8.4.11,rw,ROW,>>,GTID]
mysql-mp-3:3306 [0s,ok,8.4.11,rw,ROW,>>,GTID]
```

So the observer earns its place on designs B and D and is thinner on C and E.

The role does not return until every instance reports a real MySQL version.
A seeded instance appears immediately carrying the literal string `Unknown` as
its version so counting rows or testing for a value both pass on a placeholder.
Only a version starting with a digit means the poller has reached the instance.

## Settings worth knowing

The image is pinned to `mysql:8.4`. Because a) it is an LTS release b) the replication
statements used here are documented for it and c) the `mysql:latest` tag now resolves to
a 26.x calendar release whose behaviour differs.

`mysql_sp_reset_local_gtids` and `mysql_mp_reset_local_gtids` default to true and exist
for one reason. The image
entrypoint loads the timezone tables during initialisation and writes them to the binary
log. Every member therefore owns a private transaction history that the group has never
seen. The role clears that history with `RESET BINARY LOGS AND GTIDS` before a member
joins. The table contents stay in place and only the record of how they arrived is
discarded. The reset is skipped for any member that is serving the group or that already
carries transactions stamped with the group name. Set it to false for anything that is
not a demo.

Passwords default to `password` and `replication` and `app` and `monitor` and `radmin`
and are plain text in the roles. That is deliberate for a demo. Use `ansible-vault` for
anything else.

ProxySQL is pinned to `proxysql/proxysql:3.0.10`. Because a) MySQL Router needs the
InnoDB Cluster metadata that plain group replication does not have b) ProxySQL follows an
election natively through `mysql_group_replication_hostgroups` and c) release 3.0 reads
`performance_schema.replication_group_members` directly so the
`sys.gr_member_routing_candidate_status` view that older releases needed is not created.

ProxySQL persists its configuration to its own database and ignores the config file on
later starts. The container therefore runs with `--initial` so the rendered file at
`/var/tmp/mysql-demo/proxysql-*/proxysql.cnf` stays the single source of truth. The
`admin` account only answers inside the container. `radmin` is the one that answers over
the network.
