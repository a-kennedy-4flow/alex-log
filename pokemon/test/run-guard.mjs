// Drives the keyboard guard through the extension's own activate. The context
// key is the whole subject so no display and no core are needed.
//
// The guard is the fourteen pad keys parked on gba.swallowKey while
// gba.focused holds. A key left true with nobody playing is a window that
// swallows x and s and the arrows everywhere including a text editor.
import { build } from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = import.meta.dirname.replace(/\/test$/, "");
const work = await mkdtemp(join(tmpdir(), "gba-guard-"));
const bundle = join(work, "extension.mjs");
await build({
  entryPoints: [join(root, "src/extension.ts")],
  bundle: true, format: "esm", platform: "node",
  alias: { vscode: join(root, "test/vscode-host-stub.mjs") },
  outfile: bundle,
});
const { activate } = await import(bundle);
const host = globalThis.__host;

// A cartridge image carries 0x96 at 0xB2. Anything else is reported as a bad
// download and that report is not what is under test here.
const rom = new Uint8Array(0x100);
rom[0xb2] = 0x96;
host.files.set("/roms/stub.gba", rom);

const document = { uri: { path: "/roms/stub.gba", toString: () => "file:///roms/stub.gba" } };
const context = {
  subscriptions: [],
  extensionUri: { path: "/ext" },
  globalStorageUri: { path: "/store" },
  globalState: { get: () => undefined, update: async () => undefined },
};

function makePanel() {
  const receivers = [];
  const disposers = [];
  const listeners = [];
  const panel = {
    visible: true,
    active: true,
    posted: [],
    webview: {
      options: undefined,
      html: "",
      cspSource: "vscode-webview://stub",
      asWebviewUri: (uri) => ({ toString: () => "https://stub" + uri.path }),
      postMessage: async (message) => void panel.posted.push(message),
      onDidReceiveMessage: (fn) => void receivers.push(fn),
    },
    onDidDispose: (fn) => void disposers.push(fn),
    onDidChangeViewState: (fn) => void listeners.push(fn),
    // What the page posts when it gains or loses the keyboard.
    say: (value) => receivers.forEach((fn) => fn({ type: "focus", value })),
    dispose: () => disposers.forEach((fn) => fn()),
    changed: () => listeners.forEach((fn) => fn()),
  };
  return panel;
}

const guard = () => {
  const keys = host.contexts.filter((entry) => entry.key === "gba.focused");
  return keys.length ? keys[keys.length - 1].value : undefined;
};

activate(context);
const checks = [];
const open = async () => {
  const panel = makePanel();
  await host.editorProvider.resolveCustomEditor(document, panel, undefined);
  return panel;
};

let panel = await open();
checks.push(["the guard starts off", guard() !== true]);

panel.say(true);
checks.push(["the page taking the keyboard raises the guard", guard() === true]);

host.setWindowFocused(false);
checks.push(["a minimised window drops the guard", guard() === false]);

// The page holds the keyboard inside its own window throughout. Only the
// system focus moved.
host.setWindowFocused(true);
checks.push(["restoring the window puts the guard back", guard() === true]);

panel.say(false);
checks.push(["the page giving up the keyboard drops the guard", guard() === false]);

host.setWindowFocused(false);
panel.say(true);
checks.push(["a page cannot raise the guard in an unfocused window", guard() === false]);
host.setWindowFocused(true);
checks.push(["that page holds the guard once the window is back", guard() === true]);

// A disposed webview posts no blur. This is what left the key stuck true.
panel.dispose();
checks.push(["disposing the surface drops the guard", guard() === false]);

panel = await open();
panel.say(true);
panel.active = false;
panel.changed();
checks.push(["a panel that is no longer active drops the guard", guard() === false]);
panel.dispose();

// Serving the page again destroys the page that held the keyboard.
panel = await open();
panel.say(true);
await host.commands.get("gba.reload")();
checks.push(["a reload drops the guard", guard() === false]);
panel.dispose();

// A repeated value means the extension is calling setContext on every event.
const values = host.contexts.filter((entry) => entry.key === "gba.focused").map((entry) => entry.value);
checks.push(["the key is set only when it changes", values.every((value, at) => at === 0 || value !== values[at - 1])]);

for (const [name, ok] of checks) console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
console.log("=== key ===");
console.log(values.join(" "));
const failed = checks.filter(([, ok]) => !ok).length;
process.exit(failed > 0 ? 1 : 0);
