import { num, where } from '../shared/config.js'
import { openPool, readLanguage } from '../shared/db.js'
import { LANGS } from '../shared/languages.js'
import { summary } from '../shared/log.js'

const READ_INTERVAL_MS = num('READ_INTERVAL_MS', 1000)
const LOG_INTERVAL_MS = num('LOG_INTERVAL_MS', 5000)

// reads only — this pool selects no database and never creates one, so it is happy against a replica
const pool = openPool()
const totals = Object.fromEntries(LANGS.map((l) => [l, 0]))
const stats = { started: Date.now(), count: 0, kind: 'reads', ms: 0, errors: 0, lastError: null }

async function readAll() {
    const t = performance.now()
    await Promise.all(
        LANGS.map(async (lang) => {
            try {
                totals[lang] = (await readLanguage(pool, lang)).total
            } catch (err) {
                stats.errors++
                stats.lastError = err.message
                totals[lang] = err.code ?? 'error'
            }
        }),
    )
    stats.count++
    stats.ms += performance.now() - t
}

await readAll()
setInterval(readAll, READ_INTERVAL_MS)
setInterval(() => summary(stats, totals), LOG_INTERVAL_MS)
console.log(`reader reading ${LANGS.length} databases from ${where()} every ${READ_INTERVAL_MS}ms, reporting every ${LOG_INTERVAL_MS}ms`)
