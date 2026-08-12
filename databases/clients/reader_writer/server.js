import http from 'node:http'
import { num, on, where } from '../shared/config.js'
import { openLanguagePools, readLanguage, writeRandom } from '../shared/db.js'
import { LANGS, pick } from '../shared/languages.js'
import { dl, esc, page } from '../shared/html.js'

const PORT = num('PORT', 3000)
const WRITE_INTERVAL_MS = num('WRITE_INTERVAL_MS', 1000)
// set STATS_PAGE=off to run headless — writing continues, nothing is served
const STATS_PAGE = on('STATS_PAGE')

const stats = { started: Date.now(), writes: 0, errors: 0, writeMs: 0, lastError: null }
const pools = await openLanguagePools()

async function write(lang = pick(LANGS)) {
    const t = performance.now()
    try {
        await writeRandom(pools[lang], lang)
        stats.writes++
        stats.writeMs += performance.now() - t
    } catch (err) {
        stats.errors++
        stats.lastError = err.message
    }
}

function render(rows, readMs) {
    const uptime = (Date.now() - stats.started) / 1000
    const cell = (row) => (row ? `<code>${esc(row.value)}</code><span class=t>${row.created_at.toISOString().slice(11, 19)}</span>` : '—')
    const body = `<table><tr><th>language<th>database<th class=n>strings<th>first<th>last<th class=n>read ms</tr>
${rows.map((r) => `<tr><td>${r.lang}<td><code>${r.database}</code><td class=n>${r.total}<td>${cell(r.first)}<td>${cell(r.last)}<td class=n>${r.ms.toFixed(1)}</tr>`).join('\n')}
</table>
<h2>statistics</h2>
${dl([
        ['total strings', rows.reduce((a, r) => a + r.total, 0)],
        ['read ms (all databases)', readMs.toFixed(1)],
        ['slowest database', [...rows].sort((a, b) => b.ms - a.ms)[0].lang],
        ['writes', stats.writes],
        ['avg write ms', stats.writes ? (stats.writeMs / stats.writes).toFixed(1) : '—'],
        ['write errors', stats.errors],
        ['last error', stats.lastError ? esc(stats.lastError) : '—'],
        ['write interval ms', WRITE_INTERVAL_MS],
        ['uptime s', uptime.toFixed(0)],
        ['writes / s', (stats.writes / uptime).toFixed(2)],
    ])}
<p><a href=/write>write one now</a> · <a href=/api/stats>json</a></p>`
    return page({ title: 'reader_writer', subtitle: `${esc(where())} · writing every ${WRITE_INTERVAL_MS}ms`, body })
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    try {
        if (url.pathname === '/write') {
            await write(LANGS.includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : undefined)
            return res.writeHead(302, { location: '/' }).end()
        }
        const t = performance.now()
        const rows = await Promise.all(LANGS.map((lang) => readLanguage(pools[lang], lang)))
        const readMs = performance.now() - t
        if (url.pathname === '/api/stats') {
            return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ rows, readMs, ...stats }, null, 2))
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(render(rows, readMs))
    } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err))
    }
})

setInterval(write, WRITE_INTERVAL_MS)
console.log(`reader_writer writing to ${LANGS.length} databases on ${where()} every ${WRITE_INTERVAL_MS}ms`)
if (STATS_PAGE) server.listen(PORT, () => console.log(`stats page on http://localhost:${PORT}`))
else console.log('stats page disabled (STATS_PAGE=off)')
