import { context, build } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  minify: process.argv.includes("--minify"),
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching");
} else {
  await build(options);
  console.log("built out/extension.js");
}
