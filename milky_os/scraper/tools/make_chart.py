"""Builds the page that compares one nutrient across one age step."""

from __future__ import annotations

import argparse
import datetime
import html
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import reference  # noqa: E402
from compare_data import build  # noqa: E402
from make_page import count, ready_to_drink, repacks  # noqa: E402

STYLE = """
:root {
  --ink: #16181d;
  --quiet: #5c6270;
  --line: #e2e5ec;
  --page: #f6f7f9;
  --card: #ffffff;
  --accent: #002878;
  --band: #eef1f7;
  --series: #2a78d6;
  --deemph: #8b92a1;
  --radius: 10px;
  --who: 19rem;
  --val: 6rem;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #e8eaf0;
    --quiet: #9aa2b4;
    --line: #2c313c;
    --page: #14161b;
    --card: #1b1e25;
    --accent: #8ab0ff;
    --band: #232833;
    --series: #3987e5;
    --deemph: #626b7d;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.top { padding: 1.25rem 1.25rem 0.5rem; }
h1 { margin: 0; font-size: 1.4rem; letter-spacing: -0.01em; }
.lede { margin: 0.2rem 0 0; color: var(--quiet); font-size: 0.9rem; }
.lede a { color: var(--accent); }
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: end;
  padding: 0.75rem 1.25rem 1rem;
  border-bottom: 1px solid var(--line);
}
.control { display: grid; gap: 0.15rem; }
.control span { color: var(--quiet); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
select, button {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
select { max-width: 22rem; }
button:hover, select:hover { border-color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { padding: 1rem 1.25rem 4rem; }
.card {
  padding: 1rem 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
}
.card h2 { margin: 0; font-size: 1rem; }
.card .sub { margin: 0.15rem 0 1rem; color: var(--quiet); font-size: 0.82rem; }
.axis, .row {
  display: grid;
  grid-template-columns: var(--who) minmax(0, 1fr) var(--val);
  align-items: center;
  gap: 0 0.75rem;
}
.axis { height: 1.6rem; }
.axis .ticks { position: relative; height: 100%; }
.axis .tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  color: var(--quiet);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.plot { position: relative; padding-bottom: 1.4rem; }
.grid {
  position: absolute;
  top: 1.6rem;
  bottom: 1.4rem;
  left: calc(var(--who) + 0.75rem);
  right: calc(var(--val) + 0.75rem);
  pointer-events: none;
}
.grid i {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.grid i.mid { width: 1px; background: var(--ink); opacity: 0.55; }
.grid b {
  position: absolute;
  bottom: -1.3rem;
  transform: translateX(-50%);
  color: var(--ink);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}
.row {
  position: relative;
  width: 100%;
  height: 26px;
  margin-bottom: 2px;
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}
.row:hover { background: var(--band); }
.row[aria-pressed=true] .who b { color: var(--accent); }
.who {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.82rem;
}
.who b { font-weight: 600; }
.who .variant { color: var(--quiet); }
.who .size { color: var(--deemph); font-size: 0.75rem; }
.track { position: relative; height: 100%; }
.track .lead {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--line);
  opacity: 0;
}
.row:hover .lead, .row:focus-visible .lead, .row[aria-pressed=true] .lead { opacity: 1; }
.dot {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: var(--series);
  box-shadow: 0 0 0 2px var(--card);
}
.plot.picked .dot { background: var(--deemph); }
.plot.picked .row[aria-pressed=true] .dot { background: var(--series); }
.val {
  text-align: right;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
}
.absent { margin: 1rem 0 0; color: var(--quiet); font-size: 0.8rem; }
#tip {
  position: fixed;
  z-index: 9;
  max-width: 22rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.16);
  font-size: 0.8rem;
  pointer-events: none;
}
#tip[hidden] { display: none; }
#tip b { display: block; }
#tip span { color: var(--quiet); }
table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
th, td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--line); text-align: left; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
thead th { color: var(--quiet); font-size: 0.78rem; }
tbody tr:hover { background: var(--band); }
@media (max-width: 720px) {
  :root { --who: 9rem; --val: 4.5rem; }
}
"""

