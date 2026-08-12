export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

// one theme for every page a client serves
const STYLE = `body{background:#111;color:#ddd;font:14px system-ui;margin:2rem}h1{margin-bottom:.25rem}
h2{font-size:13px;color:#7dd3a0;text-transform:uppercase;letter-spacing:.05em}
table{border-collapse:collapse;width:100%;margin-top:.5rem}
th,td{text-align:left;padding:.45rem .7rem;border-bottom:1px solid #333}th{color:#888;font-weight:500}
dl{display:grid;grid-template-columns:1fr auto;gap:.3rem 1rem;margin:0}dt{color:#888}dd{margin:0;text-align:right}
dd,.n{text-align:right;font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:1rem 2rem}
section{border:1px solid #333;border-radius:6px;padding:.5rem 1rem}
code{color:#7dd3a0;word-break:break-all}.t{color:#666;margin-left:.5rem}.dim{color:#666}.err{color:#e08c8c}a{color:#7dd3a0}`

export const page = ({ title, subtitle, body, refresh = 2 }) =>
    `<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=${refresh}><title>${esc(title)}</title>
<style>${STYLE}</style>
<h1>${esc(title)}</h1>${subtitle ? `\n<p class=dim>${subtitle}</p>` : ''}
${body}`

export const dl = (pairs) => `<dl>${pairs.map(([k, v]) => `<dt>${k}<dd>${v}`).join('')}</dl>`
export const section = (title, pairs) => `<section><h2>${title}</h2>${dl(pairs)}</section>`
