#!/usr/bin/env node
// Stands in for the docker command line. Serves the captured fixtures so the
// tests never need a daemon.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
const [command] = process.argv.slice(2);

if (command === 'version') {
	process.stdout.write('29.8.0\n');
} else if (command === 'ps') {
	const ids = fixture('inspect.jsonl').trim().split('\n').map((line) => JSON.parse(line).Id.slice(0, 12));
	process.stdout.write(ids.join('\n') + '\n');
} else if (command === 'inspect') {
	process.stdout.write(fixture('inspect.jsonl'));
} else if (command === 'events') {
	// Dribble the lines out so the reader has to join partial chunks.
	const lines = fixture('events.jsonl').trim().split('\n');
	let index = 0;
	const tick = () => {
		if (index >= lines.length) {
			process.exit(Number(process.env.FAKE_DOCKER_EVENTS_EXIT ?? 0));
		}
		const line = lines[index++];
		process.stdout.write(line.slice(0, 20));
		setTimeout(() => {
			process.stdout.write(line.slice(20) + '\n');
			setTimeout(tick, 5);
		}, 5);
	};
	tick();
} else {
	process.stderr.write(`fake docker does not know "${command}"\n`);
	process.exit(1);
}
