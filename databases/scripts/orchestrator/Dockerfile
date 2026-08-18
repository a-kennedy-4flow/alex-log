# syntax=docker/dockerfile:1
#
# Orchestrator image. Orchestrator discovers MySQL replication topologies and
# performs failover. It suits the asynchronous design in mysql_clusters.md and
# has no part to play in either group replication design.
#
# The source tree arrives as the named build context "src" so this file and the
# entrypoint can live outside the orchestrator repository. Build it with
# build_and_push.sh rather than by hand.

ARG GO_IMAGE=golang:1.25.7-alpine3.22
ARG RUNTIME_IMAGE=alpine:3.22

# The web UI loads Bootstrap from a CDN and the integrity hash the template
# declares for the stylesheet is corrupt. It is 63 characters where a sha384 in
# base64 is always 64 and it does not match the file the CDN serves. A browser
# hashes the response and refuses to apply a stylesheet that fails the check so
# the UI renders unstyled. Bootstrap is vendored into the image below and the
# template is pointed at the local copy. See upstream-patch.md.
ARG BOOTSTRAP_VERSION=5.3.3
ARG BOOTSTRAP_CSS_SHA384=QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH
ARG BOOTSTRAP_JS_SHA384=YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz

FROM ${GO_IMAGE} AS build

# build.sh needs bash and rsync. The sqlite backend needs cgo which needs build-base.
RUN apk --no-cache add bash build-base curl git openssl rsync

ARG RELEASE_VERSION
ENV GOPATH=/tmp/go
WORKDIR /src
COPY --from=src . .

# -b builds without packaging so fpm is not needed. -P lays out the install tree.
RUN bash build.sh -b -P -v "${RELEASE_VERSION}"

# build.sh writes one install tree per artifact under /tmp/orchestrator-release.
# Lay both over the filesystem so the runtime stage copies finished paths.
RUN rsync -a "$(find /tmp/orchestrator-release -maxdepth 2 -type d -name orchestrator)/" / \
 && rsync -a "$(find /tmp/orchestrator-release -maxdepth 2 -type d -name orchestrator-client)/" /

# Vendor Bootstrap beside the CSS and JS the project already serves itself. The
# hash is checked here so a bad download fails the build rather than the browser.
ARG BOOTSTRAP_VERSION
ARG BOOTSTRAP_CSS_SHA384
ARG BOOTSTRAP_JS_SHA384
WORKDIR /usr/local/orchestrator
RUN set -eu; \
    base="https://cdn.jsdelivr.net/npm/bootstrap@${BOOTSTRAP_VERSION}/dist"; \
    curl -fsSL "$base/css/bootstrap.min.css" -o resources/public/css/bootstrap.min.css; \
    curl -fsSL "$base/js/bootstrap.bundle.min.js" -o resources/public/js/bootstrap.bundle.min.js; \
    verify() { \
      actual=$(openssl dgst -sha384 -binary "$1" | openssl base64 -A); \
      if [ "$actual" != "$2" ]; then \
        echo "sha384 mismatch for $1" >&2; echo "  expected $2" >&2; echo "  actual   $actual" >&2; \
        exit 1; \
      fi; \
    }; \
    verify resources/public/css/bootstrap.min.css "${BOOTSTRAP_CSS_SHA384}"; \
    verify resources/public/js/bootstrap.bundle.min.js "${BOOTSTRAP_JS_SHA384}"

# Point the layout at the vendored files and drop the integrity attributes with
# them. The grep asserts the rewrite landed so an upstream change to the tag
# shape fails the build rather than shipping a silently unstyled UI.
RUN sed -i \
      -e 's#<link href="https://cdn.jsdelivr.net/npm/bootstrap@[^"]*/dist/css/bootstrap.min.css"[^>]*>#<link href="/css/bootstrap.min.css" rel="stylesheet">#' \
      -e 's#<script src="https://cdn.jsdelivr.net/npm/bootstrap@[^"]*/dist/js/bootstrap.bundle.min.js"[^>]*></script>#<script src="/js/bootstrap.bundle.min.js"></script>#' \
      resources/templates/layout.tmpl \
 && ! grep -q cdn.jsdelivr.net resources/templates/layout.tmpl \
 && grep -q '/css/bootstrap.min.css' resources/templates/layout.tmpl \
 && grep -q '/js/bootstrap.bundle.min.js' resources/templates/layout.tmpl

FROM ${RUNTIME_IMAGE}

ARG RELEASE_VERSION
ARG VCS_REF
LABEL org.opencontainers.image.title="orchestrator" \
      org.opencontainers.image.description="MySQL replication topology manager and failover tool" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/ProxySQL/orchestrator" \
      org.opencontainers.image.licenses="Apache-2.0"

# curl and jq are what orchestrator-client shells out to.
RUN apk --no-cache add bash curl jq tzdata \
 && addgroup -S -g 10001 orchestrator \
 && adduser -S -u 10001 -G orchestrator -h /var/lib/orchestrator orchestrator \
 && mkdir -p /etc/orchestrator /var/lib/orchestrator \
 && chown orchestrator:orchestrator /etc/orchestrator /var/lib/orchestrator

COPY --from=build /usr/local/orchestrator /usr/local/orchestrator
COPY --from=build /usr/bin/orchestrator-client /usr/bin/orchestrator-client
COPY --chmod=0755 entrypoint.sh /usr/local/bin/orchestrator-entrypoint

# The binary tree stays owned by root and is never written to at runtime.
# State lives in /var/lib/orchestrator and the rendered config in /etc/orchestrator.
USER orchestrator
WORKDIR /usr/local/orchestrator
EXPOSE 3000
VOLUME ["/var/lib/orchestrator"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/orchestrator-entrypoint"]
CMD ["http"]
