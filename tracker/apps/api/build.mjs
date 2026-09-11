// Bundles the Lambdas.
//
// esbuild is driven through its JS API rather than its command line because the
// pnpm shim for the binary is not executable under Node.
//
// One bundle per function rather than one for all three. Because a) the runtime
// resolves an SDK client as soon as a module names it. b) the shared artefact
// named the Cognito and the SES and the KMS and the Secrets Manager clients so
// the API function loaded four it never calls. c) each function now parses
// only its own code.
//
// The AWS SDK is left out. The Lambda runtime already carries it.

import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const result = await build({
  entryPoints: [
    join(here, 'src/api-lambda.ts'),
    join(here, 'src/jira-lambda.ts'),
    join(here, 'src/reminder-lambda.ts'),
  ],
  outdir: join(here, 'dist'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  // Halves what the runtime parses. The source map keeps the trace readable.
  minify: true,
  sourcemap: true,
  external: ['@aws-sdk/*'],
  // The shim supplies require to any transitive package that still calls it.
  inject: [join(here, 'cjs-shim.mjs')],
  metafile: true,
  logLevel: 'info',
})

for (const [file, out] of Object.entries(result.metafile.outputs)) {
  if (file.endsWith('.map')) continue
  console.log(`${file.split('/').pop()} ${(out.bytes / 1024).toFixed(0)} kB`)
}
