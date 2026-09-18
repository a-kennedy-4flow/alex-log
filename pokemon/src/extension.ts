import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { renderHtml } from "./webviewHtml";

const VIEW_TYPE = "gba.rom";

// Keystrokes inside a webview are forwarded to the VS Code keybinding layer so
// a pad key can fire an editor command mid game. The contributed bindings in
// package.json park those keys on gba.swallowKey while this context key holds.
const FOCUS_CONTEXT = "gba.focused";
const focused = new Set<Surface>();
// The session a state command should act on.
let active: Session | undefined;
let log: vscode.LogOutputChannel;

// An editor tab and a panel view differ in how they are created and in nothing
// else that matters here. Both are a webview with a lifetime.
interface Surface {
  readonly webview: vscode.Webview;
  readonly onDidDispose: vscode.Event<void>;
  readonly where: "editor" | "panel";
}

// One machine at a time. Two cores on one cartridge would fight over the save
// file and the loser would overwrite the winner.
const live = new Set<Session>();

function reportFocus(surface: Surface, hasFocus: boolean): void {
  const before = focused.size;
  if (hasFocus) focused.add(surface);
  else focused.delete(surface);
  if ((before > 0) !== (focused.size > 0)) {
    void vscode.commands.executeCommand("setContext", FOCUS_CONTEXT, focused.size > 0);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel("GBA", { log: true });
  const provider = new GbaEditorProvider(context);

  context.subscriptions.push(
    log,
    vscode.commands.registerCommand("gba.showLog", () => log.show()),
    // Referenced by the contributed bindings and by nothing else. It is absent
    // from contributes.commands so it stays out of the command palette.
    vscode.commands.registerCommand("gba.swallowKey", () => undefined),
    vscode.commands.registerCommand("gba.saveState", () => active?.captureState()),
    vscode.commands.registerCommand("gba.loadState", () => active?.restoreState()),
    vscode.window.registerWebviewViewProvider("gba.view", new GbaViewProvider(context), {
      // Same reason as the editor. A collapsed view must not kill the machine.
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("gba.playInPanel", async () => {
      const rom = lastRom(context);
      if (!rom) return vscode.window.showInformationMessage("GBA: open a cartridge first");
      await vscode.commands.executeCommand("gba.view.focus");
    }),
    vscode.commands.registerCommand("gba.playInEditor", async () => {
      const rom = lastRom(context);
      if (!rom) return vscode.window.showInformationMessage("GBA: open a cartridge first");
      await vscode.commands.executeCommand("vscode.openWith", rom, VIEW_TYPE);
    }),
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      // The core lives in the webview. Tearing it down on a tab switch would
      // drop the running machine.
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    vscode.commands.registerCommand("gba.openRom", async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: "Run",
        filters: { "Game Boy": ["gba", "gbc", "gb"] },
      });
      if (picked?.[0]) {
        await vscode.commands.executeCommand("vscode.openWith", picked[0], VIEW_TYPE);
      }
    }),
  );
}

export function deactivate(): void {}

class GbaEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const surface: Surface = {
      webview: panel.webview,
      onDidDispose: panel.onDidDispose,
      where: "editor",
    };
    // A panel that is no longer active cannot be holding the keyboard.
    const session = new Session(this.context, surface, document.uri);
    panel.onDidChangeViewState(() => {
      if (panel.active) active = session;
      else reportFocus(surface, false);
    }, undefined, this.context.subscriptions);

    await session.open(token);
  }
}

// The same machine in the bottom panel. It plays whichever cartridge was opened
// last. A view cannot be disposed by an extension so it shows what it can.
class GbaViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    const rom = lastRom(this.context);
    if (!rom) {
      view.webview.options = { enableScripts: false };
      view.webview.html = emptyHtml();
      return;
    }
    const surface: Surface = {
      webview: view.webview,
      onDidDispose: view.onDidDispose,
      where: "panel",
    };
    const session = new Session(this.context, surface, rom);
    view.onDidChangeVisibility(() => {
      if (view.visible) active = session;
      else reportFocus(surface, false);
    }, undefined, this.context.subscriptions);

    await session.open();
  }
}

class Session {
  private store!: Awaited<ReturnType<Session["storageFor"]>>;
  private name: string;
  private handover?: (state: Buffer) => void;

  constructor(
    private readonly context: vscode.ExtensionContext,
    readonly surface: Surface,
    readonly romUri: vscode.Uri,
  ) {
    this.name = basename(romUri.path);
  }

