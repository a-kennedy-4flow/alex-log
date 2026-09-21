// Hermetic tests. The pure parsing runs against output captured from a real
// daemon. The command line layer runs against test/fake-docker.mjs.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const model = require(join(here, '..', '.test-out', 'model.js'));
const docker = require(join(here, '..', '.test-out', 'docker.js'));

const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
const parseAll = (name) =>
	fixture(name).trim().split('\n').map(model.parseInspectLine).filter(Boolean);

let failures = 0;
function check(name, actual, expected) {
	const a = JSON.stringify(actual);
	const b = JSON.stringify(expected);
	if (a === b) {
		console.log(`  ok   ${name}`);
		return;
	}
	failures += 1;
	console.log(`  FAIL ${name}\n       wanted ${b}\n       got    ${a}`);
}

console.log('parsing an inspect');
const all = parseAll('inspect.jsonl');
const byName = new Map(all.map((c) => [c.name, c]));

check('every fixture line is a compose container', all.length, 18);
check('a stopped container is marked stopped', byName.get('vista-selftest-vista-1').running, false);
check('a stopped container publishes nothing', byName.get('vista-selftest-vista-1').ports, []);
check('project comes off the label', byName.get('polaris-db-1').project, 'polaris');
check('service comes off the label', byName.get('polaris-db-1').service, 'db');
check(
	'the compose file path comes off the label',
	byName.get('polaris-db-1').configFiles,
	['/home/alex/repos/polaris-backend/compose.yaml'],
);

check(
	'a dual stack publish is one port',
	byName.get('polaris-keycloak-1').ports,
	[{ containerPort: 8080, protocol: 'tcp', host: 'localhost', hostPort: 8180 }],
);
check(
	'an unpublished port is left out',
	byName.get('polaris-localstack-1').ports.map((p) => p.hostPort),
	[4566],
);
check(
	'ports come back in host port order',
	byName.get('polaris-rabbitmq-1').ports.map((p) => p.hostPort),
	[5672, 15672, 61613],
);
check(
	'a remapped port keeps both numbers',
	byName.get('polaris-tenant-db-1').ports,
	[{ containerPort: 5432, protocol: 'tcp', host: 'localhost', hostPort: 5433 }],
);
check(
	'udp survives',
	byName.get('valheim-server-valheim-1').ports.map((p) => `${p.hostPort}/${p.protocol}`),
	['2456/udp', '2457/udp', '2458/udp', '9001/tcp'],
);

console.log('parsing the throwaway project');
const demo = new Map(parseAll('demo-inspect.jsonl').map((c) => [c.name, c]));
check(
	'a loopback publish is dialled at its own address',
	demo.get('pfdemo-side-1').ports,
	[
		{ containerPort: 9000, protocol: 'tcp', host: '127.0.0.1', hostPort: 18081 },
		{ containerPort: 9001, protocol: 'udp', host: 'localhost', hostPort: 18082 },
	],
);
check('the label reads well', model.describe(demo.get('pfdemo-web-1'), demo.get('pfdemo-web-1').ports[0]), 'pfdemo/web 18080 to 8080/tcp');

console.log('choosing what to dial');
check('a wildcard binding is localhost', model.dialHost('0.0.0.0'), 'localhost');
check('an empty binding is localhost', model.dialHost(''), 'localhost');
check('the v6 wildcard is localhost', model.dialHost('::'), 'localhost');
check('a v6 address is bracketed', model.dialHost('fd00::1'), '[fd00::1]');
check('a v4 address is kept', model.dialHost('192.168.1.5'), '192.168.1.5');

console.log('parsing events');
const events = fixture('events.jsonl').trim().split('\n').map(model.parseEventLine).filter(Boolean);
check('four events', events.length, 4);
check('two starts and two dies', events.map((e) => e.action), ['start', 'start', 'die', 'die']);
check('the project comes through', new Set(events.map((e) => e.project)).size, 1);
check('rubbish is dropped', model.parseEventLine('not json'), undefined);
check('a container outside compose is dropped', model.parseEventLine('{"Action":"start","Actor":{"ID":"x","Attributes":{}}}'), undefined);

