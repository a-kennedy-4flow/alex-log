// Bundles the Lambda.
//
// esbuild is driven through its JS API rather than its command line because the
// pnpm shim for the binary is not executable under Node.
//
// The AWS SDK is left out. The Lambda runtime already carries it.

import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const result = await build({
  entryPoints: [join(here, 'src/lambda.ts')],
  outfile: join(here, 'dist/lambda.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['@aws-sdk/*'],
  // An ESM bundle has no require. Some transitive packages still reach for it.
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  metafile: true,
  logLevel: 'info',
})

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0)
console.log(`bundled ${(bytes / 1024).toFixed(0)} kB into apps/api/dist`)