SCRIPT = """
const DATA = window.__COMPARE__;
const MARKUP = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'};
// Every string below is what a manufacturer wrote so none of it may reach the DOM as markup.
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => MARKUP[c]);
const byStage = new Map();
for (const a of DATA.articles) {
  if (!byStage.has(a.stage)) byStage.set(a.stage, []);
  byStage.get(a.stage).push(a);
}
const picked = new Set();
const el = id => document.getElementById(id);
const tick = (v, d) => v.toLocaleString('de-DE', {minimumFractionDigits: d, maximumFractionDigits: d});
// A declared 0,0031 mg must not print as 0,00 beside the dot that carries it.
const fmt = v => v.toLocaleString('de-DE', {maximumSignificantDigits: 3});

function tickStep(lo, hi, count) {
  const raw = (hi - lo) / count;
  if (!(raw > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
}

function scaleFor(values) {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { const pad = Math.abs(lo) * 0.05 || 1; lo -= pad; hi += pad; }
  else { const pad = (hi - lo) * 0.08; lo -= pad; hi += pad; }
  const step = tickStep(lo, hi, 5);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  return {lo, hi, ticks, decimals, at: v => ((v - lo) / (hi - lo)) * 100};
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function current() {
  const stage = el('stage').value;
  const nutrient = DATA.nutrients.find(n => n.name === el('nutrient').value) || DATA.nutrients[0];
  const all = byStage.get(stage) || [];
  const have = all.filter(a => nutrient.name in a.values);
  const absent = all.filter(a => !(nutrient.name in a.values));
  const order = el('sort').value;
  have.sort(order === 'brand'
    ? (a, b) => (a.brand + a.variant).localeCompare(b.brand + b.variant, 'de')
    : (a, b) => b.values[nutrient.name] - a.values[nutrient.name]);
  return {stage, nutrient, have, absent};
}

function label(a) {
  const variant = a.variant ? ` <span class="variant">${esc(a.variant)}</span>` : '';
  return `<b>${esc(a.brand)}</b>${variant} <span class="size">${esc(a.size)}</span>`;
}

function draw() {
  const {stage, nutrient, have, absent} = current();
  el('title').textContent = `${nutrient.name} · ${stage}`;

  const plot = el('plot');
  if (!have.length) {
    el('sub').textContent = '';
    plot.innerHTML = '<p class="absent">No article of this age step declares it.</p>';
    el('tablebody').innerHTML = '';
    return;
  }
  const values = have.map(a => a.values[nutrient.name]);
  const scale = scaleFor(values);
  const mid = median(values);
  el('sub').textContent =
    `${have.length} ${have.length === 1 ? 'article' : 'articles'} · ${nutrient.unit} per 100 ml as fed`
    + (scale.lo > 0 ? ` · the scale starts at ${tick(scale.lo, scale.decimals)} not at zero` : '');

  const ticks = scale.ticks.map(t =>
    `<span class="tick" style="left:${scale.at(t)}%">${tick(t, scale.decimals)}</span>`).join('');
  const lines = scale.ticks.map(t => `<i style="left:${scale.at(t)}%"></i>`).join('')
    + `<i class="mid" style="left:${scale.at(mid)}%"></i>`
    + `<b style="left:${scale.at(mid)}%">median ${fmt(mid)}</b>`;
  const rows = have.map((a, index) => {
    const value = a.values[nutrient.name];
    return `<button class="row" type="button" data-dan="${a.dan}" data-rank="${index + 1}"
      aria-pressed="${picked.has(a.dan)}">
      <span class="who">${label(a)}</span>
      <span class="track"><span class="lead"></span>
        <span class="dot" style="left:${scale.at(value)}%"></span></span>
      <span class="val">${fmt(value)}</span></button>`;
  }).join('');

  const here = have.some(a => picked.has(a.dan));
  plot.className = 'plot' + (here ? ' picked' : '');
  plot.innerHTML =
    `<div class="axis"><span></span><span class="ticks">${ticks}</span><span></span></div>`
    + `<div class="grid">${lines}</div>${rows}`;

  el('absent').textContent = absent.length
    ? `Not declared by ${absent.length}: ` + absent.map(a => `${a.brand} ${a.variant}`.trim()).join(' · ')
    : '';

  el('tablebody').innerHTML = have.map((a, index) => `<tr>
    <td class="num">${index + 1}</td>
    <td><a href="${esc(a.url)}" rel="noreferrer">${esc(a.brand)} ${esc(a.name)}</a></td>
    <td>${esc(a.size)}</td>
    <td class="num">${fmt(a.values[nutrient.name])} ${esc(nutrient.unit)}</td>
    <td>${esc(a.texts[nutrient.name])}</td></tr>`).join('');
  el('tablecap').textContent = `${nutrient.name} · ${stage} · per 100 ml as fed`;
}

function tipFor(row) {
  const {nutrient} = current();
  const a = DATA.articles.find(x => String(x.dan) === row.dataset.dan);
  return `<b>${esc(a.brand)} ${esc(a.name)}</b>
    <span>${esc(nutrient.name)} · as declared ${esc(a.texts[nutrient.name])}</span>
    <span>rank ${esc(row.dataset.rank)} in this age step · article ${a.dan}</span>`;
}

function showTip(row) {
  const tip = el('tip');
  tip.innerHTML = tipFor(row);
  tip.hidden = false;
  const box = row.getBoundingClientRect();
  const own = tip.getBoundingClientRect();
  tip.style.left = Math.min(box.left, window.innerWidth - own.width - 12) + 'px';
  tip.style.top = (box.bottom + own.height + 12 > window.innerHeight
    ? box.top - own.height - 6 : box.bottom + 6) + 'px';
}

const plot = el('plot');
plot.addEventListener('pointerover', e => {
  const row = e.target.closest('.row');
  if (row) showTip(row);
});
plot.addEventListener('pointerout', e => {
  if (!e.relatedTarget || !e.relatedTarget.closest?.('.row')) el('tip').hidden = true;
});
plot.addEventListener('focusin', e => { if (e.target.closest('.row')) showTip(e.target); });
plot.addEventListener('focusout', () => { el('tip').hidden = true; });
plot.addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (!row) return;
  const dan = Number(row.dataset.dan);
  picked.has(dan) ? picked.delete(dan) : picked.add(dan);
  draw();
  remember();
});

function remember() {
  const asked = new URLSearchParams();
  for (const id of ['stage', 'nutrient', 'sort', 'view']) asked.set(id, el(id).value);
  if (picked.size) asked.set('pick', [...picked].join(','));
  history.replaceState(null, '', '?' + asked);
}

function restore() {
  const asked = new URLSearchParams(location.search);
  for (const id of ['stage', 'nutrient', 'sort', 'view']) {
    const want = asked.get(id);
    if (want && [...el(id).options].some(o => o.value === want)) el(id).value = want;
  }
  for (const dan of (asked.get('pick') || '').split(',').filter(Boolean)) picked.add(Number(dan));
  showView();
}

function showView() {
  const table = el('view').value === 'table';
  el('chartcard').hidden = table;
  el('tablecard').hidden = !table;
}

for (const id of ['stage', 'nutrient', 'sort']) {
  el(id).addEventListener('change', () => { draw(); remember(); });
}
el('clear').addEventListener('click', () => { picked.clear(); draw(); remember(); });
el('view').addEventListener('change', () => { showView(); remember(); });
restore();
draw();
"""

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dm Babymilch compared</title>
<style>{style}</style>
</head>
<body>
<header class="top">
  <h1>Compare like with like</h1>
  <p class="lede">{lede} <a href="views/index.html">Every nutrient at once in ten ways</a> ·
    <a href="index.html">Back to the list</a>.</p>
