// Pure parsing and filtering. Nothing here touches vscode or the docker binary
// so test/run.mjs can drive it directly.

export const PROJECT_LABEL = 'com.docker.compose.project';
const SERVICE_LABEL = 'com.docker.compose.service';
const WORKING_DIR_LABEL = 'com.docker.compose.project.working_dir';
const CONFIG_FILES_LABEL = 'com.docker.compose.project.config_files';
const ONEOFF_LABEL = 'com.docker.compose.oneoff';

export interface PortBinding {
	/** The port inside the container. */
	containerPort: number;
	protocol: string;
	/** What to dial on the remote machine. */
	host: string;
	hostPort: number;
}

export interface ComposeContainer {
	id: string;
	name: string;
	running: boolean;
	project: string;
	service: string;
	workingDir: string;
	configFiles: string[];
	oneOff: boolean;
	ports: PortBinding[];
}

export interface ComposeEvent {
	action: string;
	id: string;
	name: string;
	project: string;
}

interface RawBinding {
	HostIp?: string;
	HostPort?: string;
}

interface RawInspect {
	Id?: string;
	Name?: string;
	Running?: boolean;
	Labels?: Record<string, string> | null;
	Ports?: Record<string, RawBinding[] | null> | null;
}

/** The template given to docker inspect. One line of JSON per container. */
export const INSPECT_FORMAT =
	'{"Id":{{json .Id}},"Name":{{json .Name}},"Running":{{json .State.Running}},' +
	'"Labels":{{json .Config.Labels}},"Ports":{{json .NetworkSettings.Ports}}}';

/**
 * A binding of 0.0.0.0 or :: is reachable on the remote as localhost. A binding
 * to one address is only reachable at that address.
 */
export function dialHost(hostIp: string | undefined): string {
	const ip = (hostIp ?? '').trim();
	if (ip === '' || ip === '0.0.0.0' || ip === '::' || ip === '[::]') {
		return 'localhost';
	}
	if (ip.includes(':')) {
		return `[${ip}]`;
	}
	return ip;
}

function parsePortKey(key: string): { containerPort: number; protocol: string } | undefined {
	const [portText, protocol = 'tcp'] = key.split('/');
	const containerPort = Number(portText);
	if (!Number.isInteger(containerPort) || containerPort <= 0) {
		return undefined;
	}
	return { containerPort, protocol };
}

/**
 * Turns the Ports map of an inspect into a sorted list with one entry per host
 * port. Docker reports the same publish twice when it binds IPv4 and IPv6.
 */
export function parsePorts(raw: RawInspect['Ports']): PortBinding[] {
	const seen = new Map<string, PortBinding>();
	for (const [key, bindings] of Object.entries(raw ?? {})) {
		const parsedKey = parsePortKey(key);
		if (!parsedKey || !bindings) {
			continue;
		}
		for (const binding of bindings) {
			const hostPort = Number(binding?.HostPort);
			if (!Number.isInteger(hostPort) || hostPort <= 0) {
				continue;
			}
			const host = dialHost(binding?.HostIp);
			const dedupe = `${host}:${hostPort}/${parsedKey.protocol}`;
			if (!seen.has(dedupe)) {
				seen.set(dedupe, { ...parsedKey, host, hostPort });
			}
		}
	}
	return [...seen.values()].sort((a, b) => a.hostPort - b.hostPort);
}

