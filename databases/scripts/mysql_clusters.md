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

Percona PMM is an add-on for a stack that is already built.

```
ansible-playbook -i hosts mysql_clusters.yml --tags pmm-server
ansible-playbook -i hosts mysql_clusters.yml --tags pmm-async
ansible-playbook -i hosts mysql_clusters.yml --tags pmm-single
ansible-playbook -i hosts mysql_clusters.yml --tags pmm-multi
ansible-playbook -i hosts mysql_clusters.yml --tags pmm-teardown
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

## Percona PMM

One PMM server serves every design. One client serves one cluster. The server is
standalone so a design teardown leaves it running. The metrics of a stack you have
removed stay readable.

| Client | Stack | Monitored | Networks |
| --- | --- | --- | --- |
| `pmm-client-async` | design A | three MySQL nodes | `mysql-async` and `pmm` |
| `pmm-client-sp` | designs B and D | three MySQL members plus the router once design D has put one there | `mysql-sp` and `pmm` |
| `pmm-client-mp` | designs C and E | three MySQL members plus the router once design E has put one there | `mysql-mp` and `pmm` |

Every client tag builds the server first so one tag is enough on its own. Build the
stack before you monitor it. Run the tag again after adding a router and the router
joins the list.

The web UI is on https://127.0.0.1:8443 as `admin` with the password `password`. It
serves a certificate it signed itself so a browser warns once.

A client is a single pmm-agent container that collects for every member of its
cluster over the network. Because a) the MySQL image carries no agent and installing
one would fork the image b) one agent collects for many remote services and c) an
agent inside a disposable container is registered again on every rebuild.

The monitoring account is created on the writable member and replication carries it
to the rest. The query source is performance schema. Because a) a remote service has
no slow log file the agent can read and b) the slow log is the default source.

Ask a client what it monitors.

```
docker exec pmm-client-sp pmm-admin list
```

Ask the server how many members of each cluster report.

```
docker exec pmm-server curl -s -u admin:password \
  --data-urlencode "query=count(count by (service_name,cluster) (mysql_up)) by (cluster)" \
  http://127.0.0.1:8080/prometheus/api/v1/query
```

Ask query analytics for the statement count per service. Set the window to one that
covers the traffic you generated.

```
docker exec pmm-server curl -s -u admin:password -X POST \
  -H "Content-Type: application/json" \
  -d '{"period_start_from":"2026-08-19T08:00:00Z","period_start_to":"2026-08-19T12:00:00Z","group_by":"service_name","columns":["num_queries"],"order_by":"-num_queries","limit":10}' \
  http://127.0.0.1:8080/v1/qan/metrics:getReport
```

## Backups

One document per design covers how a single database is backed up and restored. The
shared account and the tools and the rules that hold for every design are in
[backups/readme.md](backups/readme.md).

| Design | Document |
| --- | --- |
| A asynchronous | [backups/design_a_async.md](backups/design_a_async.md) |
| B single primary | [backups/design_b_single_primary.md](backups/design_b_single_primary.md) |
| C multi primary | [backups/design_c_multi_primary.md](backups/design_c_multi_primary.md) |
| D routed single primary | [backups/design_d_routed_single_primary.md](backups/design_d_routed_single_primary.md) |
| E routed multi primary | [backups/design_e_routed_multi_primary.md](backups/design_e_routed_multi_primary.md) |

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
and `pmm` and are plain text in the roles. That is deliberate for a demo. Use `ansible-vault` for
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

PMM is pinned to `3.9.0` for the server and for the client.

`PMM_ADMIN_PASSWORD` has no effect on `percona/pmm-server:3.9.0`. A server started
with it on an empty volume refuses `admin` on the first request its API ever sees.
The role asks the API whether the password it wants is already in place and runs
`change-admin-password` when the answer is not 200. A healthy re-run changes nothing.

Grafana locks an account for five minutes after five refused logins. An agent
started against the wrong password retries every five seconds so it locks the
account it is trying to reach. The server therefore runs with
`GF_SECURITY_DISABLE_BRUTE_FORCE_LOGIN_PROTECTION` set. Because a) the server holds
nothing but demo metrics b) the account it protects is the only account there is and
c) one wrong password would otherwise shut the web UI for five minutes.

Each client keeps `pmm-agent.yaml` in a volume named after the client. A
registration holds the node identity that every collected metric is stamped with.
The `PMM_AGENT_SETUP` variable registers again on every container start so a restart
would drop every service. The role registers with `pmm-admin config` instead and
only when the agent reports itself disconnected.
