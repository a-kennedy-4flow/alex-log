// Stands in for the vscode module so the extension itself can run outside an
// extension host. Only what the keyboard guard touches is real.
//
// The control surface is published on globalThis because esbuild inlines this
// file into the bundle under test so an importer cannot reach this instance.
const host = {
  // Every setContext value in the order the extension asked for it.
  contexts: [],
  commands: new Map(),
  windowFocused: true,
  windowListeners: [],
  files: new Map(),
  logs: [],
};
globalThis.__host = host;

host.setWindowFocused = (value) => {
  host.windowFocused = value;
  for (const listener of host.windowListeners) listener({ focused: value, active: value });
};

const nothing = { dispose() {} };

class StubUri {
  constructor(path) {
    this.path = path;
  }
  get fsPath() {
    return this.path;
  }
  toString() {
    return "file://" + this.path;
  }
}

export const Uri = {
  joinPath: (base, ...parts) => new StubUri([base.path, ...parts].join("/")),
  parse: (text) => new StubUri(String(text).replace(/^file:\/\//, "")),
  file: (path) => new StubUri(path),
};

export const LogLevel = { Info: 3, 3: "Info" };

export const workspace = {
  fs: {
    readFile: async (uri) => {
      const bytes = host.files.get(uri.path);
      if (!bytes) throw new Error("no such file " + uri.path);
      return bytes;
    },
    writeFile: async (uri, bytes) => void host.files.set(uri.path, bytes),
    createDirectory: async () => undefined,
    stat: async (uri) => {
      if (!host.files.has(uri.path)) throw new Error("no such file " + uri.path);
      return { size: host.files.get(uri.path).length };
    },
    rename: async (from, to) => {
      host.files.set(to.path, host.files.get(from.path));
      host.files.delete(from.path);
    },
  },
  // Every setting stays at its default for this test.
  getConfiguration: () => ({ get: (_key, fallback) => fallback }),
};

export const commands = {
  registerCommand: (id, run) => {
    host.commands.set(id, run);
    return nothing;
  },
  executeCommand: async (id, ...args) => {
    if (id === "setContext") {
      host.contexts.push({ key: args[0], value: args[1] });
      return undefined;
    }
    host.contexts.push({ key: id, value: args });
    return undefined;
  },
};

export const window = {
  get state() {
    return { focused: host.windowFocused, active: host.windowFocused };
  },
  onDidChangeWindowState: (listener) => {
    host.windowListeners.push(listener);
    return nothing;
  },
  createOutputChannel: () => ({
    logLevel: LogLevel.Info,
    info: (text) => host.logs.push(text),
    debug: (text) => host.logs.push(text),
    warn: (text) => host.logs.push(text),
    error: (text) => host.logs.push(text),
    show: () => undefined,
    dispose: () => undefined,
  }),
  registerCustomEditorProvider: (_type, provider) => {
    host.editorProvider = provider;
    return nothing;
  },
  registerWebviewViewProvider: (_id, provider) => {
    host.viewProvider = provider;
    return nothing;
  },
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showOpenDialog: async () => undefined,
  setStatusBarMessage: () => nothing,
};
