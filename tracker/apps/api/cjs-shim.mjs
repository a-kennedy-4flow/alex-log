// Supplies the require that an ESM bundle lacks.
//
// esbuild rewrites a free require to this export. It cannot do that for a
// banner because it never parses banner text. The banner form broke the Lambda
// at load. Because a) fflate imports createRequire itself. b) Two top level
// declarations of one name is a parse error.

import { createRequire } from 'node:module'

export const require = createRequire(import.meta.url)
