# Three MySQL cluster designs

Three roles deploy the same three MySQL containers wired three different ways.
Each design runs on its own network with its own names and its own host ports.
All three can run at once. That costs nine MySQL containers.

| Design | Role | Writes | Failover | Host ports | Network |
| --- | --- | --- | --- | --- | --- |
| A asynchronous | `mysql_docker_cluster` | source only | manual | 3306 3307 3308 | `mysql-async` |
| B single primary | `mysql_docker_group_replication` | primary only | automatic election | 3316 3317 3318 | `mysql-sp` |
| C multi primary | `mysql_docker_group_replication` | every member | automatic election | 3326 3327 3328 | `mysql-mp` |

Designs B and C share one role. The difference between them is one setting named
`mysql_group_single_primary`.

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

## Settings worth knowing

The image is pinned to `mysql:8.4`. Because a) it is an LTS release b) the replication
statements used here are documented for it and c) the `mysql:latest` tag now resolves to
a 26.x calendar release whose behaviour differs.

`mysql_group_reset_local_gtids` defaults to true and exists for one reason. The image
entrypoint loads the timezone tables during initialisation and writes them to the binary
log. Every member therefore owns a private transaction history that the group has never
seen. The role clears that history with `RESET BINARY LOGS AND GTIDS` before a member
joins. The table contents stay in place and only the record of how they arrived is
discarded. The reset is skipped for any member that is serving the group or that already
carries transactions stamped with the group name. Set it to false for anything that is
not a demo.

Passwords default to `password` and `replication` and are plain text in the role. That is
deliberate for a demo. Use `ansible-vault` for anything else.
