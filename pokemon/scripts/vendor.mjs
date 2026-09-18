// Copies the EmulatorJS runtime and the single threaded mGBA core out of
// node_modules into media/data so the webview never reaches the network.
import { cp, mkdir, rm, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(import.meta.dirname);
const out = join(root, "media", "data");

const ejs = join(dirname(require.resolve("@emulatorjs/emulatorjs/package.json")), "data");
const core = dirname(require.resolve("@emulatorjs/core-mgba/package.json"));

// The thread builds want SharedArrayBuffer which a webview does not grant.
const cores = ["mgba-wasm.data", "mgba-legacy-wasm.data"];
const runtime = ["loader.js", "emulator.css", "version.json", "src", "compression", "localization"];

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "cores", "reports"), { recursive: true });

for (const entry of runtime) {
  await cp(join(ejs, entry), join(out, entry), { recursive: true });
}
for (const entry of cores) {
  await cp(join(core, entry), join(out, "cores", entry));
}
await cp(join(core, "reports", "mgba.json"), join(out, "cores", "reports", "mgba.json"));

let bytes = 0;
const walk = async (dir) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else bytes += (await stat(p)).size;
  }
};
await walk(out);
console.log(`vendored ${(bytes / 1024 / 1024).toFixed(1)} MiB into media/data`);