/** Reads one line of the docker inspect output. Returns nothing for a non compose container. */
export function parseInspectLine(line: string): ComposeContainer | undefined {
	const text = line.trim();
	if (text === '') {
		return undefined;
	}
	let raw: RawInspect;
	try {
		raw = JSON.parse(text) as RawInspect;
	} catch {
		return undefined;
	}
	const labels = raw.Labels ?? {};
	const project = labels[PROJECT_LABEL];
	if (!project || !raw.Id) {
		return undefined;
	}
	return {
		id: raw.Id,
		name: (raw.Name ?? '').replace(/^\//, ''),
		running: raw.Running === true,
		project,
		service: labels[SERVICE_LABEL] ?? '',
		workingDir: labels[WORKING_DIR_LABEL] ?? '',
		configFiles: (labels[CONFIG_FILES_LABEL] ?? '').split(',').map((p) => p.trim()).filter(Boolean),
		oneOff: (labels[ONEOFF_LABEL] ?? 'False').toLowerCase() === 'true',
		ports: parsePorts(raw.Ports),
	};
}

/** Reads one line of docker events. Returns nothing for anything outside compose. */
export function parseEventLine(line: string): ComposeEvent | undefined {
	const text = line.trim();
	if (text === '') {
		return undefined;
	}
	let raw: { Action?: string; Actor?: { ID?: string; Attributes?: Record<string, string> } };
	try {
		raw = JSON.parse(text);
	} catch {
		return undefined;
	}
	const attributes = raw.Actor?.Attributes ?? {};
	const project = attributes[PROJECT_LABEL];
	const id = raw.Actor?.ID;
	if (!raw.Action || !id || !project) {
		return undefined;
	}
	return { action: raw.Action, id, name: attributes['name'] ?? '', project };
}

function normalisePath(value: string): string {
	const slashed = value.replace(/\\/g, '/').replace(/\/+$/, '');
	return /^[a-zA-Z]:/.test(slashed) ? slashed.toLowerCase() : slashed;
}

/** True when child is the folder itself or sits under it. */
export function isInside(folder: string, child: string): boolean {
	if (folder === '' || child === '') {
		return false;
	}
	const parent = normalisePath(folder);
	const target = normalisePath(child);
	return target === parent || target.startsWith(`${parent}/`);
}

/** A container belongs to the window when its compose file or its project folder does. */
export function belongsToWorkspace(container: ComposeContainer, folders: readonly string[]): boolean {
	const paths = [container.workingDir, ...container.configFiles].filter(Boolean);
	return paths.some((path) => folders.some((folder) => isInside(folder, path)));
}

/** Accepts "8080" and "9000-9100". Anything else is ignored. */
export function buildPortFilter(patterns: readonly string[]): (port: number) => boolean {
	const singles = new Set<number>();
	const ranges: Array<[number, number]> = [];
	for (const pattern of patterns) {
		const text = String(pattern).trim();
		const range = /^(\d+)\s*-\s*(\d+)$/.exec(text);
		if (range) {
			ranges.push([Number(range[1]), Number(range[2])]);
			continue;
		}
		if (/^\d+$/.test(text)) {
			singles.add(Number(text));
		}
	}
	return (port: number) =>
		!singles.has(port) && !ranges.some(([low, high]) => port >= low && port <= high);
}

const COMPOSE_COMMAND = /(^|[\s;&|(])(docker-compose|docker\s+compose|podman-compose)\b[^;&|]*\b(up|start|restart|run)\b/;

/** Matches a shell command that brings a compose project up. */
export function isComposeCommand(commandLine: string): boolean {
	return COMPOSE_COMMAND.test(commandLine);
}

/** The label shown in the ports list and the log. */
export function describe(container: ComposeContainer, port: PortBinding): string {
	const service = container.service || container.name;
	return `${container.project}/${service} ${port.hostPort} to ${port.containerPort}/${port.protocol}`;
}

export interface WantedPort {
	/** Identifies the tunnel. One per host address and port. */
	key: string;
	label: string;
	host: string;
	hostPort: number;
}

export interface SelectOptions {
	/** The folders open in this window. */
	folders: readonly string[];
	/** "workspace" or "all". */
	scope: string;
	ignoredPorts: readonly string[];
	includeOneOff: boolean;
}

/**
 * Everything that should be forwarded right now. Two containers cannot publish
 * the same host port so the first one wins.
 */
export function selectPorts(
	containers: readonly ComposeContainer[],
	options: SelectOptions,
): WantedPort[] {
	const allow = buildPortFilter(options.ignoredPorts);
	const scoped = options.scope === 'workspace' && options.folders.length > 0;
	const wanted: WantedPort[] = [];
	const seen = new Set<string>();
	for (const container of containers) {
		if (!container.running) {
			continue;
		}
		if (container.oneOff && !options.includeOneOff) {
			continue;
		}
		if (scoped && !belongsToWorkspace(container, options.folders)) {
			continue;
		}
		for (const port of container.ports) {
			const key = `${port.host}:${port.hostPort}`;
			if (seen.has(key) || !allow(port.hostPort)) {
				continue;
			}
			seen.add(key);
			wanted.push({ key, label: describe(container, port), host: port.host, hostPort: port.hostPort });
		}
	}
	return wanted.sort((a, b) => a.hostPort - b.hostPort);
}
