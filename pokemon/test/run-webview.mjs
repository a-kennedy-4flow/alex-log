// Renders the real webview HTML, serves it with the real Content Security
// Policy and boots the core in headless chromium. Proves the page runs without
// SharedArrayBuffer and without reaching the network.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { build } from "esbuild";

const CHROME = process.env.CHROME ?? "/home/alex/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const ROM = process.argv[2];
const RUN_MS = Number(process.env.RUN_MS ?? 25000);
const root = import.meta.dirname.replace(/\/test$/, "");

// 1. Render the page through the extension's own renderHtml.
const work = await mkdtemp(join(tmpdir(), "gba-test-"));
await build({
  entryPoints: [join(root, "src/webviewHtml.ts")],
  bundle: true, format: "esm", platform: "node",
  alias: { vscode: join(root, "test/vscode-stub.mjs") },
  outfile: join(work, "webviewHtml.mjs"),
});
const { renderHtml } = await import(join(work, "webviewHtml.mjs"));

const PORT = 8731;
const origin = `http://localhost:${PORT}`;
const webview = {
  cspSource: origin,
  asWebviewUri: (uri) => ({ toString: () => uri.path }),
};
let html = renderHtml(webview, { path: "/media" });

// 2. Splice in a host stub that answers "ready" with the ROM.
const nonce = html.match(/nonce-([A-Za-z0-9]+)/)[1];

// VS Code injects its own stylesheet into every webview ahead of the page's
// own. The horizontal padding in it is what pushes an unreset layout sideways.
// Without it here the page under test is not the page that ships.
html = html.replace("<style>", `<style>
  body { margin: 0; padding: 0 20px; background-color: transparent; }
</style>
<style>`);
const stub = `<script nonce="${nonce}">
window.__log = [];
${process.env.LEGACY ? "window.EJS_forceLegacyCores = true;" : ""}
window.acquireVsCodeApi = () => ({ postMessage(m) {
  // Mirror what the output channel would receive so the harness can show it.
  if (m.type === "log") { window.__said = window.__said || []; window.__said.push(m.level + ": " + m.text); return; }
  window.__log.push(m.type + (m.auto ? " auto" : "") + (m.data ? " " + m.data.length + " bytes" : ""));
  if (m.type === "state") { window.__state = m.data; if (m.auto) window.__auto = true; }
  if (m.type !== "ready") return;
  // The host serves the cartridge rather than posting it. Same as the real one.
  window.postMessage({ type: "load", name: "stub.gba",
    romUrl: location.origin + "/rom.gba", save: undefined,
    volume: 0, saveIntervalSeconds: 3, autoStateMinutes: 0.1, surfaceVisible: true }, "*");
} });
</script>`;
html = html.replace(`<script nonce="${nonce}" src="/media/webview/boot.js">`, stub + `\n<script nonce="${nonce}" src="/media/webview/boot.js">`);
await writeFile(join(work, "index.html"), html);

// 3. Serve it.
const types = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".wasm": "application/wasm", ".html": "text/html", ".data": "application/octet-stream" };
const server = createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  const file = path === "/" ? join(work, "index.html")
    : path === "/rom.gba" ? ROM
    : join(root, path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("no");
  }
});
await new Promise((r) => server.listen(PORT, r));

// 4. Drive chromium over CDP.
const WINDOW = process.env.WINDOW ?? "800,600";
const chrome = spawn(CHROME, ["--headless", "--remote-debugging-port=9333", "--no-sandbox",
  "--window-size=" + WINDOW,
  "--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=angle",
  "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required", "about:blank"],
  { stdio: ["ignore", "pipe", "pipe"] });

