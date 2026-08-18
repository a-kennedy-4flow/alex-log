#!/bin/bash
# Build the orchestrator image and push it to a local registry.
#
# The orchestrator source tree stays untouched. It is passed to the build as the
# named context "src" so the Dockerfile and the entrypoint beside this script are
# the only files that define the image.
#
# Docker trusts 127.0.0.1 registries without TLS so no daemon configuration is
# needed for the default registry address.

set -euo pipefail

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

source_dir=${ORC_SOURCE_DIR:-/home/alex/repos/orchestrator}
registry=${ORC_REGISTRY:-127.0.0.1:5000}
image_name=${ORC_IMAGE_NAME:-orchestrator}
registry_container=${ORC_REGISTRY_CONTAINER:-local-registry}
registry_image=${ORC_REGISTRY_IMAGE:-registry:2}
smoke_port=${ORC_SMOKE_PORT:-13000}
start_registry=true
do_push=true
do_smoke=true
extra_tags=()

log() { printf '==> %s\n' "$*"; }
die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<TXT
Usage: ${0##*/} [options]

  -s DIR    orchestrator source tree          (default ${source_dir})
  -r ADDR   registry host and port            (default ${registry})
  -n NAME   image name inside the registry    (default ${image_name})
  -t TAG    push an extra tag. Repeatable
  -R        fail rather than start a registry
  -P        build only. Do not push
  -S        skip the smoke test
  -h        this help
TXT
}

while getopts "s:r:n:t:RPSh" flag; do
  case $flag in
    s) source_dir="${OPTARG}" ;;
    r) registry="${OPTARG}" ;;
    n) image_name="${OPTARG}" ;;
    t) extra_tags+=("${OPTARG}") ;;
    R) start_registry=false ;;
    P) do_push=false ;;
    S) do_smoke=false ;;
    h)
      usage
      exit 0
      ;;
    ?)
      usage >&2
      exit 2
      ;;
  esac
done

# Checks first so a missing prerequisite fails in a second rather than after a
# five minute compile.
command -v docker > /dev/null || die "docker is not on PATH"
command -v curl > /dev/null || die "curl is not on PATH"
docker info > /dev/null 2>&1 || die "the docker daemon is not answering"
[ -d "$source_dir" ] || die "no orchestrator source tree at $source_dir"
[ -f "$source_dir/build.sh" ] || die "$source_dir does not look like the orchestrator repository"
[ -f "$here/Dockerfile" ] || die "no Dockerfile beside this script"
[ -f "$here/entrypoint.sh" ] || die "no entrypoint.sh beside this script"

version=$(tr -d '[:space:]' < "$source_dir/RELEASE_VERSION")
[ -n "$version" ] || die "RELEASE_VERSION is empty"
revision=$(git -C "$source_dir" rev-parse --short HEAD 2> /dev/null || echo unknown)
if ! git -C "$source_dir" diff --quiet HEAD 2> /dev/null; then
  revision="${revision}-dirty"
fi

repository="${registry}/${image_name}"
tags=("${version}" "${version}-${revision}" latest)
if [ ${#extra_tags[@]} -gt 0 ]; then
  tags+=("${extra_tags[@]}")
fi

log "source     ${source_dir}"
log "version    ${version}"
log "revision   ${revision}"
log "repository ${repository}"
log "tags       ${tags[*]}"

ensure_registry() {
  if curl -fsS -m 3 "http://${registry}/v2/" > /dev/null 2>&1; then
    log "a registry is already answering at ${registry}"
    return
  fi

  [ "$start_registry" = true ] || die "nothing is answering at ${registry} and -R forbids starting one"

  local host=${registry%%:*}
  local port=${registry##*:}
  [ "$port" != "$registry" ] || port=5000

  if docker inspect "$registry_container" > /dev/null 2>&1; then
    log "starting the existing ${registry_container} container"
    docker start "$registry_container" > /dev/null
  else
    log "creating a ${registry_image} container named ${registry_container} on ${host}:${port}"
    docker run --detach \
      --name "$registry_container" \
      --restart unless-stopped \
      --publish "${host}:${port}:5000" \
      --volume "${registry_container}-data:/var/lib/registry" \
      "$registry_image" > /dev/null
  fi

  local waited=0
  until curl -fsS -m 2 "http://${registry}/v2/" > /dev/null 2>&1; do
    [ "$waited" -lt 30 ] || die "the registry at ${registry} never answered"
    sleep 1
    waited=$((waited + 1))
  done
  log "the registry is answering after ${waited}s"
}

build() {
  local args=()
  local tag
  for tag in "${tags[@]}"; do
    args+=(--tag "${repository}:${tag}")
  done

  log "building. The go compile takes a few minutes on a cold cache"
  docker build \
    --file "$here/Dockerfile" \
    --build-context "src=${source_dir}" \
    --build-arg "RELEASE_VERSION=${version}" \
    --build-arg "VCS_REF=${revision}" \
    --provenance=false \
    "${args[@]}" \
    "$here"
  log "built $(docker image inspect "${repository}:${version}" --format '{{.Id}}') size $(docker image inspect "${repository}:${version}" --format '{{.Size}}' | awk '{printf "%.0fMB", $1/1024/1024}')"
}

smoke_test() {
  local name="${image_name}-smoke"
  log "smoke testing on 127.0.0.1:${smoke_port}"
  docker rm --force "$name" > /dev/null 2>&1 || true
  docker run --detach --name "$name" \
    --publish "127.0.0.1:${smoke_port}:3000" \
    "${repository}:${version}" > /dev/null

  local waited=0
  until [ "$(docker inspect "$name" --format '{{.State.Health.Status}}' 2> /dev/null)" = healthy ]; do
    if [ "$(docker inspect "$name" --format '{{.State.Running}}' 2> /dev/null)" != true ]; then
      docker logs "$name" 2>&1 | tail -20 >&2
      docker rm --force "$name" > /dev/null 2>&1 || true
      die "the container stopped before it became healthy"
    fi
    if [ "$waited" -ge 90 ]; then
      docker logs "$name" 2>&1 | tail -20 >&2
      docker rm --force "$name" > /dev/null 2>&1 || true
      die "the container never became healthy"
    fi
    sleep 2
    waited=$((waited + 2))
  done

  log "healthy after ${waited}s"
  log "api/health   $(curl -fsS "http://127.0.0.1:${smoke_port}/api/health" | head -c 200)"
  log "web ui       HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${smoke_port}/web/clusters")"
  log "client       $(docker exec "$name" orchestrator-client -c help 2>&1 | head -1)"
  docker rm --force "$name" > /dev/null
}

push() {
  local tag
  for tag in "${tags[@]}"; do
    log "pushing ${repository}:${tag}"
    docker push --quiet "${repository}:${tag}" > /dev/null
  done

  log "catalog $(curl -fsS "http://${registry}/v2/_catalog")"
  log "tags    $(curl -fsS "http://${registry}/v2/${image_name}/tags/list")"
  log "digest  $(curl -fsS -I -H 'Accept: application/vnd.oci.image.manifest.v1+json' \
    "http://${registry}/v2/${image_name}/manifests/${version}" \
    | awk 'tolower($1) == "docker-content-digest:" { print $2 }' | tr -d '\r')"
}

if [ "$do_push" = true ]; then
  ensure_registry
fi
build
if [ "$do_smoke" = true ]; then
  smoke_test
fi
if [ "$do_push" = true ]; then
  push
  log "done. Pull it with: docker pull ${repository}:${version}"
else
  log "done. Build only so nothing was pushed"
fi
