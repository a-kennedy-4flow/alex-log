import http from 'node:http'
import { num as env, on, where } from '../shared/config.js'
import { openPool } from '../shared/db.js'
import { esc, page, section } from '../shared/html.js'

const PORT = env('PORT', 3001)
const POLL_INTERVAL_MS = env('POLL_INTERVAL_MS', 1000)
const STATS_PAGE = on('STATS_PAGE')

const SYSTEM_SCHEMAS = "'mysql','information_schema','performance_schema','sys'"
const pool = openPool(4)
// our own polling connections show up in the processlist, so track their thread ids and subtract them
const ownThreads = new Set()
pool.on('connection', (c) => ownThreads.add(c.threadId))
const meta = { started: Date.now(), polls: 0, errors: 0, lastError: null }
let sample = null // latest poll
let prev = null // previous poll, for per second rates

const num = (n) => Number(n ?? 0).toLocaleString('en-US')
const pct = (x) => `${(100 * (x || 0)).toFixed(1)}%`
const minus = (n) => (n ? ` <span class=dim title="monitoring connections excluded">-${n}</span>` : '')
const bytes = (b) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let n = Number(b ?? 0), i = 0
    while (n >= 1024 && i < units.length - 1) (n /= 1024), i++
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`
}
const dur = (s) => {
    s = Math.floor(Number(s ?? 0))
    const [d, h, m] = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)]
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

async function poll() {
    const t = performance.now()
    try {
        const [[status], [variables], [processlist], [schemas]] = await Promise.all([
            pool.query('SHOW GLOBAL STATUS'),
            pool.query('SHOW GLOBAL VARIABLES'),
            pool.query('SELECT id, user, host, db, command, time, state FROM information_schema.processlist ORDER BY time DESC'),
            pool.query(`SELECT table_schema AS db, COUNT(*) AS tbls, SUM(table_rows) AS est_rows, SUM(data_length + index_length) AS size
                        FROM information_schema.tables WHERE table_schema NOT IN (${SYSTEM_SCHEMAS})
                        GROUP BY table_schema ORDER BY size DESC`),
        ])
        const flat = (rows) => Object.fromEntries(rows.map((r) => [r.Variable_name, r.Value]))
        const mine = processlist.filter((p) => ownThreads.has(Number(p.id)))
        prev = sample
        sample = {
            at: Date.now(),
            ms: performance.now() - t,
            status: flat(status),
            variables: flat(variables),
            processlist: processlist.filter((p) => !ownThreads.has(Number(p.id))),
            monitoring: mine.length,
            monitoringRunning: mine.filter((p) => p.command !== 'Sleep').length,
            schemas,
        }
        meta.polls++
    } catch (err) {
        meta.errors++
        meta.lastError = err.message
    }
}

// counters are cumulative, so report the delta against the previous poll
function derive(s) {
    const g = (k) => Number(s.status[k] ?? 0)
    const dt = prev ? (s.at - prev.at) / 1000 : 0
    const rate = (k) => (prev && dt > 0 ? (g(k) - Number(prev.status[k] ?? 0)) / dt : 0)
    const reads = g('Innodb_buffer_pool_read_requests')
    // the status counters include us too, so take the monitoring connections back off
    const connected = Math.max(0, g('Threads_connected') - s.monitoring)
    return {
        g,
        rate,
        dt,
        connected,
        running: Math.max(0, g('Threads_running') - s.monitoringRunning),
        maxConnections: Number(s.variables.max_connections ?? 0),
        connUsage: connected / Number(s.variables.max_connections || 1),
        bufferHit: reads ? 1 - g('Innodb_buffer_pool_reads') / reads : 0,
        tmpDiskRatio: g('Created_tmp_tables') ? g('Created_tmp_disk_tables') / g('Created_tmp_tables') : 0,
    }
}

function render(s) {
    const d = derive(s)
    const per = (k) => `${d.rate(k).toFixed(1)}/s`
    const body = `<div class=grid>
${section('connections', [
        ['threads connected', `${num(d.connected)}${minus(s.monitoring)}`],
        ['threads running', `${num(d.running)}${minus(s.monitoringRunning)}`],
        ['max connections', num(d.maxConnections)],
        ['connection usage', pct(d.connUsage)],
        ['max ever used', `${num(d.g('Max_used_connections'))} (${pct(d.g('Max_used_connections') / (d.maxConnections || 1))})`],
        ['total connections', num(d.g('Connections'))],
        ['new connections', per('Connections')],
        ['aborted connects', num(d.g('Aborted_connects'))],
        ['aborted clients', num(d.g('Aborted_clients'))],
        ['threads cached', num(d.g('Threads_cached'))],
        ['threads created', num(d.g('Threads_created'))],
    ])}