const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  chrome.stderr.on("data", (d) => {
    buf += d;
    const m = buf.match(/ws:\/\/[^\s]+/);
    if (m) resolve(m[0]);
  });
  setTimeout(() => reject(new Error("chromium did not start:\n" + buf)), 15000);
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const console_ = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  if (msg.method === "Runtime.consoleAPICalled") {
    console_.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    console_.push("[throw] " + msg.params.exceptionDetails.text + " " + (msg.params.exceptionDetails.exception?.description ?? ""));
  }
  if (msg.method === "Log.entryAdded") console_.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`);
});
const send = (method, params, sessionId) => new Promise((r) => {
  const n = ++id;
  pending.set(n, r);
  ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Runtime.enable", {}, sessionId);
await send("Log.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: origin + "/" }, sessionId);

await new Promise((r) => setTimeout(r, RUN_MS));

const probe = await send("Runtime.evaluate", { sessionId, returnByValue: true, expression: `(() => {
  const e = window.EJS_emulator;
  return {
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer,
    status: document.getElementById("status")?.textContent ?? null,
    canvas: (() => { const c = document.querySelector("canvas"); return c ? c.width + "x" + c.height : null; })(),
    started: !!(e && e.started),
    core: e ? e.getCore() : null,
    coreFile: e ? e.getCore() + (e.config.threads ? "-thread" : "") + ((e.supportsWebgl2 && e.webgl2Enabled) ? "" : "-legacy") + "-wasm.data" : null,
    failedToStart: e ? !!e.failedToStart : null,
    webgl2: e ? e.supportsWebgl2 : null,
    saveFilePath: (() => { try { return e.gameManager.getSaveFilePath(); } catch { return null; } })(),
    hostMessages: window.__log,
    said: (window.__said || []).filter((line) => !line.includes("[SRAM]")).slice(0, 14),
  };
})()` }, sessionId);

// Exercise the state path exactly as the two commands do. The host posts
// takeState and applyState and the webview answers with the bytes.
const states = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    window.postMessage({ type: "takeState" }, "*");
    await wait(2000);
    const size = window.__state ? window.__state.length : 0;
    const before = window.__log.length;
    window.postMessage({ type: "applyState", data: window.__state }, "*");
    await wait(2000);
    // A type with no handler must complain rather than vanish.
    const beforeUnknown = (window.__said || []).length;
    window.postMessage({ type: "loadState" }, "*");
    await wait(500);
    const complainedAboutUnknown = (window.__said || [])
      .slice(beforeUnknown).some((e) => e.includes("no handler for message type loadState"));

    // A minimised window is the document going hidden while the host still
    // reports the surface on screen. document.hidden is read only so the test
    // shadows it on the instance and fires the event the browser would fire.
    let hidden = false;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    const since = (mark) => (window.__said || []).slice(mark);
    const hide = async (value) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
      await wait(500);
    };

    // The harness boots silent so a level is chosen the way the slider does.
    window.EJS_emulator.volume = 0.42;
    window.EJS_emulator.setVolume(0.42);
    let mark = (window.__said || []).length;
    await hide(true);
    const suspends = since(mark).some((e) => e.includes("suspended while the window is minimised"));
    const silenced = window.EJS_emulator.muted === true;

    // A collapsed section reports the same hidden document. The host says the
    // surface went with it so the machine must carry on.
    mark = (window.__said || []).length;
    window.postMessage({ type: "surface", visible: false }, "*");
    await wait(500);
    const collapsedPlaysOn = since(mark).some((e) => e.includes("resumed"));
    window.postMessage({ type: "surface", visible: true }, "*");
    await wait(500);

    mark = (window.__said || []).length;
    await hide(false);
    const resumes = since(mark).some((e) => e.includes("resumed"));
    const audible = window.EJS_emulator.muted === false;

    // Hand the cartridge over as a second surface would and check it goes quiet.
    const beforeHandover = window.__log.length;
    window.postMessage({ type: "standDown" }, "*");
    await wait(2000);
    const handed = window.__log.slice(beforeHandover).some((e) => e.startsWith("state"));
    const parked = !!document.getElementById("status");
    return { size, handed, parked, complainedAboutUnknown, auto: !!window.__auto,
      suspends, silenced, collapsedPlaysOn, resumes, audible,
      complained: window.__log.slice(before).some((e) => e.startsWith("error")) };
  })()` }, sessionId);

console.log("=== state round trip ===");
console.log(JSON.stringify(states.result?.value ?? states));

// The canvas is drawn by WebGL so reading it straight back is unreliable. A
// composited screenshot always carries what actually reached the screen. It is
// handed back to the page to be decoded because that needs no PNG library here.
const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
if (process.env.SHOT) {
  await writeFile(process.env.SHOT, Buffer.from(shot.data, "base64"));
  console.log("screenshot: " + process.env.SHOT);
}