  async open(token?: vscode.CancellationToken): Promise<void> {
    const media = vscode.Uri.joinPath(this.context.extensionUri, "media");
    const webview = this.surface.webview;

    webview.options = {
      enableScripts: true,
      // The cartridge is served to the page rather than posted to it so its
      // own folder has to be reachable. Nothing else outside media/ is.
      localResourceRoots: [media, vscode.Uri.joinPath(this.romUri, "..")],
    };
    webview.html = renderHtml(webview, media);

    active = this;
    live.add(this);
    this.surface.onDidDispose(() => {
      live.delete(this);
      focused.delete(this.surface);
      if (active === this) active = undefined;
    }, undefined, this.context.subscriptions);

    const rom = await vscode.workspace.fs.readFile(this.romUri);
    this.store = await this.storageFor(rom, this.romUri);
    const config = vscode.workspace.getConfiguration("gba");
    const chatty = config.get<string>("log", "errors") === "all";

    log.info(`open ${this.romUri.fsPath} in the ${this.surface.where}`);
    log.info(`rom ${rom.length} bytes, key ${this.store.key}`);
    inspect(rom);
    void this.context.globalState.update("lastRom", this.romUri.toString());

    let lastWritten = "";
    const writeBattery = async (bytes: Uint8Array) => {
      // The core hands over the whole cartridge RAM on every tick. Only touch
      // the disc when it differs.
      const stamp = `${bytes.length}:${checksum(bytes)}`;
      if (stamp === lastWritten) return;
      await vscode.workspace.fs.writeFile(this.store.battery, bytes);
      lastWritten = stamp;
      await this.note();
    };

    webview.onDidReceiveMessage(async (message) => {
      switch (message?.type) {
        case "ready": {
          if (token?.isCancellationRequested) return;
          // Whoever else holds this cartridge is asked to hand it over first so
          // the position carries across rather than falling back to the battery.
          // A handover carries the exact position across surfaces. Failing
          // that the timer's own snapshot is the next best resumption point.
          const carried =
            (await this.takeOver()) ??
            (config.get<boolean>("resumeFromAutoState", true)
              ? await readIfPresent(this.store.auto)
              : undefined);
          const save = await readIfPresent(this.store.battery);
          // A 16 MiB array does not survive the webview message channel. It
          // arrives empty and the core then fails deep inside its first call.
          // So the cartridge is fetched by the page over the resource protocol
          // and only small payloads are posted, as text.
          webview.postMessage({
            type: "load",
            name: this.name,
            romUrl: webview.asWebviewUri(this.romUri).toString(),
            save: save ? Buffer.from(save).toString("base64") : undefined,
            resume: carried ? Buffer.from(carried).toString("base64") : undefined,
            volume: config.get<number>("volume", 0.5),
            saveIntervalSeconds: config.get<number>("saveIntervalSeconds", 10),
            autoStateMinutes: config.get<number>("autoStateMinutes", 5),
          });
          log.info(
            `serving the rom with ${save ? `a ${save.length} byte save` : "no save"}` +
            `${carried ? ` and a ${carried.length} byte handover` : ""}`,
          );
          return;
        }
        case "save": {
          await writeBattery(Buffer.from(message.data, "base64"));
          return;
        }
        case "state": {
          const state = Buffer.from(message.data, "base64");
          if (message.auto) {
            await vscode.workspace.fs.writeFile(this.store.auto, state);
            log.debug(`auto state ${state.length} bytes`);
            return;
          }
          // A handover is a state that goes straight to the other surface.
          if (this.handover) {
            this.handover(state);
            this.handover = undefined;
            return;
          }
          log.info(`writing a ${state.length} byte state`);
          await vscode.workspace.fs.writeFile(this.store.state, state);
          await this.note();
          vscode.window.setStatusBarMessage("GBA: state saved", 2000);
          return;
        }
        case "focus": {
          reportFocus(this.surface, message.value === true);
          return;
        }
        case "log": {
          // Everything the webview says is kept. Only the noise is filtered and
          // only on the way in so the setting cannot hide a real fault.
          if (message.level === "error") log.error(message.text);
          else if (message.level === "warn") log.warn(message.text);
          else if (chatty || message.important) log.info(message.text);
          else log.debug(message.text);
          return;
        }
        case "error": {
          log.error(message.text);
          const open = "Show Log";
          const chosen = await vscode.window.showErrorMessage(`GBA: ${message.text}`, open);
          if (chosen === open) log.show();
          return;
        }
      }
    }, undefined, this.context.subscriptions);
  }

  captureState(): void {
    void this.surface.webview.postMessage({ type: "takeState" });
  }

  // The state lives on disc so the host reads it and hands it straight over.
  // Asking the webview to ask for it was a round trip through a message the
  // webview never handled.
  async restoreState(): Promise<void> {
    const bytes = await readIfPresent(this.store.state);
    if (!bytes) {
      vscode.window.showInformationMessage("GBA: no saved state for this cartridge");
      return;
    }
    await this.surface.webview.postMessage({
      type: "applyState",
      data: Buffer.from(bytes).toString("base64"),
    });
    log.info(`applied a ${bytes.length} byte state`);
  }

