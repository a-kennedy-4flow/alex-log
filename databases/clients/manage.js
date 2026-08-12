import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { where } from './shared/config.js'

const HERE = import.meta.dirname
const { values: v } = parseArgs({
    options: {
        readers: { type: 'string', default: '1' },
        writers: { type: 'string', default: '1' },
        'reader-writers': { type: 'string', default: '1' },
        stats: { type: 'string', default: 'on' }, // --stats off to skip it
        'stats-port': { type: 'string', default: '3001' },
        'reader-writer-port': { type: 'string', default: '3200' }, // first reader_writer, then +1 each
        'write-interval': { type: 'string', default: '1000' },
        'read-interval': { type: 'string', default: '1000' },
        'poll-interval': { type: 'string', default: '1000' },
        help: { type: 'boolean', default: false },
    },
})

if (v.help) {
    console.log(`usage: node manage.js [options]
  --readers N              (default 1)   headless
  --writers N              (default 1)   headless
  --reader-writers N       (default 1)   pages on --reader-writer-port and up
  --stats on|off           (default on)  always a single one, the only page besides them
  --stats-port N           (default 3001)
  --reader-writer-port N   (default 3200)
  --write-interval MS      (default 1000) for writers and reader_writers
  --read-interval MS       (default 1000) for readers
  --poll-interval MS       (default 1000) for stats
DB_HOST, DB_PORT, DB_USER and DB_PASSWORD are passed through to every app.`)
    process.exit(0)
}

const n = (s) => Math.max(0, Number(s) || 0)
const COLORS = { stats: '\x1b[35m', reader: '\x1b[36m', writer: '\x1b[33m', reader_writer: '\x1b[32m' }
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

// build the full fleet up front so ports and labels are decided before anything spawns
const fleet = []
if (!/^(off|false|0|no)$/i.test(v.stats)) fleet.push({ app: 'stats', label: 'stats', port: n(v['stats-port']), env: { POLL_INTERVAL_MS: v['poll-interval'] } })
for (let i = 0; i < n(v['reader-writers']); i++)
    fleet.push({ app: 'reader_writer', label: `reader_writer-${i + 1}`, port: n(v['reader-writer-port']) + i, env: { WRITE_INTERVAL_MS: v['write-interval'] } })
for (let i = 0; i < n(v.readers); i++) fleet.push({ app: 'reader', label: `reader-${i + 1}`, port: null, env: { READ_INTERVAL_MS: v['read-interval'] } })
for (let i = 0; i < n(v.writers); i++) fleet.push({ app: 'writer', label: `writer-${i + 1}`, port: null, env: { WRITE_INTERVAL_MS: v['write-interval'] } })

if (!fleet.length) {
    console.error('nothing to start')
    process.exit(1)
}

// check every port up front so the fleet never comes up half started
const assigned = new Map()
const clashes = []
for (const f of fleet.filter((f) => f.port)) {
    if (assigned.has(f.port)) clashes.push(`${f.port} wanted by both ${assigned.get(f.port)} and ${f.label}`)
    else assigned.set(f.port, f.label)
}
if (clashes.length) {
    console.error(`overlapping ports: ${clashes.join(', ')}`)
    console.error('nothing started — move a range with --stats-port / --reader-writer-port')
    process.exit(1)
}

const free = (port) =>
    new Promise((resolve) => {
        const probe = net
            .createServer()
            .once('error', () => resolve(false))
            .once('listening', () => probe.close(() => resolve(true)))
        probe.listen(port)
    })
const taken = []
for (const f of fleet.filter((f) => f.port)) if (!(await free(f.port))) taken.push(f)
if (taken.length) {
    console.error(`port already in use: ${taken.map((f) => `${f.port} (${f.label})`).join(', ')}`)
    console.error('nothing started — free the port or move it with --stats-port / --reader-port / --reader-writer-port')
    process.exit(1)
}

// pnpm only, and only for a folder that has dependencies but has never been installed (shared owns mysql2)
for (const folder of ['shared', ...new Set(fleet.map((f) => f.app))]) {
    const dir = join(HERE, folder)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (!Object.keys(pkg.dependencies ?? {}).length || existsSync(join(dir, 'node_modules'))) continue
    console.log(`${DIM}pnpm install in ${folder}${RESET}`)
    execFileSync('pnpm', ['-C', dir, 'install'], { stdio: 'inherit' })
}

const width = Math.max(...fleet.map((f) => f.label.length))
const children = []
let stopping = false

function pipe(stream, label, color) {
    let buf = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
        const lines = (buf + chunk).split('\n')
        buf = lines.pop()
        for (const line of lines) if (line.trim()) console.log(`${color}${label.padEnd(width)}${RESET} ${DIM}|${RESET} ${line}`)
    })
}

for (const f of fleet) {
    const proc = spawn(process.execPath, ['server.js'], {
        cwd: join(HERE, f.app),
        env: { ...process.env, ...f.env, ...(f.port ? { PORT: String(f.port) } : {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    const color = COLORS[f.app]
    pipe(proc.stdout, f.label, color)
    pipe(proc.stderr, f.label, color)
    proc.on('exit', (code, signal) => {
        f.exited = true
        if (!stopping) console.log(`${color}${f.label.padEnd(width)}${RESET} ${DIM}| exited (${signal ?? `code ${code}`})${RESET}`)
        if (children.every((c) => c.f.exited)) process.exit(stopping ? 0 : 1)
    })
    children.push({ f, proc })
}

const counts = ['stats', 'reader_writer', 'reader', 'writer'].map((a) => `${fleet.filter((f) => f.app === a).length} ${a}`).join(' · ')
console.log(`${DIM}started ${counts} against ${where()}${RESET}`)
for (const f of fleet) console.log(`${DIM}  ${f.label.padEnd(width)} ${f.port ? `http://localhost:${f.port}` : 'headless'}${RESET}`)
console.log(`${DIM}ctrl-c to stop everything${RESET}`)

function stop() {
    if (stopping) return
    stopping = true
    console.log(`\n${DIM}stopping ${children.filter((c) => !c.f.exited).length} processes${RESET}`)
    for (const c of children) if (!c.f.exited) c.proc.kill('SIGTERM')
    setTimeout(() => {
        for (const c of children) if (!c.f.exited) c.proc.kill('SIGKILL')
        process.exit(0)
    }, 3000).unref()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