const pixels = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const img = new Image();
    img.src = "data:image/png;base64,${shot.data}";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const all = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < all.length; i += 4) seen.add((all[i] << 16) | (all[i + 1] << 8) | all[i + 2]);

    // The ramp paints the whole framebuffer so anything still black is a bar
    // around it. Column zero of the ramp carries green and row zero carries red
    // so neither edge is lost to the scan.
    const lit = (x, y) => {
      const i = ((y * c.width) + x) * 4;
      return all[i] + all[i + 1] + all[i + 2] > 24;
    };
    const columnLit = (x) => { for (let y = 0; y < c.height; y++) if (lit(x, y)) return true; return false; };
    const rowLit = (y) => { for (let x = 0; x < c.width; x++) if (lit(x, y)) return true; return false; };
    let first = -1, last = -1, top_ = -1, bottom_ = -1;
    for (let x = 0; x < c.width; x++) if (columnLit(x)) { if (first < 0) first = x; last = x; }
    for (let y = 0; y < c.height; y++) if (rowLit(y)) { if (top_ < 0) top_ = y; bottom_ = y; }

    // Sampled inside the picture rather than inside the capture. A fraction of
    // the capture lands in a bar as soon as the window stops being 800 by 600.
    const at = (fx, fy) => {
      const x = first + Math.round(fx * (last - first));
      const y = top_ + Math.round(fy * (bottom_ - top_));
      const i = ((y * c.width) + x) * 4;
      return { r: all[i], g: all[i + 1], b: all[i + 2] };
    };
    const bars = { viewport: c.width + "x" + c.height,
      leftBar: first, rightBar: c.width - 1 - last,
      topBar: top_, bottomBar: c.height - 1 - bottom_,
      picture: (last - first + 1) + "x" + (bottom_ - top_ + 1) };

    return { colours: seen.size, left: at(0.08, 0.5), right: at(0.92, 0.5),
             top: at(0.5, 0.12), bottom: at(0.5, 0.88), bars };
  })()` }, sessionId);

const p = pixels.result?.value;
const checks = p ? [
  ["more than one colour on screen", p.colours > 100],
  // Red is driven by the column counter and green by the row counter. So each
  // channel has to move along one axis and hold still along the other.
  ["red falls from left to right", p.left.r > p.right.r + 40],
  ["green holds across a row", Math.abs(p.left.g - p.right.g) < 8],
  ["green falls from top to bottom", p.top.g > p.bottom.g + 40],
  ["red holds down a column", Math.abs(p.top.r - p.bottom.r) < 8],
  ["blue stays off", p.top.b < 8 && p.bottom.b < 8],
  // The injected stylesheet used to push the picture right and the core puts
  // its own letterbox at the top. Both read as a bar down one side only.
  ["the picture is centred across", Math.abs(p.bars.leftBar - p.bars.rightBar) <= 1],
  ["the picture is centred down", Math.abs(p.bars.topBar - p.bars.bottomBar) <= 1],
  ["the picture keeps its aspect", (() => {
    const [w, h] = p.bars.picture.split("x").map(Number);
    return Math.abs(w / h - 1.5) < 0.02;
  })()],
  ["a state reached the host", (states.result?.value?.size ?? 0) > 1000],
  ["the state loaded back without complaint", states.result?.value?.complained === false],
  ["the timer files an automatic state", states.result?.value?.auto === true],
  ["an unknown message type is reported", states.result?.value?.complainedAboutUnknown === true],
  ["a minimised window suspends the machine", states.result?.value?.suspends === true],
  ["a suspended machine is silent", states.result?.value?.silenced === true],
  ["a collapsed surface carries on playing", states.result?.value?.collapsedPlaysOn === true],
  ["restoring the window resumes the machine", states.result?.value?.resumes === true],
  ["a resumed machine gets its volume back", states.result?.value?.audible === true],
  ["a handover yields its position", states.result?.value?.handed === true],
  ["the surface that yielded goes quiet", states.result?.value?.parked === true],
] : [["page returned pixels", false]];

console.log("=== picture ===");
console.log(JSON.stringify(p));
console.log("=== bars ===");
console.log(JSON.stringify(p?.bars));
for (const [name, ok] of checks) console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;

console.log("=== console ===");
console.log(console_.slice(-40).join("\n"));
console.log("=== probe ===");
console.log(JSON.stringify(probe.result?.value ?? probe, null, 2));

chrome.kill();
server.close();
process.exit(failed > 0 ? 1 : 0);
