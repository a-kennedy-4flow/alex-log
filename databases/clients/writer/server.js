import { num, where } from '../shared/config.js'
import { openLanguagePools, writeRandom } from '../shared/db.js'
import { LANGS, pick } from '../shared/languages.js'
import { summary } from '../shared/log.js'

const WRITE_INTERVAL_MS = num('WRITE_INTERVAL_MS', 1000)
const LOG_INTERVAL_MS = num('LOG_INTERVAL_MS', 5000)

const counts = Object.fromEntries(LANGS.map((l) => [l, 0]))
const stats = { started: Date.now(), count: 0, kind: 'writes', ms: 0, errors: 0, lastError: null }

const pools = await openLanguagePools()

async function write() {
    const lang = pick(LANGS)
    const t = performance.now()
    try {
        await writeRandom(pools[lang], lang)
        stats.count++
        counts[lang]++
        stats.ms += performance.now() - t
    } catch (err) {
        stats.errors++
        stats.lastError = err.message
    }
}

setInterval(write, WRITE_INTERVAL_MS)
setInterval(() => summary(stats, counts), LOG_INTERVAL_MS)
console.log(`writer writing to ${LANGS.length} databases on ${where()} every ${WRITE_INTERVAL_MS}ms, reporting every ${LOG_INTERVAL_MS}ms`)
