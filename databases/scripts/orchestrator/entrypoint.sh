#!/bin/bash
# Render a configuration file then hand over to orchestrator.
#
# A file mounted at the config path is used untouched. Otherwise one is built
# from the environment. The backend defaults to sqlite so the image runs with no
# arguments at all. Setting ORC_DB_HOST switches the backend to MySQL.
#
#   ORC_CONFIG                path of the config file          /etc/orchestrator/orchestrator.conf.json
#   ORC_LISTEN                listen address                   :3000
#   ORC_DEBUG                 verbose logging                  false
#   ORC_AUTO_RECOVER          allow automated failover         false
#   ORC_READ_ONLY             refuse every change. View only   false
#   ORC_DISCOVERY_SEEDS       comma separated host:port list to discover at startup
#   ORC_INSTANCE_POLL_SECONDS poll interval                    5
#   ORC_TOPOLOGY_USER         user orchestrator polls MySQL as  orchestrator
#   ORC_TOPOLOGY_PASSWORD     password for that user            orchestrator
#   ORC_SQLITE_FILE           sqlite backend file              /var/lib/orchestrator/orchestrator.sqlite3
#   ORC_DB_HOST               MySQL backend host. Unset means sqlite
#   ORC_DB_PORT               MySQL backend port               3306
#   ORC_DB_NAME               MySQL backend schema             orchestrator
#   ORC_USER                  MySQL backend user               orc_server_user
#   ORC_PASSWORD              MySQL backend password           orc_server_password

set -euo pipefail

config=${ORC_CONFIG:-/etc/orchestrator/orchestrator.conf.json}

as_bool() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    true | 1 | yes | on) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

if [ -s "$config" ]; then
  echo "orchestrator: using the existing config at $config"
else
  echo "orchestrator: rendering a config at $config"
  mkdir -p "$(dirname "$config")"

  if [ -n "${ORC_DB_HOST:-}" ]; then
    backend=$(
      cat <<JSON
  "BackendDB": "mysql",
  "MySQLOrchestratorHost": "${ORC_DB_HOST}",
  "MySQLOrchestratorPort": ${ORC_DB_PORT:-3306},
  "MySQLOrchestratorDatabase": "${ORC_DB_NAME:-orchestrator}",
  "MySQLOrchestratorUser": "${ORC_USER:-orc_server_user}",
  "MySQLOrchestratorPassword": "${ORC_PASSWORD:-orc_server_password}",
JSON
    )
  else
    backend=$(
      cat <<JSON
  "BackendDB": "sqlite",
  "SQLite3DataFile": "${ORC_SQLITE_FILE:-/var/lib/orchestrator/orchestrator.sqlite3}",
JSON
    )
  fi

  # A read only instance refuses the discover action so seeds are the only way
  # to tell it what to look at. Seeding happens inside the orchestrator loop
  # rather than through the API so the read only check never sees it.
  if [ -n "${ORC_DISCOVERY_SEEDS:-}" ]; then
    seeds=$(printf '%s' "${ORC_DISCOVERY_SEEDS}" | jq -Rc 'split(",") | map(sub("^ +"; "") | sub(" +$"; "")) | map(select(length > 0))')
  else
    seeds='[]'
  fi

  # An empty filter list means orchestrator reports a failure and waits for a
  # human. A list of "*" means it promotes a replica by itself.
  if [ "$(as_bool "${ORC_AUTO_RECOVER:-false}")" = true ]; then
    recovery='["*"]'
  else
    recovery='[]'
  fi

  cat > "$config" <<JSON
{
  "Debug": $(as_bool "${ORC_DEBUG:-false}"),
  "ListenAddress": "${ORC_LISTEN:-:3000}",
  "ReadOnly": $(as_bool "${ORC_READ_ONLY:-false}"),
  "DiscoverySeeds": ${seeds},
${backend}
  "MySQLTopologyUser": "${ORC_TOPOLOGY_USER:-orchestrator}",
  "MySQLTopologyPassword": "${ORC_TOPOLOGY_PASSWORD:-orchestrator}",
  "MySQLTopologySSLSkipVerify": true,
  "MySQLConnectTimeoutSeconds": 2,
  "DefaultInstancePort": 3306,
  "InstancePollSeconds": ${ORC_INSTANCE_POLL_SECONDS:-5},
  "DiscoverByShowSlaveHosts": false,
  "HostnameResolveMethod": "default",
  "MySQLHostnameResolveMethod": "@@hostname",
  "ReasonableReplicationLagSeconds": 10,
  "FailureDetectionPeriodBlockMinutes": 60,
  "RecoveryPeriodBlockSeconds": 30,
  "ApplyMySQLPromotionAfterMasterFailover": true,
  "DetachLostReplicasAfterMasterFailover": true,
  "RecoverMasterClusterFilters": ${recovery},
  "RecoverIntermediateMasterClusterFilters": ${recovery}
}
JSON

  # Fail here rather than inside orchestrator with a less obvious message.
  jq -e . "$config" > /dev/null || {
    echo "orchestrator: the rendered config is not valid JSON" >&2
    exit 1
  }
fi

exec /usr/local/orchestrator/orchestrator -config "$config" "$@"