</header>
<div class="controls">
  <label class="control"><span>Age step</span><select id="stage">{stages}</select></label>
  <label class="control"><span>Nutrient</span><select id="nutrient">{nutrients}</select></label>
  <label class="control"><span>Order</span><select id="sort">
    <option value="value">Highest first</option>
    <option value="brand">By brand</option>
  </select></label>
  <label class="control"><span>View</span><select id="view">
    <option value="chart">Chart</option>
    <option value="table">Table</option>
  </select></label>
  <button type="button" id="clear">Clear the picks</button>
</div>
<main>
  <section class="card" id="chartcard">
    <h2 id="title"></h2>
    <p class="sub" id="sub"></p>
    <div class="plot" id="plot"></div>
    <p class="absent" id="absent"></p>
  </section>
  <section class="card" id="tablecard" hidden>
    <h2 id="tablecap"></h2>
    <p class="sub">The same figures the chart plots.</p>
    <table>
      <thead><tr>
        <th class="num">#</th><th>Article</th><th>Pack</th>
        <th class="num">Value</th><th>As declared</th>
      </tr></thead>
      <tbody id="tablebody"></tbody>
    </table>
  </section>
</main>
<div id="tip" role="tooltip" hidden></div>
<script>window.__COMPARE__ = {data};</script>
<script>{script}</script>
</body>
</html>
"""


def esc(text: Any) -> str:
    return html.escape(str(text or ""))


def safe_json(data: dict[str, Any]) -> str:
    """Write the data so no article name can close the script block holding it.

    Because a) the names come from the manufacturers b) a name holding </script> would
    end the block and let the rest render as markup c) escaping the three characters
    that can start markup keeps the JSON exactly as valid.
    """
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return raw.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def options(values: list[str], labels: list[str] | None = None, chosen: str = "") -> str:
    labels = labels or values
    return "".join(
        f'<option value="{esc(value)}"{" selected" if value == chosen else ""}>{esc(label)}</option>'
        for value, label in zip(values, labels)
    )


def page(data: dict[str, Any], gathered_on: str, repacked: int = 0) -> str:
    stages = options(data["stages"], [f"Stage {s}" if s.isdigit() else s for s in data["stages"]])
    nutrients = options(
        [n["name"] for n in data["nutrients"]],
        [f"{n['name']} ({n['unit']})" for n in data["nutrients"]],
    )
    lede = (
        f"{len(data['articles'])} powder articles measured per 100 ml as the baby drinks it. "
        f"Collected from dm.de on {gathered_on}."
    )
    gone = []
    if data["skipped"]:
        gone.append(f"{len(data['skipped'])} that declare only per 100 g")
    if repacked:
        gone.append(count(repacked, "repack"))
    if gone:
        lede += f" {' and '.join(gone)} left out."
    return TEMPLATE.format(
        style=STYLE,
        script=SCRIPT,
        lede=esc(lede),
        stages=stages,
        nutrients=nutrients,
        data=safe_json(data),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="make_chart",
        description="Build the page that compares one nutrient across one age step.",
    )
    parser.add_argument("--data", type=Path, default=Path("products.json"), help="collected JSON")
    parser.add_argument("--out", type=Path, default=Path("compare.html"), help="page to write")
    parser.add_argument(
        "--ready-to-drink",
        action="store_true",
        help="keep the trinkfertig articles which are left out by default",
    )
    parser.add_argument(
        "--repacks",
        action="store_true",
        help="keep the bigger pack of a recipe which is left out by default",
    )
    parser.add_argument(
        "--no-reference",
        action="store_true",
        help="leave out the Muttermilch reference articles which are kept by default",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    collected = json.loads(args.data.read_text(encoding="utf-8"))
    kept = collected["products"]
    if not args.no_reference and reference.available():
        kept = reference.merge(kept)
    if not args.ready_to_drink:
        kept = [product for product in kept if not ready_to_drink(product)]
    repacked = 0
    if not args.repacks:
        extra = repacks(kept)
        kept = [product for product in kept if product["dan"] not in extra]
        repacked = len(extra)
    data = build(kept)
    stamp = datetime.date.fromtimestamp(args.data.stat().st_mtime)
    args.out.write_text(
        page(data, f"{stamp.day} {stamp:%B} {stamp.year}", repacked), encoding="utf-8"
    )
    size = args.out.stat().st_size / 1024
    print(
        f"{args.out} compares {len(data['articles'])} articles "
        f"over {len(data['nutrients'])} nutrients and weighs {size:.0f} kB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