${section('throughput', [
        ['queries', num(d.g('Questions'))],
        ['queries / s', per('Questions')],
        ['slow queries', num(d.g('Slow_queries'))],
        ['bytes sent', bytes(d.g('Bytes_sent'))],
        ['sent / s', bytes(d.rate('Bytes_sent'))],
        ['bytes received', bytes(d.g('Bytes_received'))],
        ['received / s', bytes(d.rate('Bytes_received'))],
        ['uptime', dur(d.g('Uptime'))],
    ])}
${section('query mix (per second)', [
        ['select', per('Com_select')],
        ['insert', per('Com_insert')],
        ['update', per('Com_update')],
        ['delete', per('Com_delete')],
        ['commit', per('Com_commit')],
        ['rollback', per('Com_rollback')],
        ['create db', num(d.g('Com_create_db'))],
    ])}
${section('innodb', [
        ['buffer pool size', bytes(s.variables.innodb_buffer_pool_size)],
        ['buffer pool hit rate', pct(d.bufferHit)],
        ['pages free', num(d.g('Innodb_buffer_pool_pages_free'))],
        ['pages dirty', num(d.g('Innodb_buffer_pool_pages_dirty'))],
        ['rows read / s', per('Innodb_rows_read')],
        ['rows inserted / s', per('Innodb_rows_inserted')],
        ['row lock waits', num(d.g('Innodb_row_lock_waits'))],
        ['row lock avg ms', num(d.g('Innodb_row_lock_time_avg'))],
    ])}
${section('tables & memory', [
        ['open tables', `${num(d.g('Open_tables'))} / ${num(s.variables.table_open_cache)}`],
        ['opened tables', num(d.g('Opened_tables'))],
        ['table locks waited', num(d.g('Table_locks_waited'))],
        ['tmp tables', num(d.g('Created_tmp_tables'))],
        ['tmp tables on disk', `${num(d.g('Created_tmp_disk_tables'))} (${pct(d.tmpDiskRatio)})`],
        ['handler read rnd next / s', per('Handler_read_rnd_next')],
    ])}
${section('this client', [
        ['monitoring connections', `${num(s.monitoring)} of ${num(ownThreads.size)} opened`],
        ['polls', num(meta.polls)],
        ['poll errors', num(meta.errors)],
        ['last poll ms', s.ms.toFixed(1)],
        ['rate window s', d.dt.toFixed(1)],
        ['uptime', dur((Date.now() - meta.started) / 1000)],
        ['last error', meta.lastError ? esc(meta.lastError) : '—'],
    ])}
</div>
<h2>databases</h2>
<table><tr><th>database<th class=n>tables<th class=n>est. rows<th class=n>size</tr>
${s.schemas.map((r) => `<tr><td><code>${esc(r.db)}</code><td class=n>${num(r.tbls)}<td class=n>${num(r.est_rows)}<td class=n>${bytes(r.size)}</tr>`).join('\n') || '<tr><td colspan=4 class=dim>no user databases</tr>'}
</table>
<h2>processlist (${s.processlist.length} connections${s.monitoring ? `,${minus(s.monitoring)} monitoring` : ''})</h2>
<table><tr><th class=n>id<th>user<th>host<th>db<th>command<th class=n>time s<th>state</tr>
${s.processlist.map((p) => `<tr><td class=n>${p.id}<td>${esc(p.user)}<td>${esc(p.host)}<td>${esc(p.db) || '<span class=dim>—</span>'}<td>${esc(p.command)}<td class=n>${p.time}<td class=dim>${esc(p.state)}</tr>`).join('\n')}
</table>
<p><a href=/api/stats>json</a></p>`
    const subtitle = `${esc(where())} · server ${esc(s.variables.version)} · polled every ${POLL_INTERVAL_MS}ms · sample ${s.ms.toFixed(1)}ms old`
    return page({ title: 'mysql stats', subtitle, body })
}

const server = http.createServer((req, res) => {
    if (!sample) return res.writeHead(503, { 'content-type': 'text/plain' }).end(`no sample yet${meta.lastError ? `: ${meta.lastError}` : ''}`)
    if (new URL(req.url, 'http://localhost').pathname === '/api/stats') {
        const d = derive(sample)
        return res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(
                JSON.stringify(
                    {
                        ...sample,
                        ownThreads: [...ownThreads],
                        derived: { connected: d.connected, running: d.running, connUsage: d.connUsage, bufferHit: d.bufferHit, queriesPerSecond: d.rate('Questions') },
                        meta,
                    },
                    null,
                    2,
                ),
            )
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(render(sample))
})

await poll()
setInterval(poll, POLL_INTERVAL_MS)
console.log(`stats polling ${where()} every ${POLL_INTERVAL_MS}ms`)
if (STATS_PAGE) server.listen(PORT, () => console.log(`stats page on http://localhost:${PORT}`))
else console.log('stats page disabled (STATS_PAGE=off)')
