import * as vscode from 'vscode';

import { EventWatch, listComposeContainers, serverVersion } from './docker.js';
import { Forwarder, type Forwarded } from './forwarder.js';
import { isComposeCommand, selectPorts } from './model.js';

const SECTION = 'composePortForwarder';
const REMOTE_CONTEXT = 'composePortForwarder.remote';
/** Events arrive one per container so a sweep waits for the rest of the project. */
const COALESCE_MS = 500;
/** A compose command seen in a terminal. Services do not all publish at once. */
const AFTER_COMMAND_MS = [1_500, 5_000, 12_000];
/** How long a repeating complaint stays out of the log. */
const QUIET_MS = 5 * 60_000;

interface Settings {
	enabled: boolean;
	dockerPath: string;
	scope: string;
	ignoredPorts: string[];
	includeOneOff: boolean;
	pollSeconds: number;
	notify: string;
}

function readSettings(): Settings {
	const config = vscode.workspace.getConfiguration(SECTION);
	return {
		enabled: config.get<boolean>('enabled', true),
		dockerPath: config.get<string>('dockerPath', 'docker').trim() || 'docker',
		scope: config.get<string>('scope', 'workspace'),
		ignoredPorts: config.get<string[]>('ignoredPorts', []),
		includeOneOff: config.get<boolean>('includeOneOff', false),
		pollSeconds: config.get<number>('pollSeconds', 60),
		notify: config.get<string>('notify', 'status'),
	};
}

export function activate(context: vscode.ExtensionContext): void {
	const log = vscode.window.createOutputChannel('Compose Port Forwarder', { log: true });
	context.subscriptions.push(log);

	const remoteName = vscode.env.remoteName;
	const isRemote = remoteName !== undefined;
	void vscode.commands.executeCommand('setContext', REMOTE_CONTEXT, isRemote);

	const notRemote = () => {
		const message = 'Compose Port Forwarder only runs in a remote window. This window is local.';
		log.info(message);
		void vscode.window.showInformationMessage(message);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(`${SECTION}.showLog`, () => log.show()),
	);

	if (!isRemote) {
		log.info('Local window. Nothing to forward because the ports are already on this machine.');
		context.subscriptions.push(
			vscode.commands.registerCommand(`${SECTION}.forwardNow`, notRemote),
			vscode.commands.registerCommand(`${SECTION}.showPorts`, notRemote),
		);
		return;
	}

	log.info(`Remote window "${remoteName}". Watching for docker compose projects.`);
	new Session(context, log).start();
}

export function deactivate(): void {
	// Every disposable is on the extension context.
}

function quoted(value: string | vscode.ShellQuotedString): string {
	return typeof value === 'string' ? value : value.value;
}

/** The command line a task will run. Tasks do not report it any other way. */
function taskCommandLine(task: vscode.Task): string {
	const execution = task.execution;
	if (execution instanceof vscode.ShellExecution) {
		if (execution.commandLine) {
			return execution.commandLine;
		}
		const parts = [quoted(execution.command ?? ''), ...(execution.args ?? []).map(quoted)];
		return parts.join(' ');
	}
	if (execution instanceof vscode.ProcessExecution) {
		return [execution.process, ...(execution.args ?? [])].join(' ');
	}
	return task.name;
}