  // Asks every other session on this cartridge to stop and yield its position.
  // Waiting is bounded. Because a webview that has already gone will never
  // answer and the new machine must still start.
  private async takeOver(): Promise<Buffer | undefined> {
    const others = [...live].filter(
      (other) => other !== this && other.romUri.toString() === this.romUri.toString(),
    );
    if (others.length === 0) return undefined;

    const yielded = await Promise.all(others.map((other) => other.yield()));
    return yielded.find((state) => state !== undefined);
  }

  private yield(): Promise<Buffer | undefined> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.handover = undefined;
        resolve(undefined);
      }, 3000);
      this.handover = (state) => {
        clearTimeout(timer);
        resolve(state);
      };
      void this.surface.webview.postMessage({ type: "standDown" });
      log.info(`asked the ${this.surface.where} to hand the cartridge over`);
    });
  }

  // Keyed on the cartridge itself rather than on its file name. Because a) a
  // rename or a move no longer orphans the save b) two copies of one dump share
  // a save correctly c) two different games called rom.gba stop colliding.
  private async storageFor(rom: Uint8Array, uri: vscode.Uri) {
    const dir = vscode.Uri.joinPath(this.context.globalStorageUri, "saves");
    await vscode.workspace.fs.createDirectory(dir);
    const key = createHash("sha1").update(rom).digest("hex").slice(0, 16);

    const store = {
      key,
      battery: vscode.Uri.joinPath(dir, `${key}.srm`),
      state: vscode.Uri.joinPath(dir, `${key}.state`),
      auto: vscode.Uri.joinPath(dir, `${key}.auto.state`),
      index: vscode.Uri.joinPath(dir, "index.json"),
    };

    // Earlier versions keyed on the file name. Carry that save across once.
    const legacy = vscode.Uri.joinPath(dir, `${basename(uri.path)}.srm`);
    if (!(await exists(store.battery)) && (await exists(legacy))) {
      await vscode.workspace.fs.rename(legacy, store.battery);
    }
    return store;
  }

  // A hash for a file name is unreadable on its own so the folder carries a map.
  private async note(): Promise<void> {
    const key = this.store.key;
    const name = this.name;
    const file = vscode.Uri.joinPath(this.context.globalStorageUri, "saves", "index.json");
    const raw = await readIfPresent(file);
    let index: Record<string, { name: string; updated: string }> = {};
    if (raw) {
      try {
        index = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        index = {};
      }
    }
    const updated = new Date().toISOString();
    if (index[key]?.name === name && index[key]?.updated.slice(0, 10) === updated.slice(0, 10)) return;
    index[key] = { name, updated };
    await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(JSON.stringify(index, null, 2)));
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readIfPresent(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  try {
    return await vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
}

// A cartridge image carries a fixed 0x96 at 0xB2 and its title at 0xA0. A file
// that fails this is not a plain image at all. A download site handing back an
// archive or an error page under a .gba name looks exactly like this.
function inspect(rom: Uint8Array): void {
  const head = [...rom.subarray(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const containers: Record<string, string> = {
    "50 4b 03 04": "a zip archive",
    "37 7a bc af": "a 7z archive",
    "52 61 72 21": "a rar archive",
    "1f 8b 08 00": "a gzip stream",
    "3c 21 44 4f": "an HTML page",
    "3c 68 74 6d": "an HTML page",
  };

  if (containers[head]) {
    log.error(`this file is ${containers[head]} rather than a cartridge image. Unpack it first.`);
    return;
  }
  if (rom[0xb2] !== 0x96) {
    log.error(
      `byte 0xB2 is 0x${(rom[0xb2] ?? 0).toString(16)} and a cartridge carries 0x96 there. ` +
      `The file starts ${head}. A truncated or wrapped download looks like this.`,
    );
    return;
  }
  const title = new TextDecoder("ascii")
    .decode(rom.subarray(0xa0, 0xac))
    .replace(/\0+$/, "").trim();
  const code = new TextDecoder("ascii").decode(rom.subarray(0xac, 0xb0));
  log.info(`header ok, title "${title}", code ${code}`);
}

// The panel view is not bound to a file the way an editor tab is so it follows
// whichever cartridge was opened last.
function lastRom(context: vscode.ExtensionContext): vscode.Uri | undefined {
  const stored = context.globalState.get<string>("lastRom");
  return stored ? vscode.Uri.parse(stored) : undefined;
}

function emptyHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  body { display: grid; place-items: center; height: 100vh; margin: 0;
         color: var(--vscode-descriptionForeground);
         font: var(--vscode-font-size) var(--vscode-font-family); }
</style></head>
<body><p>Open a cartridge first. Run <b>GBA: Open ROM</b>.</p></body></html>`;
}

function basename(path: string): string {
  return path.split("/").pop() ?? "rom";
}

function checksum(bytes: Uint8Array): number {
  let hash = 0;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash * 31 + bytes[i]) >>> 0;
  }
  return hash;
}