console.log('scoping to the window');
const polaris = byName.get('polaris-db-1');
check('a project under the folder belongs', model.belongsToWorkspace(polaris, ['/home/alex/repos/polaris-backend']), true);
check('a project under a parent folder belongs', model.belongsToWorkspace(polaris, ['/home/alex/repos']), true);
check('another project does not', model.belongsToWorkspace(polaris, ['/home/alex/repos/tracker']), false);
check('a near miss does not', model.belongsToWorkspace(polaris, ['/home/alex/repos/polaris-back']), false);
check('no folders means no match', model.belongsToWorkspace(polaris, []), false);
check('a windows path is matched without case', model.isInside('C:\\Users\\Alex\\Repo', 'c:/users/alex/repo/compose.yaml'), true);

console.log('ignoring ports');
const filter = model.buildPortFilter(['5432', '9000-9100']);
check('a named port is out', filter(5432), false);
check('a port in the span is out', filter(9050), false);
check('the end of the span is out', filter(9100), false);
check('a port past the span is in', filter(9101), true);
check('everything else is in', filter(8080), true);
check('an empty list keeps everything', model.buildPortFilter([])(5432), true);

console.log('spotting a compose command');
for (const line of [
	'docker compose up -d',
	'docker compose -f compose.dev.yaml up',
	'docker-compose up',
	'cd api && docker compose up -d --build',
	'docker compose restart web',
	'docker compose run --rm migrate',
]) {
	check(`yes to ${line}`, model.isComposeCommand(line), true);
}
for (const line of [
	'docker compose down',
	'docker compose ps',
	'docker compose logs -f web',
	'docker run -p 80:80 nginx',
	'npm run up',
	'echo docker compose down && npm start',
]) {
	check(`no to ${line}`, model.isComposeCommand(line), false);
}

console.log('selecting what to forward');
const select = (extra) =>
	model.selectPorts(all, { folders: [], scope: 'all', ignoredPorts: [], includeOneOff: false, ...extra });
check(
	'every published port of every running container',
	select({}).map((w) => w.hostPort),
	[1031, 2456, 2457, 2458, 3000, 3025, 3110, 3143, 3465, 3993, 3995, 4566, 5432, 5433, 5672, 6432, 8180, 9001, 9090, 9092, 15672, 61613],
);
check(
	'the window scope drops the project that lives elsewhere',
	select({ scope: 'workspace', folders: ['/home/alex/repos/polaris-backend'] }).map((w) => w.hostPort),
	[1031, 3000, 3025, 3110, 3143, 3465, 3993, 3995, 4566, 5432, 5433, 5672, 6432, 8180, 9090, 9092, 15672, 61613],
);
check(
	'the window scope falls back to everything when no folder is open',
	select({ scope: 'workspace', folders: [] }).length,
	22,
);
check(
	'ignored ports are held back',
	select({ ignoredPorts: ['5432', '3000-3999'] }).map((w) => w.hostPort),
	[1031, 2456, 2457, 2458, 4566, 5433, 5672, 6432, 8180, 9001, 9090, 9092, 15672, 61613],
);
check('a key is the address and the port', select({}).at(0).key, 'localhost:1031');

console.log('the command line layer');
const fake = join(here, 'fake-docker.mjs');
check('the daemon version comes back', await docker.serverVersion(fake), '29.8.0');
const listed = await docker.listComposeContainers(fake);
check('the list is the fixture', listed.length, 18);
check('the list is parsed', listed[0].project, 'polaris');
try {
	await docker.serverVersion(join(here, 'no-such-docker'));
	check('a missing binary throws', 'no throw', 'a throw');
} catch (error) {
	check('a missing binary throws a DockerError', error instanceof docker.DockerError, true);
}

const seen = [];
const trouble = [];
const watch = new docker.EventWatch(fake, {
	onEvent: (event) => seen.push(event.action),
	onTrouble: (reason, retryInMs) => trouble.push({ reason, retryInMs }),
});
watch.start();
await new Promise((resolve) => setTimeout(resolve, 1600));
watch.dispose();
check('the watch read every event across chunk boundaries', seen.slice(0, 4), ['start', 'start', 'die', 'die']);
check('the watch respawns after the stream ends', seen.length > 4, true);
check('the watch reports the stream ending', trouble.length > 0, true);
check('the watch names a stable reason', trouble[0]?.reason, 'exit 0');
check('the first retry is a second away', trouble[0]?.retryInMs, 1000);
check('the backoff widens', (trouble[1]?.retryInMs ?? 0) > (trouble[0]?.retryInMs ?? 0), true);

console.log(failures === 0 ? '\nall tests pass' : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
