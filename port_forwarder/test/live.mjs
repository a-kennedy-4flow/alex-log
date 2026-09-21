// Drives a real daemon. Brings up test/demo/compose.yaml then checks that the
// event watch notices it and that the selection picks the published ports.
// Everything except asExternalUri runs here. That one call needs the editor.

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);
const model = require(join(root, '.test-out', 'model.js'));
const docker = require(join(root, '.test-out', 'docker.js'));

const bin = process.env.DOCKER ?? 'docker';
const file = join(here, 'demo', 'compose.yaml');
const compose = (...args) => run(bin, ['compose', '--file', file, ...args], { timeout: 120_000 });

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(what, predicate, ms = 30_000) {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline) {
		if (predicate()) {
			return true;
		}
		await wait(200);
	}
	console.log(`  FAIL timed out waiting for ${what}`);
	failures += 1;
	return false;
}

const seen = [];
const watch = new docker.EventWatch(bin, {
	onEvent: (event) => {
		if (event.project === 'pfdemo') {
			seen.push(`${event.action} ${event.name}`);
		}
	},
	onTrouble: (message) => console.log(`  note ${message}`),
});

const pick = async () => {
	const containers = await listDemo();
	return model.selectPorts(containers, {
		folders: [root],
		scope: 'workspace',
		ignoredPorts: [],
		includeOneOff: false,
	});
};

const listDemo = async () =>
	(await docker.listComposeContainers(bin)).filter((container) => container.project === 'pfdemo');

try {
	console.log(`talking to docker ${await docker.serverVersion(bin)}`);
	watch.start();
	await wait(500);

	console.log('bringing the project up');
	await compose('up', '--detach');
	await until('a start event', () => seen.filter((line) => line.startsWith('start')).length === 2);
	check('the watch saw both containers start', seen.filter((l) => l.startsWith('start')).length, 2);

	const wanted = await pick();
	check('three ports are picked', wanted.map((port) => port.hostPort), [18080, 18081, 18082]);
	check(
		'the wildcard publishes are dialled at localhost',
		wanted.filter((port) => port.host === 'localhost').map((port) => port.hostPort),
		[18080, 18082],
	);
	check(
		'the loopback publish is dialled at its own address',
		wanted.find((port) => port.hostPort === 18081).host,
		'127.0.0.1',
	);
	check('the label names the project and the service', wanted[0].label, 'pfdemo/web 18080 to 8080/tcp');

	console.log('the published port answers on the remote side');
	const { stdout } = await run('sh', ['-c', `printf 'GET / HTTP/1.0\r\n\r\n' | nc -w 3 localhost 18080 | tail -1`]);
	check('the web service replies through its published port', stdout.trim(), 'hi');

	console.log('taking the project down');
	seen.length = 0;
	await compose('down');
	await until('a die event', () => seen.filter((line) => line.startsWith('die')).length === 2);
	check('the watch saw both containers die', seen.filter((l) => l.startsWith('die')).length, 2);
	check('nothing is picked once the project is gone', await pick(), []);
} catch (error) {
	failures += 1;
	console.log(`  FAIL ${String(error)}`);
} finally {
	watch.dispose();
	await compose('down').catch(() => {});
}

console.log(failures === 0 ? '\nlive tests pass' : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
