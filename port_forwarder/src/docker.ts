// The docker command line. No vscode import so test/run.mjs can point this at a
// fake docker on PATH.

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import {
	INSPECT_FORMAT,
	PROJECT_LABEL,
	parseEventLine,
	parseInspectLine,
	type ComposeContainer,
	type ComposeEvent,
} from './model.js';

const RUN_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 30_000;
/** A watch that lasted this long counts as healthy so the backoff starts over. */
const HEALTHY_MS = 10_000;

export class DockerError extends Error {}

function run(bin: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			bin,
			args,
			{ timeout: RUN_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, env: process.env },
			(error, stdout, stderr) => {
				if (error) {
					const detail = String(stderr || error.message).trim().split('\n')[0];
					reject(new DockerError(`${bin} ${args[0]} failed. ${detail}`));
					return;
				}
				resolve(stdout);
			},
		);
	});
}

/** Reads the daemon version. Throws when there is no daemon to talk to. */
export async function serverVersion(bin: string): Promise<string> {
	const out = await run(bin, ['version', '--format', '{{.Server.Version}}']);
	return out.trim();
}

/** Every compose container the daemon knows about, running or not. */
export async function listComposeContainers(bin: string): Promise<ComposeContainer[]> {
	const ids = (await run(bin, ['ps', '--all', '--quiet', '--filter', `label=${PROJECT_LABEL}`]))
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (ids.length === 0) {
		return [];
	}
	const out = await run(bin, ['inspect', '--format', INSPECT_FORMAT, ...ids]);
	return out
		.split('\n')
		.map(parseInspectLine)
		.filter((c): c is ComposeContainer => c !== undefined);
}

/** Splits a stream into lines and hands each one to the sink. */
function lineReader(sink: (line: string) => void): (chunk: Buffer | string) => void {
	let pending = '';
	return (chunk) => {
		pending += chunk.toString();
		const lines = pending.split('\n');
		pending = lines.pop() ?? '';
		for (const line of lines) {
			sink(line);
		}
	};
}

export interface EventWatchHandlers {
	onEvent: (event: ComposeEvent) => void;
	/**
	 * Called once per failed attempt. The watch keeps retrying regardless. The
	 * reason is stable across attempts so a caller can hold its tongue.
	 */
	onTrouble: (reason: string, retryInMs: number) => void;
}

/**
 * Follows container start and die events for compose containers. The stream ends
 * whenever the daemon restarts so it is respawned with a widening backoff.
 */
export class EventWatch {
	private child: ChildProcessWithoutNullStreams | undefined;
	private timer: NodeJS.Timeout | undefined;
	private delay = FIRST_RETRY_MS;
	private stopped = false;

	constructor(
		private readonly bin: string,
		private readonly handlers: EventWatchHandlers,
	) {}

	start(): void {
		this.stopped = false;
		this.spawnOnce();
	}

	dispose(): void {
		this.stopped = true;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.child?.kill();
		this.child = undefined;
	}

	private spawnOnce(): void {
		if (this.stopped) {
			return;
		}
		const startedAt = Date.now();
		let child: ChildProcessWithoutNullStreams;
		try {
			child = spawn(
				this.bin,
				[
					'events',
					'--filter', 'type=container',
					'--filter', 'event=start',
					'--filter', 'event=die',
					'--format', '{{json .}}',
				],
				{ env: process.env },
			);
		} catch (error) {
			this.retry(String(error));
			return;
		}
		this.child = child;

		child.stdout.on('data', lineReader((line) => {
			const event = parseEventLine(line);
			if (event) {
				this.handlers.onEvent(event);
			}
		}));

		let stderr = '';
		child.stderr.on('data', (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-2_000);
		});

		const ended = (reason: string) => {
			if (this.child !== child) {
				return;
			}
			this.child = undefined;
			if (Date.now() - startedAt > HEALTHY_MS) {
				this.delay = FIRST_RETRY_MS;
			}
			this.retry(reason);
		};

		child.on('error', (error) => ended(error.message));
		child.on('close', (code) => ended(stderr.trim().split('\n').pop() || `exit ${code}`));
	}

	private retry(reason: string): void {
		if (this.stopped) {
			return;
		}
		this.handlers.onTrouble(reason, this.delay);
		this.timer = setTimeout(() => this.spawnOnce(), this.delay);
		this.delay = Math.min(this.delay * 2, LAST_RETRY_MS);
	}
}