class Session {
	private readonly forwarder: Forwarder;
	private readonly status: vscode.StatusBarItem;
	private settings: Settings;
	private watch: EventWatch | undefined;
	private poll: NodeJS.Timeout | undefined;
	private coalesce: NodeJS.Timeout | undefined;
	private readonly pending = new Set<NodeJS.Timeout>();
	private busy = false;
	private again = false;
	/** When each repeating complaint was last written. */
	private readonly grumbled = new Map<string, number>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly log: vscode.LogOutputChannel,
	) {
		this.forwarder = new Forwarder(log);
		this.settings = readSettings();
		this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.status.command = `${SECTION}.showPorts`;
		context.subscriptions.push(this.status);
	}

	start(): void {
		const { context } = this;
		context.subscriptions.push(
			vscode.commands.registerCommand(`${SECTION}.forwardNow`, () => this.sweep('command')),
			vscode.commands.registerCommand(`${SECTION}.showPorts`, () => this.showPorts()),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration(SECTION)) {
					this.reload();
				}
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule('workspace folders changed')),
			vscode.window.onDidStartTerminalShellExecution((event) => {
				this.onCommand(event.execution.commandLine.value, 'started');
			}),
			vscode.window.onDidEndTerminalShellExecution((event) => {
				this.onCommand(event.execution.commandLine.value, 'finished');
			}),
			vscode.tasks.onDidStartTaskProcess((event) => {
				this.onCommand(taskCommandLine(event.execution.task), 'task');
			}),
			new vscode.Disposable(() => this.stop()),
		);

		void this.announceDaemon();
		this.startWatch();
		this.startPoll();
		void this.sweep('startup');
	}

	private stop(): void {
		this.watch?.dispose();
		this.watch = undefined;
		if (this.poll) {
			clearInterval(this.poll);
			this.poll = undefined;
		}
		if (this.coalesce) {
			clearTimeout(this.coalesce);
			this.coalesce = undefined;
		}
		for (const timer of this.pending) {
			clearTimeout(timer);
		}
		this.pending.clear();
	}

	/** Writes a repeating complaint at most once every five minutes. */
	private grumble(key: string, message: string): void {
		const now = Date.now();
		const last = this.grumbled.get(key) ?? 0;
		if (now - last < QUIET_MS) {
			this.log.debug(message);
			return;
		}
		this.grumbled.set(key, now);
		this.log.warn(message);
	}

	private reload(): void {
		const before = this.settings;
		this.settings = readSettings();
		if (before.dockerPath !== this.settings.dockerPath || before.enabled !== this.settings.enabled) {
			this.watch?.dispose();
			this.watch = undefined;
			this.startWatch();
			void this.announceDaemon();
		}
		if (before.pollSeconds !== this.settings.pollSeconds || before.enabled !== this.settings.enabled) {
			this.startPoll();
		}
		this.log.info('Settings reloaded.');
		this.schedule('settings changed');
	}

	private async announceDaemon(): Promise<void> {
		if (!this.settings.enabled) {
			this.log.info('Disabled by settings.');
			return;
		}
		try {
			const version = await serverVersion(this.settings.dockerPath);
			this.log.info(`Talking to docker ${version} through "${this.settings.dockerPath}".`);
		} catch (error) {
			this.log.warn(`No docker daemon yet. ${String(error)}`);
		}
	}

	private startWatch(): void {
		if (!this.settings.enabled || this.watch) {
			return;
		}
		this.watch = new EventWatch(this.settings.dockerPath, {
			onEvent: (event) => {
				this.log.debug(`Event ${event.action} for ${event.name} in project ${event.project}.`);
				this.schedule(`container ${event.action}`);
			},
			onTrouble: (reason, retryInMs) => {
				this.grumble(
					`watch:${reason}`,
					`Event watch stopped. ${reason}. Retrying in ${Math.round(retryInMs / 1000)}s.`,
				);
			},
		});
		this.watch.start();
	}

	private startPoll(): void {
		if (this.poll) {
			clearInterval(this.poll);
			this.poll = undefined;
		}
		const seconds = this.settings.pollSeconds;
		if (!this.settings.enabled || !Number.isFinite(seconds) || seconds <= 0) {
			return;
		}
		this.poll = setInterval(() => void this.sweep('poll'), Math.max(5, seconds) * 1_000);
	}

	private onCommand(commandLine: string, phase: string): void {
		if (!commandLine || !isComposeCommand(commandLine)) {
			return;
		}
		this.log.info(`Compose command ${phase} in a terminal. ${commandLine.trim().slice(0, 200)}`);
		for (const delay of AFTER_COMMAND_MS) {
			const timer: NodeJS.Timeout = setTimeout(() => {
				this.pending.delete(timer);
				void this.sweep('compose command');
			}, delay);
			this.pending.add(timer);
		}
	}

	/** Collapses a burst of events into one sweep. */
	private schedule(reason: string): void {
		if (this.coalesce) {
			clearTimeout(this.coalesce);
		}
		this.coalesce = setTimeout(() => {
			this.coalesce = undefined;
			void this.sweep(reason);
		}, COALESCE_MS);
	}

	private async sweep(reason: string): Promise<void> {
		if (!this.settings.enabled) {
			return;
		}
		if (this.busy) {
			this.again = true;
			return;
		}
		this.busy = true;
		try {
			await this.sweepOnce(reason);
		} catch (error) {
			this.grumble(`sweep:${String(error)}`, `Sweep for ${reason} failed. ${String(error)}`);
		} finally {
			this.busy = false;
			if (this.again) {
				this.again = false;
				void this.sweep(reason);
			}
		}
	}

	private async sweepOnce(reason: string): Promise<void> {
		const containers = await listComposeContainers(this.settings.dockerPath);
		const wanted = selectPorts(containers, {
			folders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
			scope: this.settings.scope,
			ignoredPorts: this.settings.ignoredPorts,
			includeOneOff: this.settings.includeOneOff,
		});
		this.forwarder.prune(new Set(wanted.map((port) => port.key)));
		const added = await this.forwarder.add(wanted);
		this.paint();
		if (added.length > 0) {
			this.log.info(`Sweep after ${reason} added ${added.length} of ${wanted.length} published ports.`);
			this.announce(added);
		} else {
			this.log.debug(`Sweep after ${reason} found ${wanted.length} published ports. Nothing new.`);
		}
	}

	private paint(): void {
		const count = this.forwarder.count;
		if (count === 0 || this.settings.notify === 'silent') {
			this.status.hide();
			return;
		}
		this.status.text = `$(plug) ${count}`;
		const lines = this.forwarder.list().map((entry) => `- \`${entry.hostPort}\` ${entry.label}`);
		const tooltip = new vscode.MarkdownString(
			[`**Compose ports forwarded to this machine**`, '', ...lines].join('\n'),
		);
		this.status.tooltip = tooltip;
		this.status.show();
	}

	private announce(added: readonly Forwarded[]): void {
		if (this.settings.notify !== 'message') {
			return;
		}
		const first = added[0];
		const summary = added.length === 1
			? `Forwarded ${first.label} at ${first.local}`
			: `Forwarded ${added.length} compose ports.`;
		void vscode.window.showInformationMessage(summary, 'Show ports').then((choice) => {
			if (choice === 'Show ports') {
				void this.showPorts();
			}
		});
	}

	private async showPorts(): Promise<void> {
		const entries = this.forwarder.list();
		if (entries.length === 0) {
			const choice = await vscode.window.showInformationMessage(
				'No compose ports are forwarded yet.',
				'Sweep now',
				'Show log',
			);
			if (choice === 'Sweep now') {
				await this.sweep('command');
			}
			if (choice === 'Show log') {
				this.log.show();
			}
			return;
		}
		const picked = await vscode.window.showQuickPick(
			entries.map((entry) => ({
				label: `$(plug) ${entry.local}`,
				description: entry.label,
				detail: `Remote ${entry.remote}`,
				entry,
			})),
			{ title: 'Compose ports forwarded to this machine', placeHolder: 'Pick a port to open it' },
		);
		if (picked) {
			await vscode.env.openExternal(vscode.Uri.parse(picked.entry.local));
		}
	}
}
