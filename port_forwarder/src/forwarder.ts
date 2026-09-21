import * as vscode from 'vscode';

import type { WantedPort } from './model.js';

/** One port this extension has asked the editor to forward. */
export interface Forwarded {
	key: string;
	label: string;
	/** What the port is called on the remote machine. */
	remote: string;
	/** What it is called on this machine. */
	local: string;
	hostPort: number;
}

const ASK_TIMEOUT_MS = 15_000;

function withTimeout<T>(work: Thenable<T>, ms: number, what: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
		work.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}

/**
 * Holds what has been forwarded. asExternalUri is the whole mechanism. The editor
 * owns the tunnel once it exists so there is nothing here to close.
 */
export class Forwarder {
	private readonly open = new Map<string, Forwarded>();

	constructor(private readonly log: vscode.LogOutputChannel) {}

	list(): Forwarded[] {
		return [...this.open.values()].sort((a, b) => a.hostPort - b.hostPort);
	}

	get count(): number {
		return this.open.size;
	}

	has(key: string): boolean {
		return this.open.has(key);
	}

	/** Forwards everything not already forwarded. Returns only what was added. */
	async add(wanted: readonly WantedPort[]): Promise<Forwarded[]> {
		const added: Forwarded[] = [];
		for (const want of wanted) {
			if (this.open.has(want.key)) {
				continue;
			}
			const remote = `http://${want.host}:${want.hostPort}`;
			try {
				const external = await withTimeout(
					vscode.env.asExternalUri(vscode.Uri.parse(remote)),
					ASK_TIMEOUT_MS,
					`Forwarding ${want.hostPort}`,
				);
				const entry: Forwarded = {
					key: want.key,
					label: want.label,
					remote,
					local: external.toString(true),
					hostPort: want.hostPort,
				};
				this.open.set(want.key, entry);
				added.push(entry);
				this.log.info(`Forwarded ${want.label} at ${entry.local}`);
			} catch (error) {
				this.log.error(`Could not forward ${want.label}. ${String(error)}`);
			}
		}
		return added;
	}

	/** Forgets ports whose container has gone. The tunnel itself is the user's to close. */
	prune(keep: ReadonlySet<string>): Forwarded[] {
		const dropped: Forwarded[] = [];
		for (const [key, entry] of this.open) {
			if (!keep.has(key)) {
				this.open.delete(key);
				dropped.push(entry);
				this.log.info(`No longer published. ${entry.label}`);
			}
		}
		return dropped;
	}

	forget(): void {
		this.open.clear();
	}
}
