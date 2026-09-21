# Compose ports on your machine

A docker compose project starts on the remote machine. Its published ports open
on the remote machine. This extension hands each of them to the editor so that
the same port answers on the machine in front of you.

It does nothing in a local window. There is nothing to forward when the daemon
and the browser already share a machine.

Three terms are used throughout. A **published port** is a port a compose service
exposes to its host through the `ports:` key. A **host port** is the number that
port took on the remote machine. **Remote** means the machine the editor server
runs on through Remote SSH or WSL or a dev container or a tunnel.

## Build

```
npm install
npm run build            # bundles out/extension.js
npm run typecheck
npm test                 # 62 checks against captured daemon output
npm run test:live        # 8 checks against a real daemon
npm run package          # produces compose-port-forwarder-0.1.0.vsix
```

Press F5 in VS Code for an extension host. Open a folder on a remote machine and
run `docker compose up -d` in its terminal.

## What it watches

Three things start a sweep. Because a) `docker events` reports a container
starting within milliseconds but is silent when the daemon is down b) a compose
command seen in a terminal arrives before any container exists and covers the
gap while images pull c) a timer catches everything the first two missed.

A sweep asks the daemon for every compose container. It keeps the running ones
whose compose file sits inside a folder of this window. It forwards every host
port they publish.

## Shape

| File | Holds |
| --- | --- |
| `src/model.ts` | Parsing and selection. No import of vscode and no child process. |
| `src/docker.ts` | The docker command line. The event stream and its backoff. |
| `src/forwarder.ts` | The call to `asExternalUri` and the record of what is open. |
| `src/extension.ts` | The remote guard. The three triggers. The status bar and the commands. |
| `test/run.mjs` | Every check that needs no daemon. |
| `test/live.mjs` | Brings a real project up and takes it down again. |
| `test/fake-docker.mjs` | Serves the fixtures in place of docker. |
| `test/fixtures/*.jsonl` | Output captured from a real daemon. |
| `test/demo/compose.yaml` | The project `test/live.mjs` runs. |

## Settings

| Setting | Default | Does |
| --- | --- | --- |
| `composePortForwarder.enabled` | `true` | Turns the whole thing off. |
| `composePortForwarder.dockerPath` | `docker` | The command line to run. Machine scoped. |
| `composePortForwarder.scope` | `workspace` | `workspace` keeps projects whose compose file is inside a folder of this window. `all` keeps every project. |
| `composePortForwarder.ignoredPorts` | `[]` | Host ports to leave alone. A single port is `5432` and a span is `9000-9100`. |
| `composePortForwarder.includeOneOff` | `false` | Also forward containers from `docker compose run`. |
| `composePortForwarder.pollSeconds` | `60` | Seconds between safety sweeps. `0` relies on `docker events` alone. |
| `composePortForwarder.notify` | `status` | `silent` writes only to the log. `status` adds a count to the status bar. `message` raises a notification per port. |

## The six things that decide whether this works

**`env.remoteName` is the guard.** It is `undefined` in a local window and a
string such as `ssh-remote` or `wsl` or `dev-container` otherwise. The extension
registers its triggers only in the second case. `asExternalUri` is documented as
a no-op locally so the guard is belt and braces. It is also what the ask was.

**`asExternalUri` is the whole mechanism.** Passing `http://localhost:8080` to it
from a remote extension host opens a tunnel from this machine to that port and
returns the local address. The editor owns the tunnel from then on. The scheme
has to be `http` for the call to take that path. A tunnel carries bytes so a
database port forwards through an `http` request just as well as a web server.

**`PortAttributesProvider` is not in the stable API.** Labelling a port in the
ports view or setting its auto forward action needs a proposed API and a signed
build. The label lives in the status bar tooltip and the log instead.

**The running container is the source of truth.** The compose file is never read.
Because a) `ports: - "8080"` picks a random host port that only the daemon knows
b) a `.env` file or a profile can change the mapping c) a service that failed to
start has no port to forward. Reading `NetworkSettings.Ports` off the container
answers all three.

**`docker ps --format json` cannot be parsed.** Its `Labels` field is one string
of comma joined pairs and several real label values contain commas. `docker
inspect` with a hand written template returns one line of proper JSON per
container and that is what `src/docker.ts` runs.

**`extensionKind` has to be `workspace`.** The extension has to run beside the
daemon to talk to it. `asExternalUri` only opens a tunnel when it is called from
the remote extension host. A UI extension would see neither.

## What a tunnel does not do

There is no stable API to close one. The editor opened it so the ports view is
where it is closed. When a container stops the extension drops its record and
says so in the log. The count in the status bar is what this extension asked for
and not what the ports view currently holds.

Two containers cannot publish the same host port so the first one found wins.

A port published to one address rather than the wildcard is dialled at that
address. A publish of `127.0.0.1:18081:9000` is forwarded as `127.0.0.1:18081`
because `localhost` on the remote machine may resolve to `::1` first.

## What is proven and what is not

`npm run test:live` brings a two service project up against a real daemon. It
waits for the start events. It checks the three published ports are picked with
the right address each. It reads a reply back off the published port. It takes
the project down and waits for the die events.

The one call that cannot run outside the editor is `asExternalUri`. Test that by
pressing F5 and opening a remote folder.
