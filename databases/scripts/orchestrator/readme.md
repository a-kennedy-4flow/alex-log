# Orchestrator image

Orchestrator discovers MySQL replication topologies and performs failover. It suits
design A in [mysql_clusters.md](../mysql_clusters.md). It has no part to play in either
group replication design because those elect their own primary.

## Build and push

```
./build_and_push.sh
```

That builds the image and smoke tests it and pushes it to `127.0.0.1:5000`. A local
registry is started if nothing answers there. Run `./build_and_push.sh -h` for the flags.

The orchestrator repository is never modified. It arrives as the named build context
`src` so the only files that define the image are the `Dockerfile` and `entrypoint.sh`
beside this readme. Docker trusts `127.0.0.1` registries without TLS so no daemon
configuration is needed.

Tags pushed are the release version and the version with the short commit and `latest`.
A dirty source tree appends `-dirty` to the commit.

## Image

| Property | Value |
| --- | --- |
| Size | 23MB |
| Base | `alpine:3.22` |
| User | `orchestrator` uid 10001 |
| Port | 3000 |
| Health | `curl /api/health` |
| State | `/var/lib/orchestrator` |
| Config | `/etc/orchestrator/orchestrator.conf.json` |

A config file mounted at the config path is used untouched. Otherwise the entrypoint
renders one from the environment. The backend defaults to SQLite so the image runs with
no arguments at all. Setting `ORC_DB_HOST` switches the backend to MySQL. Every variable
is listed at the top of `entrypoint.sh`.

Automated failover is off by default. Set `ORC_AUTO_RECOVER=true` to let orchestrator
promote a replica without being asked.

## View only mode

`ORC_READ_ONLY=true` renders `"ReadOnly": true` which makes orchestrator refuse every
change with `Unauthorized`. Discovery and the topology views carry on working.

The discover action is a change so it is refused too. `ORC_DISCOVERY_SEEDS` is the way in.
It takes a comma separated `host:port` list and orchestrator seeds itself from it at
startup. Seeding runs inside the orchestrator loop rather than through the API so the read
only check never sees it.

```
docker run -d --name orchestrator-sp --network mysql-sp -p 127.0.0.1:6516:3000 \
  -e ORC_READ_ONLY=true \
  -e ORC_TOPOLOGY_USER=orchestrator -e ORC_TOPOLOGY_PASSWORD=orchestrator \
  -e ORC_DISCOVERY_SEEDS=mysql-sp-1:3306,mysql-sp-2:3306,mysql-sp-3:3306 \
  127.0.0.1:5000/orchestrator:4.30.0
```

The `orchestrator_observer` role does exactly this for designs D and E.

## Running it against design A

Orchestrator needs an account on the topology. Create it on the source only. The grant
replicates to both replicas.

```
docker exec -e MYSQL_PWD=password mysql-async-1 mysql -uroot -e "
CREATE USER IF NOT EXISTS 'orchestrator'@'%' IDENTIFIED BY 'orchestrator';
GRANT SUPER, PROCESS, REPLICATION SLAVE, REPLICATION CLIENT, RELOAD ON *.* TO 'orchestrator'@'%';
GRANT SELECT ON mysql.slave_master_info TO 'orchestrator'@'%';"
```

Join the cluster network so the container names resolve.

```
docker run -d --name orchestrator --network mysql-async -p 127.0.0.1:13000:3000 \
  -e ORC_TOPOLOGY_USER=orchestrator -e ORC_TOPOLOGY_PASSWORD=orchestrator \
  127.0.0.1:5000/orchestrator:4.30.0
```

Discover the source and orchestrator crawls the rest.

```
alias oc='docker exec -e ORCHESTRATOR_API=http://127.0.0.1:3000/api orchestrator orchestrator-client'
oc -c discover -i mysql-async-1:3306
oc -c topology -i mysql-async-1:3306
```

The web UI is on http://127.0.0.1:13000/web/clusters.

Promote a replica by hand to see design A gain the failover it otherwise lacks.

```
oc -c graceful-master-takeover -i mysql-async-1:3306 -d mysql-async-2:3306
```

## Vendored Bootstrap

The UI renders unstyled on the upstream template because the integrity hash it declares
for the Bootstrap stylesheet is corrupt and a browser refuses to apply a stylesheet that
fails that check. The image vendors both Bootstrap files into `resources/public` and
rewrites the layout to point at them. The build verifies each download against its sha384
and asserts the rewrite landed so an upstream change to the tag shape fails the build
rather than shipping a silently unstyled UI.

That is a workaround for a bug in the fork. See [upstream-patch.md](upstream-patch.md) for
the one line fix to submit.

## Known wrinkle

Orchestrator reports `GTID:errant` against both replicas. The errant set is the five
timezone transactions that the image entrypoint writes during initialisation. Design A
replicas therefore hold transactions the source has never seen. A graceful takeover still
succeeds. Clearing the replica history with `RESET BINARY LOGS AND GTIDS` before attaching
it would remove the warning and this is the same fix the group replication roles already
apply.
