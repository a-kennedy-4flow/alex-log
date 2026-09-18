"""Builds four ways of showing every nutrient of one age step at once.

One builder emits every option. Because a) four hand copied shells drift within a day
b) a drifted shell ruins the comparison it was built for c) the options may then only
differ in the one function that draws the marks.
"""

from __future__ import annotations

import argparse
import datetime
import json
import statistics
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import compare_data  # noqa: E402
import reference  # noqa: E402
from compare_data import MOTHER, build  # noqa: E402
from make_chart import esc, options, safe_json  # noqa: E402
from make_page import ready_to_drink, repacks  # noqa: E402

MIN_SHARE = 0.5
CLAMP = 200


def shape(data: dict[str, Any]) -> dict[str, Any]:
    """Give every age step the nutrient list the four views draw.

    Because a) a nutrient a step barely declares leaves holes in every view b) the
    median of the step is what puts a microgram beside a kilocalorie c) both belong to
    the step rather than to the article so they are worked out once here.
    """
    held: dict[str, list[dict[str, Any]]] = {}
    for article in data["articles"]:
        held.setdefault(article["stage"], []).append(article)
    stages = []
    for name in data["stages"]:
        articles = held[name]
        nutrients = []
        for nutrient in data["nutrients"]:
            values = [
                article["values"][nutrient["name"]]
                for article in articles
                if nutrient["name"] in article["values"]
            ]
            if not values or len(values) < len(articles) * MIN_SHARE:
                continue
            nutrients.append(
                {
                    "name": nutrient["name"],
                    "unit": nutrient["unit"],
                    "median": statistics.median(values),
                    "low": min(values),
                    "high": max(values),
                    "count": len(values),
                }
            )
        span = compare_data.age_span(articles[0]["name"]) if articles else None
        start = compare_data.sold_from(articles)
        stages.append({
            "name": name,
            "nutrients": nutrients,
            "articles": len(articles),
            "from": start,
            "to": span[1] if span and span[1] is not None else None,
        })
    # the age each step covers runs up to the age the next step starts at
    edges = sorted({s["from"] for s in stages
                    if s["from"] is not None and s["name"] not in compare_data.REFERENCES})
    for stage in stages:
        if stage["name"] in compare_data.REFERENCES or stage["from"] is None:
            continue
        later = [edge for edge in edges if edge > stage["from"]]
        stage["to"] = later[0] if later else None
    windows = []
    for article in held.get(MOTHER, []):
        span = compare_data.age_span(article["name"])
        if span and span[1] is not None:
            windows.append({"dan": article["dan"], "variant": article["variant"],
                            "from": span[0], "to": span[1]})
    windows.sort(key=lambda window: window["from"])
    return {
        "stages": stages,
        "nutrients": data["nutrients"],
        "articles": data["articles"],
        "skipped": data["skipped"],
        "against": compare_data.against(data),
        "windows": windows,
    }


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
  --mid: #f0efec;
  --low3: #184f95;
  --low2: #3987e5;
  --low1: #86b6ef;
  --high1: #eda3a3;
  --high2: #e06a6a;
  --high3: #b83232;
  --ink0: #ffffff;
  --ink1: #16181d;
  --ink2: #16181d;
  --ink3: #16181d;
  --ink4: #16181d;
  --ink5: #16181d;
  --ink6: #ffffff;
  --radius: 10px;
  --who: 17rem;
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
    --mid: #383835;
    --low3: #86b6ef;
    --low2: #3987e5;
    --low1: #1c5cab;
    --high1: #8a3535;
    --high2: #c14a4a;
    --high3: #e66767;
    --ink0: #16181d;
    --ink1: #16181d;
    --ink2: #ffffff;
    --ink3: #ffffff;
    --ink4: #ffffff;
    --ink5: #ffffff;
    --ink6: #16181d;
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
a { color: var(--accent); }
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: end;
  padding: 0.75rem 1.25rem 1rem;
  border-bottom: 1px solid var(--line);
}
.control { display: grid; gap: 0.15rem; }
.control span {
  color: var(--quiet);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
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
main { padding: 1rem 1.25rem 1rem; }
.card {
  padding: 1rem 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  overflow-x: auto;
}
.card h2 { margin: 0; font-size: 1rem; }
.card .sub { margin: 0.15rem 0 1rem; color: var(--quiet); font-size: 0.82rem; }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  align-items: center;
  margin: 0 0 0.9rem;
  color: var(--quiet);
  font-size: 0.78rem;
}
.legend i {
  display: inline-block;
  width: 0.85rem;
  height: 0.85rem;
  margin-right: 0.3rem;
  border-radius: 3px;
  vertical-align: -0.12rem;
}
.legend .dot { border-radius: 50%; width: 0.6rem; height: 0.6rem; }
.note { margin: 1rem 0 0; color: var(--quiet); font-size: 0.8rem; }
#pack:empty { display: none; }
.cost {
  margin: 1rem 1.25rem 3rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  background: var(--card);
  font-size: 0.85rem;
}
.cost h2 { margin: 0 0 0.3rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--quiet); }
.cost p { margin: 0 0 0.5rem; }
.cost p:last-child { margin-bottom: 0; }
.cost b { font-weight: 600; }
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
#tip span { display: block; color: var(--quiet); }
table { border-collapse: collapse; font-size: 0.82rem; }
th, td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
thead th { color: var(--quiet); font-size: 0.76rem; vertical-align: bottom; }
tbody tr:hover { background: var(--band); }
th.who, td.who { position: sticky; left: 0; background: var(--card); }
tbody tr:hover th.who, tbody tr:hover td.who { background: var(--band); }
.who b { font-weight: 600; }
.who .variant { color: var(--quiet); font-weight: 400; }
.who .size { color: var(--deemph); font-size: 0.75rem; }
a.what { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--quiet); }
a.what:hover, a.what:focus { color: var(--accent); border-bottom-color: var(--accent); }
"""

PANEL_STYLE = """
.panels { display: grid; grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr)); gap: 1.1rem 1.4rem; }
.panel h3 {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.panel h3 span { color: var(--quiet); font-weight: 400; }
.strip { position: relative; height: 26px; margin-top: 0.2rem; }
.strip .axis {
  position: absolute;
  left: 5px;
  right: 5px;
  top: 50%;
  height: 1px;
  background: var(--line);
}
.strip .mid { position: absolute; top: 3px; bottom: 3px; width: 1px; background: var(--ink); opacity: 0.45; }
.strip .dot {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: var(--series);
  box-shadow: 0 0 0 2px var(--card);
  cursor: pointer;
}
.picked .strip .dot { background: var(--deemph); opacity: 0.5; }
.picked .strip .dot.on { background: var(--series); opacity: 1; z-index: 2; }
.ends { display: flex; justify-content: space-between; color: var(--deemph); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
"""

INDEX_STYLE = """
.rows { position: relative; }
.irow {
  display: grid;
  grid-template-columns: var(--who) minmax(0, 1fr) 5.5rem;
  align-items: center;
  gap: 0 0.75rem;
  height: 26px;
  border-radius: 4px;
}
.irow:hover { background: var(--band); }
.irow .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.82rem; }
.irow .name span { color: var(--quiet); }
.irow .val { text-align: right; font-size: 0.78rem; font-variant-numeric: tabular-nums; color: var(--quiet); }
.track { position: relative; height: 100%; }
.track .rule { position: absolute; left: 5px; right: 5px; top: 50%; height: 1px; background: var(--line); }
.rows .dot {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: var(--series);
  box-shadow: 0 0 0 2px var(--card);
  cursor: pointer;
}
.rows .dot.over { border-radius: 2px; width: 7px; height: 11px; margin: -5.5px 0 0 -3.5px; }
.rows.picked .dot { background: var(--deemph); opacity: 0.5; }
.rows.picked .dot.on { background: var(--series); opacity: 1; z-index: 2; }
.scale { display: grid; grid-template-columns: var(--who) minmax(0, 1fr) 5.5rem; gap: 0 0.75rem; height: 1.4rem; }
.scale .ticks { position: relative; }
.scale .tick {
  position: absolute;
  transform: translateX(-50%);
  color: var(--quiet);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}
.lines { position: absolute; top: 0; bottom: 0; left: calc(var(--who) + 0.75rem); right: calc(5.5rem + 0.75rem); pointer-events: none; }
.lines i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
.lines i.hundred { background: var(--ink); opacity: 0.5; }
"""

HEAT_STYLE = """
.heat { display: grid; gap: 2px; }
.hrow { display: grid; grid-template-columns: var(--who) repeat(var(--cols), minmax(13px, 1fr)); gap: 2px; align-items: center; }
.hrow .who { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.8rem; cursor: pointer; }
.hrow.on .who b { color: var(--accent); }
.cell { height: 18px; border-radius: 2px; background: var(--mid); cursor: pointer; }
.cell.b0 { background: var(--low3); }
.cell.b1 { background: var(--low2); }
.cell.b2 { background: var(--low1); }
.cell.b3 { background: var(--mid); }
.cell.b4 { background: var(--high1); }
.cell.b5 { background: var(--high2); }
.cell.b6 { background: var(--high3); }
.cell.none { background: repeating-linear-gradient(45deg, var(--band), var(--band) 3px, var(--card) 3px, var(--card) 6px); }
.heads { display: grid; grid-template-columns: var(--who) repeat(var(--cols), minmax(13px, 1fr)); gap: 2px; align-items: end; margin-bottom: 4px; }
.heads span {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  overflow: hidden;
  max-height: 11rem;
  color: var(--quiet);
  font-size: 0.7rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.hrow.dim .cell { opacity: 0.35; }
.hrow.on .cell { opacity: 1; }
"""

PROFILE_STYLE = """
.lines svg { display: block; }
.lines path { fill: none; stroke: var(--series); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.lines path.field { stroke: var(--series); stroke-width: 1.5; opacity: 0.32; cursor: pointer; }
.lines path.rest { stroke: var(--deemph); stroke-width: 1.5; opacity: 0.4; cursor: pointer; }
.lines path.field:hover, .lines path.rest:hover { opacity: 1; stroke: var(--ink); }
.lines path.on { stroke: var(--series); opacity: 1; stroke-width: 2.5; }
.lines .guide { stroke: var(--ink); stroke-width: 1; opacity: 0.5; }
.lines .grid { stroke: var(--line); stroke-width: 1; }
.lines text { fill: var(--quiet); font-size: 10px; }
.lines text.tick { font-variant-numeric: tabular-nums; }
.foot { display: flex; gap: 1rem; margin-top: 0.4rem; color: var(--quiet); font-size: 0.78rem; }
"""

SCRIPT = """
const DATA = window.__VIEWS__;
const MARKUP = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'};
// Every string below is what a manufacturer wrote so none of it may reach the DOM as markup.
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => MARKUP[c]);
const el = id => document.getElementById(id);
const fmt = v => v.toLocaleString('de-DE', {maximumSignificantDigits: 3});
const whole = v => Math.round(v).toLocaleString('de-DE');
const picked = new Set();
const CLAMP = __CLAMP__;
const BINS = [60, 80, 95, 105, 125, 160];

const stages = new Map(DATA.stages.map(s => [s.name, s]));
const byStage = new Map();
const byDan = new Map();
for (const a of DATA.articles) {
  if (!byStage.has(a.stage)) byStage.set(a.stage, []);
  byStage.get(a.stage).push(a);
  byDan.set(a.dan, a);
}

const spread = n => n.median ? (n.high - n.low) / n.median : 0;
const share = (value, n) => n.median ? value / n.median * 100 : 100;
const held = p => Math.max(0, Math.min(CLAMP, p));
const binOf = p => { let i = 0; while (i < BINS.length && p >= BINS[i]) i += 1; return i; };

const has = id => el(id) !== null;
const CONTROLS = ['stage', 'sort', 'order', 'spokes', 'nutrient', 'x', 'y', 'who', 'measure', 'view'];
// An age step that is not an age step. A medical food is held out of every step to step
// comparison because it is not sold as the next milk of a growing child.
const LADDER = DATA.stages.filter(s => s.name !== 'Spezialnahrung');

// Breast milk and a formula step meet only on an age the two both cover. The pairing is
// worked out in Python and arrives here already matched.
const AGAINST = new Map((DATA.against || []).map(p => [p.stage, p]));
const WINDOWS = DATA.windows || [];
// A reference is a milk a step is read against rather than a rung of the ladder.
const REFERENCES = ['Muttermilch', 'Kuhmilch'];
const isReference = name => REFERENCES.includes(name);

// Every nutrient named anywhere leads to the page that says what it is. The fold has to
// match make_profiles.file_of or the link lands nowhere.
const slugOf = name => name.replace(/\u00df/g, 'ss').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nameLink = name =>
  `<a class="what" href="../profiles/${slugOf(name)}.html">${esc(name)}</a>`;
// The ratios run from a fifth to a hundred and twelve so the axis counts doublings.
const OCT = [-3, 7];
const atOct = r => Math.min(1, Math.max(0, (Math.log2(r) - OCT[0]) / (OCT[1] - OCT[0])));
const times = r => (r >= 10 ? whole(r) : fmt(r)) + '\u00d7';
const ratioOf = n => (n.milk.median ? n.field.median / n.milk.median : 1);

function pair() {
  const want = has('stage') ? el('stage').value : '';
  return AGAINST.get(want) || (DATA.against || [])[0] || null;
}

function orderedPairs(list) {
  const how = has('order') ? el('order').value : 'gap';
  const out = list.slice();
  if (how === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (how === 'gap') out.sort((a, b) =>
    Math.abs(Math.log2(ratioOf(b))) - Math.abs(Math.log2(ratioOf(a))));
  return out;
}

function milkTip(n) {
  return `${esc(n.name)} \u00b7 reference median ${fmt(n.milk.median)} ${esc(n.unit)}`
    + ` \u00b7 ${fmt(n.milk.low)} to ${fmt(n.milk.high)} over ${n.milk.count} windows`;
}

function fieldTip(n, stage) {
  return `${esc(n.name)} \u00b7 ${esc(stage)} median ${fmt(n.field.median)} ${esc(n.unit)}`
    + ` \u00b7 ${fmt(n.field.low)} to ${fmt(n.field.high)} over ${n.field.count} articles`;
}

const byName = new Map();
for (const stage of DATA.stages) {
  for (const n of stage.nutrients) {
    if (!byName.has(n.name)) byName.set(n.name, {name: n.name, unit: n.unit, steps: new Map()});
    byName.get(n.name).steps.set(stage.name, n);
  }
}
const across = DATA.nutrients.map(n => byName.get(n.name)).filter(Boolean);

function ordered(nutrients) {
  const list = nutrients.slice();
  const how = has('sort') ? el('sort').value : 'macros';
  if (how === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (how === 'spread') list.sort((a, b) => reach(b) - reach(a));
  return list;
}

function reach(n) {
  if (n.median !== undefined) return spread(n);
  const steps = [...n.steps.values()];
  const mid = steps.map(s => s.median).filter(v => v > 0);
  return mid.length > 1 ? Math.max(...mid) / Math.min(...mid) : 0;
}

function context() {
  const stage = has('stage') ? (stages.get(el('stage').value) || DATA.stages[0]) : null;
  const articles = (stage ? byStage.get(stage.name) || [] : DATA.articles).slice().sort(
    (a, b) => (a.brand + ' ' + a.variant).localeCompare(b.brand + ' ' + b.variant, 'de'));
  const nutrients = ordered(stage ? stage.nutrients : across);
  return {stage, articles, nutrients};
}

function label(a) {
  const variant = a.variant ? ` <span class="variant">${esc(a.variant)}</span>` : '';
  return `<b>${esc(a.brand)}</b>${variant} <span class="size">${esc(a.size)}</span>`;
}

function tipFor(dan, name) {
  const a = byDan.get(Number(dan));
  if (!a) return '';
  const stage = stages.get(a.stage);
  const n = stage.nutrients.find(x => x.name === name);
  if (!n) return `<b>${esc(a.brand)} ${esc(a.name)}</b>`;
  const value = a.values[n.name];
  const part = value === undefined ? 'not declared'
    : `${whole(share(value, n))}% of the median ${fmt(n.median)} ${esc(n.unit)}`;
  return `<b>${esc(a.brand)} ${esc(a.name)}</b>
    <span>${esc(n.name)} · ${value === undefined ? '—' : esc(a.texts[n.name])}</span>
    <span>${part}</span>`;
}

function showTip(node, html) {
  const tip = el('tip');
  tip.innerHTML = html;
  tip.hidden = false;
  const box = node.getBoundingClientRect();
  const own = tip.getBoundingClientRect();
  tip.style.left = Math.max(6, Math.min(box.left, window.innerWidth - own.width - 12)) + 'px';
  tip.style.top = (box.bottom + own.height + 12 > window.innerHeight
    ? box.top - own.height - 6 : box.bottom + 6) + 'px';
}

function markOf(event) {
  const node = event.target.closest('[data-dan],[data-tip]');
  return node && el('plot').contains(node) ? node : null;
}

el('plot').addEventListener('pointerover', event => {
  const node = markOf(event);
  if (!node) return;
  if (node.dataset.tip) {
    // The text is what a manufacturer wrote so it is set as text and never as markup.
    el('tip').textContent = node.dataset.tip;
    showTip(node, el('tip').innerHTML);
  } else {
    showTip(node, tipFor(node.dataset.dan, node.dataset.nutrient));
  }
});
el('plot').addEventListener('pointerout', () => { el('tip').hidden = true; });
el('plot').addEventListener('click', event => {
  const node = markOf(event);
  if (!node || !node.dataset.dan) return;
  const dan = Number(node.dataset.dan);
  picked.has(dan) ? picked.delete(dan) : picked.add(dan);
  draw();
  remember();
});

function defaultTable({stage, articles, nutrients}) {
  el('tablecap').textContent = `${stage.name} · every nutrient per 100 ml as fed`;
  el('tablehead').innerHTML = '<th class="who">Article</th><th>Pack</th>'
    + nutrients.map(n => `<th>${nameLink(n.name)}<br><span>${esc(n.unit)}</span></th>`).join('');
  el('tablebody').innerHTML = articles.map(a => `<tr>
    <th class="who" scope="row"><a href="${esc(a.url)}" rel="noreferrer">${esc(a.brand)} ${esc(a.name)}</a></th>
    <td>${esc(a.size)}</td>`
    + nutrients.map(n => n.name in a.values
      ? `<td class="num">${esc(a.texts[n.name])}</td>`
      : '<td class="num">—</td>').join('')
    + '</tr>').join('');
}

function draw() {
  const ctx = context();
  el('title').textContent = ctx.stage ? `Every nutrient · ${ctx.stage.name}` : 'Every nutrient';
  el('sub').textContent = `${ctx.articles.length} powder articles · ${ctx.nutrients.length} nutrients`
    + ` each declared by at least half of a step · per 100 ml as fed`;
  drawChart(ctx);
  (typeof viewTable === 'function' ? viewTable : defaultTable)(ctx);
}

function remember() {
  const asked = new URLSearchParams();
  for (const id of CONTROLS) if (has(id)) asked.set(id, el(id).value);
  if (picked.size) asked.set('pick', [...picked].join(','));
  history.replaceState(null, '', '?' + asked);
}

function showView() {
  const table = el('view').value === 'table';
  el('chartcard').hidden = table;
  el('tablecard').hidden = !table;
}

function restore() {
  const asked = new URLSearchParams(location.search);
  for (const id of CONTROLS) {
    const want = asked.get(id);
    if (has(id) && want && [...el(id).options].some(o => o.value === want)) el(id).value = want;
  }
  for (const dan of (asked.get('pick') || '').split(',').filter(Boolean)) picked.add(Number(dan));
  showView();
}

for (const id of CONTROLS) {
  if (id !== 'view' && has(id)) el(id).addEventListener('change', () => { draw(); remember(); });
}
if (has('clear')) {
  el('clear').addEventListener('click', () => { picked.clear(); draw(); remember(); });
}
el('view').addEventListener('change', () => { showView(); remember(); });
restore();
draw();
"""

PANEL_DRAW = """
function drawChart({articles, nutrients}) {
  const here = articles.some(a => picked.has(a.dan));
  const panels = nutrients.map(n => {
    const at = v => n.high === n.low ? 0.5 : (v - n.low) / (n.high - n.low);
    const inset = f => `calc(5px + (100% - 10px) * ${f.toFixed(4)})`;
    const dots = articles.filter(a => n.name in a.values).map(a =>
      `<i class="dot${picked.has(a.dan) ? ' on' : ''}" data-dan="${a.dan}"
        data-nutrient="${esc(n.name)}" style="left:${inset(at(a.values[n.name]))}"></i>`).join('');
    return `<section class="panel">
      <h3>${nameLink(n.name)} <span>${esc(n.unit)}</span></h3>
      <div class="strip"><i class="axis"></i><i class="mid" style="left:${inset(at(n.median))}"></i>${dots}</div>
      <p class="ends"><span>${fmt(n.low)}</span><span>${fmt(n.high)}</span></p>
    </section>`;
  }).join('');
  el('plot').className = 'panels' + (here ? ' picked' : '');
  el('plot').innerHTML = panels;
}
"""

INDEX_DRAW = """
const inset = f => `calc(5px + (100% - 10px) * ${f.toFixed(4)})`;

function drawChart({articles, nutrients}) {
  const here = articles.some(a => picked.has(a.dan));
  const ticks = [0, 50, 100, 150, 200];
  const rows = nutrients.map(n => {
    const dots = articles.filter(a => n.name in a.values).map(a => {
      const part = share(a.values[n.name], n);
      const off = part > CLAMP ? ' over' : '';
      return `<i class="dot${off}${picked.has(a.dan) ? ' on' : ''}" data-dan="${a.dan}"
        data-nutrient="${esc(n.name)}" style="left:${inset(held(part) / CLAMP)}"></i>`;
    }).join('');
    return `<div class="irow">
      <span class="name">${nameLink(n.name)} <span>${esc(n.unit)}</span></span>
      <span class="track"><i class="rule"></i>${dots}</span>
      <span class="val">${fmt(n.median)}</span></div>`;
  }).join('');
  const lines = ticks.map(t =>
    `<i class="${t === 100 ? 'hundred' : ''}" style="left:${inset(t / CLAMP)}"></i>`).join('');
  const scale = ticks.map(t =>
    `<span class="tick" style="left:${inset(t / CLAMP)}">${t}%</span>`).join('');
  el('plot').className = 'rows' + (here ? ' picked' : '');
  el('plot').innerHTML =
    `<div class="scale"><span></span><span class="ticks">${scale}</span><span class="val">median</span></div>`
    + `<div class="lines">${lines}</div>${rows}`;
}
"""

HEAT_DRAW = """
function drawChart({articles, nutrients}) {
  const here = articles.some(a => picked.has(a.dan));
  const heads = '<span></span>' + nutrients.map(n => `<span>${nameLink(n.name)}</span>`).join('');
  const rows = articles.map(a => {
    const cells = nutrients.map(n => {
      if (!(n.name in a.values)) {
        return `<i class="cell none" data-dan="${a.dan}" data-nutrient="${esc(n.name)}"></i>`;
      }
      const bin = binOf(share(a.values[n.name], n));
      return `<i class="cell b${bin}" data-dan="${a.dan}" data-nutrient="${esc(n.name)}"></i>`;
    }).join('');
    const state = picked.has(a.dan) ? ' on' : (here ? ' dim' : '');
    return `<div class="hrow${state}"><span class="who" data-dan="${a.dan}">${label(a)}</span>${cells}</div>`;
  }).join('');
  el('plot').className = 'heat';
  el('plot').style.setProperty('--cols', nutrients.length);
  el('plot').innerHTML = `<div class="heads">${heads}</div>${rows}`;
}
"""

PROFILE_DRAW = """
const PAD = {top: 12, right: 14, bottom: 148, left: 46};
const HEIGHT = 380;

function drawChart({articles, nutrients}) {
  const plot = el('plot');
  const here = articles.some(a => picked.has(a.dan));
  plot.className = 'lines';
  const width = Math.max(560, plot.clientWidth || 900);
  const inner = width - PAD.left - PAD.right;
  const step = nutrients.length > 1 ? inner / (nutrients.length - 1) : 0;
  const x = i => PAD.left + i * step;
  const y = p => PAD.top + (1 - held(p) / CLAMP) * HEIGHT;
  const ticks = [0, 50, 100, 150, 200].map(t =>
    `<line class="${t === 100 ? 'guide' : 'grid'}" x1="${PAD.left}" x2="${width - PAD.right}"
      y1="${y(t)}" y2="${y(t)}"></line>
     <text class="tick" x="${PAD.left - 8}" y="${y(t) + 3}" text-anchor="end">${t}%</text>`).join('');
  const foot = PAD.top + HEIGHT + 8;
  // The names stand on end. Because a) forty three of them share the width b) a slant
  // overlaps its neighbour at that spacing c) upright reading costs no width at all.
  const names = nutrients.map((n, i) =>
    `<text x="${x(i)}" y="${foot}" text-anchor="end"
      transform="rotate(-90 ${x(i)} ${foot})">${esc(n.name.slice(0, 24))}</text>`).join('');
  const paths = articles.map(a => {
    const points = [];
    nutrients.forEach((n, i) => {
      if (n.name in a.values) points.push(`${x(i).toFixed(1)},${y(share(a.values[n.name], n)).toFixed(1)}`);
    });
    if (points.length < 2) return '';
    const state = picked.has(a.dan) ? 'on' : (here ? 'rest' : 'field');
    return `<path class="${state}" data-dan="${a.dan}" d="M${points.join('L')}"></path>`;
  }).join('');
  plot.innerHTML = `<svg width="${width}" height="${PAD.top + HEIGHT + PAD.bottom}"
    viewBox="0 0 ${width} ${PAD.top + HEIGHT + PAD.bottom}" role="img"
    aria-label="One line per article across every nutrient">${ticks}${paths}${names}</svg>`;
}

let waiting;
window.addEventListener('resize', () => { clearTimeout(waiting); waiting = setTimeout(draw, 120); });
"""

PANEL_LEGEND = """<span><i class="dot" style="background:var(--series)"></i>one article</span>
<span><i style="width:1px;height:0.85rem;background:var(--ink);opacity:0.45"></i>the median of the step</span>
<span>Each panel holds its own scale in its own unit. Click a dot to hold that article across every panel.</span>"""

INDEX_LEGEND = """<span><i class="dot" style="background:var(--series)"></i>one article</span>
<span><i style="width:1px;height:0.85rem;background:var(--ink);opacity:0.5"></i>100% is the median of the step</span>
<span>A square at the right edge is a value above 200%. Click a dot to hold that article.</span>"""

HEAT_LEGEND = """<span>Share of the median</span>
<span><i style="background:var(--low3)"></i>under 60%</span>
<span><i style="background:var(--low2)"></i>60 to 80</span>
<span><i style="background:var(--low1)"></i>80 to 95</span>
<span><i style="background:var(--mid)"></i>95 to 105</span>
<span><i style="background:var(--high1)"></i>105 to 125</span>
<span><i style="background:var(--high2)"></i>125 to 160</span>
<span><i style="background:var(--high3)"></i>over 160</span>
<span><i class="none" style="background:var(--band)"></i>not declared</span>"""

PROFILE_LEGEND = """<span><i style="width:1.1rem;height:2px;background:var(--series);opacity:0.5"></i>one article</span>
<span><i style="width:1.1rem;height:2px;background:var(--series)"></i>held</span>
<span><i style="width:1.1rem;height:1px;background:var(--ink);opacity:0.5"></i>100% is the median of the step</span>
<span>Click a line to hold it. A value above 200% is drawn at the ceiling.</span>"""

LADDER_STYLE = """
.grid { display: grid; grid-template-columns: repeat(auto-fill, 13.5rem); gap: 1rem 1.1rem; }
.small h3 {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.small h3 span { color: var(--quiet); font-weight: 400; }
.small svg { display: block; }
.small .band { fill: var(--series); opacity: 0.12; }
.small .line { fill: none; stroke: var(--series); stroke-width: 2; stroke-linejoin: round; }
.small .mark { fill: var(--series); }
.small .mark:hover { fill: var(--ink); }
.small .base { stroke: var(--line); stroke-width: 1; }
.ends { display: flex; justify-content: space-between; color: var(--deemph); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
"""

MATRIX_STYLE = """
.matrix { display: grid; gap: 2px; min-width: 44rem; }
.mrow { display: grid; grid-template-columns: var(--who) 6rem repeat(var(--cols), minmax(3.4rem, 1fr)); gap: 2px; align-items: center; }
.mrow .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.8rem; }
.mrow .name span { color: var(--quiet); }
.mrow .base { text-align: right; color: var(--quiet); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.mhead { display: grid; grid-template-columns: var(--who) 6rem repeat(var(--cols), minmax(3.4rem, 1fr)); gap: 2px; margin-bottom: 4px; }
.mhead span { color: var(--quiet); font-size: 0.76rem; text-align: center; }
.mhead .base { text-align: right; }
.cell {
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 3px;
  background: var(--mid);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  cursor: default;
}
.cell.b0 { background: var(--low3); color: #ffffff; }
.cell.b1 { background: var(--low2); color: #ffffff; }
.cell.b2 { background: var(--low1); color: var(--onlight); }
.cell.b3 { background: var(--mid); color: var(--onlight); }
.cell.b4 { background: var(--high1); color: var(--onlight); }
.cell.b5 { background: var(--high2); color: var(--onlight); }
.cell.b6 { background: var(--high3); color: #ffffff; }
.cell.none { background: repeating-linear-gradient(45deg, var(--band), var(--band) 3px, var(--card) 3px, var(--card) 6px); color: var(--quiet); }
.cell.here { outline: 2px solid var(--ink); outline-offset: -2px; }
"""

PAIRS_STYLE = """
.facets { display: grid; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); gap: 1.2rem; }
.facet { padding-left: 2.5rem; }
.facet h3 { margin: 0 0 0.3rem -2.5rem; font-size: 0.82rem; }
.facet h3 span { color: var(--quiet); font-weight: 400; }
.field {
  position: relative;
  height: 12rem;
  border-left: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.field i {
  position: absolute;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: var(--series);
  box-shadow: 0 0 0 2px var(--card);
  cursor: pointer;
}
.facets.picked i { background: var(--deemph); opacity: 0.45; }
.facets.picked i.on { background: var(--series); opacity: 1; z-index: 2; }
.field b {
  position: absolute;
  left: -2.4rem;
  width: 2rem;
  text-align: right;
  color: var(--deemph);
  font-size: 0.7rem;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.field b.high { top: -0.45rem; }
.field b.low { bottom: -0.45rem; }
.frame { display: flex; justify-content: space-between; color: var(--deemph); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
.axes { margin: 0 0 0.9rem; color: var(--quiet); font-size: 0.8rem; }
"""

BARS_STYLE = """
.bars { display: grid; gap: 2px; }
.bar { display: grid; grid-template-columns: var(--who) minmax(0, 1fr) 4.5rem; gap: 0 0.75rem; align-items: center; height: 24px; border-radius: 4px; }
.bar:hover { background: var(--band); }
.bar .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.82rem; }
.bar .name span { color: var(--quiet); }
.bar .track { position: relative; height: 12px; }
.bar .fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--series); border-radius: 0 4px 4px 0; }
.bar .val { text-align: right; font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.scale { display: grid; grid-template-columns: var(--who) minmax(0, 1fr) 4.5rem; gap: 0 0.75rem; height: 1.3rem; }
.scale .ticks { position: relative; }
.scale .tick { position: absolute; transform: translateX(-50%); color: var(--quiet); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
"""

CARD_STYLE = """
.pack { margin: 0 0 1rem; font-size: 0.85rem; }
.pack b { font-weight: 600; }
.pack span { color: var(--quiet); }
.rows { position: relative; }
.drow { display: grid; grid-template-columns: var(--who) minmax(0, 1fr) 8rem; gap: 0 0.75rem; align-items: center; height: 24px; border-radius: 4px; }
.drow:hover { background: var(--band); }
.drow .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.82rem; }
.drow .name span { color: var(--quiet); }
.drow .track { position: relative; height: 14px; }
.drow .mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--ink); opacity: 0.45; }
.drow .fill { position: absolute; top: 2px; bottom: 2px; }
.drow .fill.under { background: var(--low2); border-radius: 4px 0 0 4px; }
.drow .fill.over { background: var(--high2); border-radius: 0 4px 4px 0; }
.drow .val { text-align: right; font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.drow .val span { color: var(--quiet); }
.dscale { display: grid; grid-template-columns: var(--who) minmax(0, 1fr) 8rem; gap: 0 0.75rem; height: 1.3rem; }
.dscale .ticks { position: relative; }
.dscale .tick { position: absolute; transform: translateX(-50%); color: var(--quiet); font-size: 0.72rem; font-variant-numeric: tabular-nums; }
"""

BALANCE_STYLE = """
.stacks { display: grid; gap: 3px; }
.stack { display: grid; grid-template-columns: var(--who) minmax(0, 1fr) 4rem; gap: 0 0.75rem; align-items: center; height: 26px; border-radius: 4px; cursor: pointer; }
.stack:hover { background: var(--band); }
.stack.on .who b { color: var(--accent); }
.stack .who { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 0.8rem; }
.stack .bar { position: relative; display: flex; height: 14px; }
.stack .bar::after {
  content: "";
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: var(--ink);
  opacity: 0.35;
}
.stack .half { display: flex; width: 50%; }
.stack .half.left { justify-content: flex-end; }
.stack .seg { flex: 0 0 auto; height: 100%; }
.stack .seg.b0 { background: var(--low3); }
.stack .seg.b1 { background: var(--low2); }
.stack .seg.b2 { background: var(--low1); }
.stack .seg.b3 { background: var(--mid); }
.stack .seg.b4 { background: var(--high1); }
.stack .seg.b5 { background: var(--high2); }
.stack .seg.b6 { background: var(--high3); }
.stack .half.left .seg:first-child { border-radius: 4px 0 0 4px; }
.stack .half.right .seg:last-child { border-radius: 0 4px 4px 0; }
.stacks.picked .stack:not(.on) .seg { opacity: 0.35; }
.stack .val { text-align: right; font-size: 0.78rem; font-variant-numeric: tabular-nums; color: var(--quiet); }
"""

LADDER_DRAW = """
const W = 210, H = 62, PAD = 7;

function drawChart({nutrients}) {
  const steps = LADDER;
  const at = i => PAD + i * (W - 2 * PAD) / Math.max(1, steps.length - 1);
  const panels = nutrients.map(n => {
    const seen = steps.map(s => n.steps.get(s.name) || null);
    if (seen.filter(Boolean).length < 2) return '';
    const lows = seen.filter(Boolean).map(s => s.low);
    const highs = seen.filter(Boolean).map(s => s.high);
    let lo = Math.min(...lows), hi = Math.max(...highs);
    if (hi === lo) { hi = lo + 1; }
    const y = v => H - PAD - (v - lo) / (hi - lo) * (H - 2 * PAD);
    const band = seen.map((s, i) => s ? `${at(i).toFixed(1)},${y(s.high).toFixed(1)}` : null).filter(Boolean)
      .concat(seen.map((s, i) => s ? `${at(i).toFixed(1)},${y(s.low).toFixed(1)}` : null).filter(Boolean).reverse());
    const line = seen.map((s, i) => s ? `${at(i).toFixed(1)},${y(s.median).toFixed(1)}` : null).filter(Boolean);
    const marks = seen.map((s, i) => s
      ? `<circle class="mark" cx="${at(i).toFixed(1)}" cy="${y(s.median).toFixed(1)}" r="3"
          data-tip="${esc(n.name)} · ${esc(steps[i].name)} · median ${fmt(s.median)} ${esc(n.unit)} · ${fmt(s.low)} to ${fmt(s.high)} over ${s.count} articles"></circle>`
      : '').join('');
    return `<section class="small">
      <h3>${nameLink(n.name)} <span>${esc(n.unit)}</span></h3>
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="${esc(n.name)} across the age steps">
        <polygon class="band" points="${band.join(' ')}"></polygon>
        <polyline class="line" points="${line.join(' ')}"></polyline>${marks}</svg>
      <p class="ends"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></p>
    </section>`;
  }).join('');
  el('plot').className = 'grid';
  el('plot').innerHTML = panels;
  el('legend').textContent = 'Left to right in every panel: '
    + LADDER.map(s => s.name).join(' · ')
    + '. A line only spans the steps where at least half the articles declare the nutrient.';
}

function viewTable({nutrients}) {
  el('tablecap').textContent = 'The median of every step';
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th>Unit</th>'
    + LADDER.map(s => `<th class="num">${esc(s.name)}</th>`).join('');
  el('tablebody').innerHTML = nutrients.map(n => `<tr>
    <th class="who" scope="row">${nameLink(n.name)}</th><td>${esc(n.unit)}</td>`
    + LADDER.map(s => {
        const step = n.steps.get(s.name);
        return `<td class="num">${step ? fmt(step.median) : '—'}</td>`;
      }).join('')
    + '</tr>').join('');
}
"""

MATRIX_DRAW = """
function baseOf(n) {
  for (const s of LADDER) if (n.steps.has(s.name)) return s.name;
  return null;
}

function drawChart({nutrients}) {
  const heads = '<span class="name"></span><span class="base">base median</span>'
    + LADDER.map(s => `<span>${esc(s.name)}</span>`).join('');
  const rows = nutrients.map(n => {
    const base = baseOf(n);
    if (!base) return '';
    const anchor = n.steps.get(base).median;
    const cells = LADDER.map(s => {
      const step = n.steps.get(s.name);
      if (!step) return `<span class="cell none" data-tip="${esc(n.name)} · ${esc(s.name)} · not declared by half the step">—</span>`;
      const part = anchor ? step.median / anchor * 100 : 100;
      const here = s.name === base ? ' here' : '';
      return `<span class="cell b${binOf(part)}${here}"
        data-tip="${esc(n.name)} · ${esc(s.name)} · median ${fmt(step.median)} ${esc(n.unit)} · ${whole(part)}% of ${esc(base)} over ${step.count} articles">${whole(part)}%</span>`;
    }).join('');
    return `<div class="mrow">
      <span class="name">${nameLink(n.name)} <span>${esc(n.unit)}</span></span>
      <span class="base">${fmt(anchor)}</span>${cells}</div>`;
  }).join('');
  el('plot').className = 'matrix';
  el('plot').style.setProperty('--cols', LADDER.length);
  el('plot').innerHTML = `<div class="mhead">${heads}</div>${rows}`;
}

function viewTable({nutrients}) {
  el('tablecap').textContent = 'Every step as a share of the first step that declares it';
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th class="num">Base</th>'
    + LADDER.map(s => `<th class="num">${esc(s.name)}</th>`).join('');
  el('tablebody').innerHTML = nutrients.map(n => {
    const base = baseOf(n);
    if (!base) return '';
    const anchor = n.steps.get(base).median;
    return `<tr><th class="who" scope="row">${nameLink(n.name)}</th>
      <td class="num">${fmt(anchor)} ${esc(n.unit)}</td>`
      + LADDER.map(s => {
          const step = n.steps.get(s.name);
          return `<td class="num">${step ? whole(step.median / anchor * 100) + '%' : '—'}</td>`;
        }).join('')
      + '</tr>';
  }).join('');
}
"""

PAIRS_DRAW = """
function chosen() {
  const x = byName.get(el('x').value) || across[0];
  const y = byName.get(el('y').value) || across[1] || across[0];
  return {x, y};
}

function bounds(articles, name) {
  const values = articles.map(a => a.values[name]).filter(v => v !== undefined);
  if (!values.length) return null;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (lo === hi) { const pad = Math.abs(lo) * 0.1 || 1; lo -= pad; hi += pad; }
  return {lo, hi};
}

function drawChart({articles}) {
  const {x, y} = chosen();
  const here = articles.some(a => picked.has(a.dan));
  const holds = a => a.values[x.name] !== undefined && a.values[y.name] !== undefined;
  const shown = articles.filter(holds);
  const xs = bounds(shown, x.name), ys = bounds(shown, y.name);
  el('axes').innerHTML = shown.length
    ? `Across <b>${esc(x.name)}</b> in ${esc(x.unit)} · up <b>${esc(y.name)}</b> in ${esc(y.unit)}`
      + ` · ${articles.length - shown.length} articles declare only one of the two and are left out`
    : 'No article declares both.';
  if (!shown.length) { el('plot').innerHTML = ''; return; }
  const facets = LADDER.map(step => {
    const mine = shown.filter(a => a.stage === step.name);
    const dots = mine.map(a => {
      const left = (a.values[x.name] - xs.lo) / (xs.hi - xs.lo) * 100;
      const top = 100 - (a.values[y.name] - ys.lo) / (ys.hi - ys.lo) * 100;
      return `<i class="${picked.has(a.dan) ? 'on' : ''}" data-dan="${a.dan}"
        style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%"
        data-tip="${esc(a.brand)} ${esc(a.name)} · ${esc(x.name)} ${esc(a.texts[x.name])} · ${esc(y.name)} ${esc(a.texts[y.name])}"></i>`;
    }).join('');
    return `<section class="facet">
      <h3>${esc(step.name)} <span>${mine.length} articles</span></h3>
      <div class="field"><b class="high">${fmt(ys.hi)}</b><b class="low">${fmt(ys.lo)}</b>${dots}</div>
      <p class="frame"><span>${fmt(xs.lo)}</span><span>${fmt(xs.hi)}</span></p>
    </section>`;
  }).join('');
  el('plot').className = 'facets' + (here ? ' picked' : '');
  el('plot').innerHTML = facets;
}

function viewTable({articles}) {
  const {x, y} = chosen();
  el('tablecap').textContent = `${x.name} against ${y.name}`;
  el('tablehead').innerHTML = '<th class="who">Article</th><th>Step</th>'
    + `<th class="num">${esc(x.name)}</th><th class="num">${esc(y.name)}</th>`;
  el('tablebody').innerHTML = articles.map(a => `<tr>
    <th class="who" scope="row"><a href="${esc(a.url)}" rel="noreferrer">${esc(a.brand)} ${esc(a.name)}</a></th>
    <td>${esc(a.stage)}</td>
    <td class="num">${a.texts[x.name] ? esc(a.texts[x.name]) : '—'}</td>
    <td class="num">${a.texts[y.name] ? esc(a.texts[y.name]) : '—'}</td></tr>`).join('');
}
"""

SPREAD_DRAW = """
function quantile(sorted, part) {
  if (!sorted.length) return 0;
  const place = (sorted.length - 1) * part;
  const low = Math.floor(place), high = Math.ceil(place);
  return sorted[low] + (sorted[high] - sorted[low]) * (place - low);
}

function reachOf(articles, n) {
  const values = articles.map(a => a.values[n.name]).filter(v => v !== undefined).sort((a, b) => a - b);
  if (!values.length || !n.median) return {part: 0, lo: 0, hi: 0, count: 0};
  const lo = el('measure').value === 'mid' ? quantile(values, 0.1) : values[0];
  const hi = el('measure').value === 'mid' ? quantile(values, 0.9) : values[values.length - 1];
  return {part: (hi - lo) / n.median * 100, lo, hi, count: values.length};
}

function drawChart({stage, articles, nutrients}) {
  const measured = nutrients.map(n => ({n, ...reachOf(articles, n)}))
    .sort((a, b) => b.part - a.part);
  const top = Math.max(10, ...measured.map(m => m.part));
  const ticks = [0, 25, 50, 75, 100].map(t => Math.round(top * t / 100));
  const rows = measured.map(m => `<div class="bar" data-tip="${esc(m.n.name)} · ${fmt(m.lo)} to ${fmt(m.hi)} ${esc(m.n.unit)} · median ${fmt(m.n.median)} · ${m.count} articles">
    <span class="name">${esc(m.n.name)} <span>${esc(m.n.unit)}</span></span>
    <span class="track"><i class="fill" style="width:${(m.part / top * 100).toFixed(2)}%"></i></span>
    <span class="val">${whole(m.part)}%</span></div>`).join('');
  const scale = ticks.map(t =>
    `<span class="tick" style="left:${(t / top * 100).toFixed(2)}%">${whole(t)}%</span>`).join('');
  el('plot').className = 'bars';
  el('plot').innerHTML =
    `<div class="scale"><span></span><span class="ticks">${scale}</span><span></span></div>${rows}`;
  el('sub').textContent = `${articles.length} powder articles · ${nutrients.length} nutrients`
    + ` · the bar is how far the declarations reach as a share of the median of ${stage.name}`;
}

function viewTable({stage, articles, nutrients}) {
  const measured = nutrients.map(n => ({n, ...reachOf(articles, n)})).sort((a, b) => b.part - a.part);
  el('tablecap').textContent = `How far the declarations reach · ${stage.name}`;
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th>Unit</th><th class="num">Lowest</th>'
    + '<th class="num">Median</th><th class="num">Highest</th><th class="num">Reach</th><th class="num">Articles</th>';
  el('tablebody').innerHTML = measured.map(m => `<tr>
    <th class="who" scope="row">${esc(m.n.name)}</th><td>${esc(m.n.unit)}</td>
    <td class="num">${fmt(m.lo)}</td><td class="num">${fmt(m.n.median)}</td>
    <td class="num">${fmt(m.hi)}</td><td class="num">${whole(m.part)}%</td>
    <td class="num">${m.count}</td></tr>`).join('');
}
"""

CARD_DRAW = """
const SWING = 100;

function thisPack() {
  const dan = Number(el('who').value);
  return byDan.get(dan) || DATA.articles[0];
}

function deviations(pack) {
  const stage = stages.get(pack.stage);
  return stage.nutrients
    .filter(n => n.name in pack.values)
    .map(n => ({n, part: share(pack.values[n.name], n)}))
    .sort((a, b) => Math.abs(b.part - 100) - Math.abs(a.part - 100));
}

function drawChart() {
  const pack = thisPack();
  const stage = stages.get(pack.stage);
  const rows = deviations(pack);
  el('title').textContent = `${pack.brand} ${pack.variant} ${pack.size}`.replace(/\\s+/g, ' ');
  el('sub').textContent = `${pack.name} · ${stage.name} · measured against the median of the`
    + ` ${stage.articles} articles of that step`;
  el('pack').innerHTML = `<b>${esc(pack.brand)} ${esc(pack.name)}</b>
    <span>· article ${pack.dan} · <a href="${esc(pack.url)}" rel="noreferrer">dm.de</a></span>`;
  const ticks = [-100, -50, 0, 50, 100];
  const scale = ticks.map(t =>
    `<span class="tick" style="left:${(t + SWING) / (2 * SWING) * 100}%">${t > 0 ? '+' : ''}${t}%</span>`).join('');
  const body = rows.map(({n, part}) => {
    const off = Math.max(-SWING, Math.min(SWING, part - 100));
    const side = off < 0 ? 'under' : 'over';
    const width = Math.abs(off) / (2 * SWING) * 100;
    const from = off < 0 ? 50 - width : 50;
    return `<div class="drow" data-tip="${esc(n.name)} · this pack ${esc(pack.texts[n.name])} · the median of ${esc(pack.stage)} is ${fmt(n.median)} ${esc(n.unit)}">
      <span class="name">${nameLink(n.name)} <span>${esc(n.unit)}</span></span>
      <span class="track"><i class="mid"></i>
        <i class="fill ${side}" style="left:${from.toFixed(2)}%;width:${width.toFixed(2)}%"></i></span>
      <span class="val">${whole(part)}% <span>${esc(pack.texts[n.name])}</span></span></div>`;
  }).join('');
  el('plot').className = 'rows';
  el('plot').innerHTML =
    `<div class="dscale"><span></span><span class="ticks">${scale}</span><span></span></div>${body}`;
}

function viewTable() {
  const pack = thisPack();
  el('tablecap').textContent = `${pack.brand} ${pack.name}`;
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th class="num">This pack</th>'
    + '<th class="num">Median of the step</th><th class="num">Share</th>';
  el('tablebody').innerHTML = deviations(pack).map(({n, part}) => `<tr>
    <th class="who" scope="row">${esc(n.name)}</th>
    <td class="num">${esc(pack.texts[n.name])}</td>
    <td class="num">${fmt(n.median)} ${esc(n.unit)}</td>
    <td class="num">${whole(part)}%</td></tr>`).join('');
}
"""

BALANCE_DRAW = """
function tally(article, nutrients) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let held = 0;
  for (const n of nutrients) {
    if (!(n.name in article.values)) continue;
    counts[binOf(share(article.values[n.name], n))] += 1;
    held += 1;
  }
  return {counts, held};
}

function drawChart({stage, articles, nutrients}) {
  const here = articles.some(a => picked.has(a.dan));
  const measured = articles.map(a => {
    const {counts, held} = tally(a, nutrients);
    const under = counts[0] + counts[1] + counts[2];
    const over = counts[4] + counts[5] + counts[6];
    return {a, counts, held, lean: held ? (over - under) / held * 100 : 0};
  }).filter(m => m.held).sort((a, b) => b.lean - a.lean);
  // One scale for every bar. Because a) each half of the bar is half the track b) a pack
  // with four fifths of its nutrients under the median would overrun its half c) the
  // widest side of the field is what both halves are measured in.
  const widest = Math.max(...measured.map(m => Math.max(
    (m.counts[0] + m.counts[1] + m.counts[2] + m.counts[3] / 2) / m.held,
    (m.counts[4] + m.counts[5] + m.counts[6] + m.counts[3] / 2) / m.held)), 0.01);
  const rows = measured.map(m => {
    const part = i => m.counts[i] / m.held / widest * 100;
    const seg = i => `<i class="seg b${i}" style="width:${part(i).toFixed(2)}%"></i>`;
    const half = `<i class="seg b3" style="width:${(part(3) / 2).toFixed(2)}%"></i>`;
    const left = [0, 1, 2].map(seg).join('') + half;
    const right = half + [4, 5, 6].map(seg).join('');
    const state = picked.has(m.a.dan) ? ' on' : '';
    return `<div class="stack${state}" data-dan="${m.a.dan}"
      data-tip="${esc(m.a.brand)} ${esc(m.a.name)} · ${m.held} nutrients · above the median on ${m.counts[4] + m.counts[5] + m.counts[6]} and below on ${m.counts[0] + m.counts[1] + m.counts[2]}">
      <span class="who">${label(m.a)}</span>
      <span class="bar"><span class="half left">${left}</span><span class="half right">${right}</span></span>
      <span class="val">${m.lean > 0 ? '+' : ''}${whole(m.lean)}</span></div>`;
  }).join('');
  el('plot').className = 'stacks' + (here ? ' picked' : '');
  el('plot').innerHTML = rows;
  el('sub').textContent = `${measured.length} powder articles of ${stage.name} · every nutrient of the`
    + ` step sorted into the seven bands · the number is the lean in points`;
}

function viewTable({stage, articles, nutrients}) {
  const measured = articles.map(a => ({a, ...tally(a, nutrients)}))
    .filter(m => m.held)
    .sort((a, b) => (b.counts[4] + b.counts[5] + b.counts[6] - b.counts[0] - b.counts[1] - b.counts[2])
      - (a.counts[4] + a.counts[5] + a.counts[6] - a.counts[0] - a.counts[1] - a.counts[2]));
  el('tablecap').textContent = `How each article sits against the median of ${stage.name}`;
  el('tablehead').innerHTML = '<th class="who">Article</th><th class="num">Nutrients</th>'
    + '<th class="num">Under 60%</th><th class="num">60 to 80</th><th class="num">80 to 95</th>'
    + '<th class="num">95 to 105</th><th class="num">105 to 125</th><th class="num">125 to 160</th>'
    + '<th class="num">Over 160</th>';
  el('tablebody').innerHTML = measured.map(m => `<tr>
    <th class="who" scope="row"><a href="${esc(m.a.url)}" rel="noreferrer">${esc(m.a.brand)} ${esc(m.a.name)}</a></th>
    <td class="num">${m.held}</td>`
    + m.counts.map(c => `<td class="num">${c}</td>`).join('') + '</tr>').join('');
}
"""

LADDER_LEGEND = """<span id="legend" style="display:block;width:100%"></span>"""

MATRIX_LEGEND = """<span>Share of the first step that declares it</span>
<span><i style="background:var(--low3)"></i>under 60%</span>
<span><i style="background:var(--low2)"></i>60 to 80</span>
<span><i style="background:var(--low1)"></i>80 to 95</span>
<span><i style="background:var(--mid)"></i>95 to 105</span>
<span><i style="background:var(--high1)"></i>105 to 125</span>
<span><i style="background:var(--high2)"></i>125 to 160</span>
<span><i style="background:var(--high3)"></i>over 160</span>"""

PAIRS_LEGEND = """<span id="axes" class="axes"></span>"""

SPREAD_LEGEND = """<span><i style="background:var(--series)"></i>how far the declarations reach</span>
<span>The bar is the distance from the lowest to the highest as a share of the median.</span>"""

CARD_LEGEND = """<span><i style="background:var(--low2)"></i>below the median of the step</span>
<span><i style="background:var(--high2)"></i>above it</span>
<span>The bar is held at a hundred points either way.</span>"""

BALANCE_LEGEND = """<span>Every nutrient of the step sorted by its share of the median</span>
<span><i style="background:var(--low3)"></i>under 60%</span>
<span><i style="background:var(--low2)"></i>60 to 80</span>
<span><i style="background:var(--low1)"></i>80 to 95</span>
<span><i style="background:var(--mid)"></i>95 to 105</span>
<span><i style="background:var(--high1)"></i>105 to 125</span>
<span><i style="background:var(--high2)"></i>125 to 160</span>
<span><i style="background:var(--high3)"></i>over 160</span>"""

GAP_STYLE = """
.grow { display: grid; gap: 2px; }
.grow .gline { display: grid; grid-template-columns: var(--who) 1fr 5.5rem; gap: 0.6rem;
  align-items: center; font-size: 0.82rem; }
.grow .gname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grow .gname span { color: var(--quiet); }
/* Every fill here was measured on the sheet rather than on the tint. The inner bands of
   the diverging ramp cannot clear the 3 to 1 a mark needs against a tint of their own hue
   so this option carries no ramp at all and the axis carries the direction instead. */
.grow .track { position: relative; height: 22px; background: var(--card);
  border: 1px solid var(--line); border-radius: 3px; }
.grow .one { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--ink); }
.grow .milkband { position: absolute; bottom: 1px; height: 5px; background: var(--deemph);
  border-radius: 2px; }
.grow .fieldband { position: absolute; top: 4px; height: 6px; background: var(--series);
  border-radius: 2px; }
.grow .fielddot { position: absolute; top: 1px; width: 12px; height: 12px; margin-left: -6px;
  border-radius: 50%; background: var(--series); border: 1.5px solid var(--ink); }
.grow .num { text-align: right; font-variant-numeric: tabular-nums; }
.octaves { display: grid; grid-template-columns: repeat(11, 1fr); font-size: 0.7rem;
  color: var(--quiet); margin: 0 0 0.3rem calc(var(--who) + 0.6rem);
  padding-right: 6.1rem; }
.octaves span { text-align: center; }
"""

GAP_DRAW = """
function drawChart() {
  const p = pair();
  el('title').textContent = `${p.stage} against ${esc(p.reference)} of the same age`;
  el('sub').textContent = `${p.articles} packs sold from month ${fmt(p.from)}`
    + (p.to === null ? ' on' : ` to ${fmt(p.to)}`)
    + ` \u00b7 ${p.windows.length} lactation windows \u00b7 ${p.nutrients.length} nutrients both declare`;
  el('pack').textContent = p.reference + ': ' + p.windows.join(' \u00b7 ')
    + (p.none_of_it && p.none_of_it.length
       ? ' \u00b7 it declares none of ' + p.none_of_it.join(' or ') + ' so neither is drawn'
       : '');
  const ticks = [];
  for (let o = OCT[0]; o <= OCT[1]; o += 1) ticks.push(o < 0 ? `1/${2 ** -o}` : `${2 ** o}\u00d7`);
  const rows = orderedPairs(p.nutrients).map(n => {
    const r = ratioOf(n);
    const lo = atOct(n.field.low / n.milk.median) * 100;
    const hi = atOct(n.field.high / n.milk.median) * 100;
    const mlo = atOct(n.milk.low / n.milk.median) * 100;
    const mhi = atOct(n.milk.high / n.milk.median) * 100;
    return `<div class="gline">
      <span class="gname">${nameLink(n.name)} <span>${esc(n.unit)}</span></span>
      <span class="track">
        <i class="milkband" style="left:${mlo.toFixed(2)}%;width:${Math.max(0.4, mhi - mlo).toFixed(2)}%"
          data-tip="${milkTip(n)}"></i>
        <i class="one" style="left:${(atOct(1) * 100).toFixed(2)}%"></i>
        <i class="fieldband" style="left:${lo.toFixed(2)}%;width:${Math.max(0.4, hi - lo).toFixed(2)}%"
          data-tip="${fieldTip(n, p.stage)}"></i>
        <i class="fielddot" style="left:${atOct(r) * 100}%"
          data-tip="${fieldTip(n, p.stage)} \u00b7 ${times(r)} the milk"></i>
      </span>
      <span class="num">${times(r)}</span></div>`;
  }).join('');
  el('plot').className = 'grow';
  el('plot').innerHTML = `<div class="octaves">${ticks.map(t => `<span>${t}</span>`).join('')}</div>` + rows;
}

function viewTable() {
  const p = pair();
  el('tablecap').textContent = `${p.stage} against ${esc(p.reference)} of the same age`;
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th>Unit</th>'
    + `<th class="num">${esc(p.reference)}</th><th class="num">Its low to high</th>`
    + `<th class="num">${esc(p.stage)}</th><th class="num">Step low to high</th><th class="num">Times the milk</th>`;
  el('tablebody').innerHTML = orderedPairs(p.nutrients).map(n => `<tr>
    <th class="who" scope="row">${nameLink(n.name)}</th><td>${esc(n.unit)}</td>
    <td class="num">${fmt(n.milk.median)}</td>
    <td class="num">${fmt(n.milk.low)} to ${fmt(n.milk.high)}</td>
    <td class="num">${fmt(n.field.median)}</td>
    <td class="num">${fmt(n.field.low)} to ${fmt(n.field.high)}</td>
    <td class="num">${times(ratioOf(n))}</td></tr>`).join('');
}
"""

GAP_LEGEND = """<span><i style="background:var(--deemph)"></i>the milk over its own windows</span>
<span><i style="background:var(--series)"></i>the step over its packs</span>
<span>left of the rule is below the milk and right of it is above</span>
<span>the axis counts doublings so every step out is twice the last</span>"""

BESIDE_STYLE = """
.pairgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.9rem; }
.pairgrid .panel h3 { margin: 0 0 0.35rem; font-size: 0.8rem; font-weight: 600; }
.pairgrid .panel h3 span { color: var(--quiet); font-weight: 400; }
.pairgrid .rail { position: relative; height: 15px; margin: 0 0 2px 2.6rem; }
.pairgrid .rail .base { position: absolute; left: 0; right: 0; top: 7px; height: 1px;
  background: var(--line); }
.pairgrid .rail .band { position: absolute; top: 4px; height: 7px; border-radius: 2px; }
.pairgrid .rail .tag { position: absolute; left: -2.6rem; top: 1px; font-size: 0.62rem;
  color: var(--quiet); letter-spacing: 0.02em; }
.pairgrid .rail .dot { position: absolute; top: 2px; width: 11px; height: 11px; margin-left: -5.5px;
  border-radius: 50%; border: 2px solid var(--card); }
.pairgrid .milk .band, .pairgrid .milk .dot { background: var(--accent); }
.pairgrid .field .band, .pairgrid .field .dot { background: var(--series); }
.pairgrid .ends { display: flex; justify-content: space-between; margin: 0; font-size: 0.68rem;
  color: var(--quiet); font-variant-numeric: tabular-nums; }
.pairgrid .who2 { display: flex; gap: 0.6rem; font-size: 0.68rem; color: var(--quiet); margin: 0; }
"""

BESIDE_DRAW = """
function drawChart() {
  const p = pair();
  el('title').textContent = `${esc(p.reference)} beside ${p.stage} in the declared unit`;
  el('sub').textContent = `${p.articles} packs \u00b7 ${p.windows.length} lactation windows`
    + ` \u00b7 ${p.nutrients.length} nutrients both declare \u00b7 per 100 ml as fed`;
  el('pack').textContent = '';
  const panels = orderedPairs(p.nutrients).map(n => {
    const lo = Math.min(n.milk.low, n.field.low);
    const hi = Math.max(n.milk.high, n.field.high);
    const at = v => hi === lo ? 50 : (v - lo) / (hi - lo) * 100;
    const rail = (cls, s, tip, tag) => `<div class="rail ${cls}"><i class="base"></i>
      <b class="tag">${tag}</b>
      <i class="band" style="left:${at(s.low).toFixed(2)}%;width:${Math.max(0.6, at(s.high) - at(s.low)).toFixed(2)}%"
        data-tip="${tip}"></i>
      <i class="dot" style="left:${at(s.median).toFixed(2)}%" data-tip="${tip}"></i></div>`;
    return `<section class="panel">
      <h3>${nameLink(n.name)} <span>${esc(n.unit)}</span></h3>
      ${rail('milk', n.milk, milkTip(n), 'Milch')}
      ${rail('field', n.field, fieldTip(n, p.stage), esc(p.stage))}
      <p class="ends"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></p></section>`;
  }).join('');
  el('plot').className = 'pairgrid';
  el('plot').innerHTML = panels;
}

function viewTable() {
  const p = pair();
  el('tablecap').textContent = `${esc(p.reference)} beside ${p.stage}`;
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th>Unit</th>'
    + `<th class="num">${esc(p.reference)}</th><th class="num">${esc(p.stage)}</th>`
    + '<th class="num">Milk low to high</th><th class="num">Step low to high</th>';
  el('tablebody').innerHTML = orderedPairs(p.nutrients).map(n => `<tr>
    <th class="who" scope="row">${nameLink(n.name)}</th><td>${esc(n.unit)}</td>
    <td class="num">${fmt(n.milk.median)}</td><td class="num">${fmt(n.field.median)}</td>
    <td class="num">${fmt(n.milk.low)} to ${fmt(n.milk.high)}</td>
    <td class="num">${fmt(n.field.low)} to ${fmt(n.field.high)}</td></tr>`).join('');
}
"""

BESIDE_LEGEND = """<span><i style="background:var(--accent)"></i>breast milk</span>
<span><i style="background:var(--series)"></i>the age step</span>
<span>every panel holds its own scale in the unit the pack declares</span>"""

LIFE_STYLE = """
.life { display: block; }
.life svg { width: 100%; height: auto; }
/* Several steps are sold for the same month so a filled block would bury the ones
   underneath. An outline lets two spans that share a month both read. */
.life .step { fill: none; stroke: var(--series); stroke-width: 1.5; }
.life .steprule { stroke: var(--series); stroke-width: 2; fill: none; }
.life .milkline { stroke: var(--accent); stroke-width: 2.2; fill: none;
  stroke-linejoin: round; stroke-linecap: round; }
/* the halo keeps the line off the block it crosses in both modes */
.life .milkhalo { stroke: var(--card); stroke-width: 5.4; fill: none;
  stroke-linejoin: round; stroke-linecap: round; }
.life .milkdot { stroke: var(--card); stroke-width: 1.6; }
.life .milkdot { fill: var(--accent); }
.life .axis { stroke: var(--line); stroke-width: 1; }
.life .tick { fill: var(--quiet); font-size: 9px; }
.life .steplabel { fill: var(--quiet); font-size: 9px; text-anchor: middle; }
.life .stop { stroke: var(--deemph); stroke-width: 1; stroke-dasharray: 3 3; }
"""

LIFE_DRAW = """
const W = 900, H = 340, L = 64, R = 18, T = 18, B = 58;

function drawChart() {
  const want = has('nutrient') ? el('nutrient').value : DATA.nutrients[0].name;
  // Spezialnahrung is left out here for the same reason the ladder leaves it out.
  const steps = DATA.stages.filter(s =>
    !isReference(s.name) && s.name !== 'Spezialnahrung' && s.from !== null);
  const milk = WINDOWS.map(w => {
    const a = byDan.get(w.dan);
    return a && want in a.values ? {...w, value: a.values[want]} : null;
  }).filter(Boolean);
  const bars = steps.map(s => {
    const n = s.nutrients.find(x => x.name === want);
    return n ? {...s, n} : null;
  }).filter(Boolean);
  const unit = (DATA.nutrients.find(n => n.name === want) || {}).unit || '';
  el('title').textContent = `${want} through the first year`;
  el('pack').textContent = milk.length
    ? 'The milk line stops where the study stops.'
    : 'Breast milk never declares this nutrient.';
  if (!milk.length && !bars.length) { el('plot').innerHTML = '<p class="empty">Nothing to draw.</p>'; return; }

  const LAST = 15;
  const values = milk.map(m => m.value)
    .concat(bars.flatMap(b => [b.n.low, b.n.high]));
  // the scale spans the data rather than starting at zero and the subtitle says so
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  lo = Math.max(0, lo - pad); hi = hi + pad;
  const x = m => L + Math.min(LAST, m) / LAST * (W - L - R);
  const y = v => H - B - (v - lo) / (hi - lo) * (H - T - B);
  el('sub').textContent = `${milk.length} lactation windows \u00b7 ${bars.length} age steps`
    + ` \u00b7 ${unit} per 100 ml as fed \u00b7 the scale runs ${fmt(lo)} to ${fmt(hi)}`;

  // two steps sold for the same months would otherwise print their names on one spot
  const lanes = new Map();
  for (const b of bars) {
    const key = `${b.from}:${b.to}`;
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(b.name);
  }
  const stepShapes = bars.map(b => {
    const x0 = x(b.from), x1 = x(b.to === null ? LAST : b.to);
    const share = lanes.get(`${b.from}:${b.to}`);
    const slot = share.indexOf(b.name);
    const at = x0 + (x1 - x0) * (slot + 0.5) / share.length;
    return `<rect class="step" x="${x0.toFixed(1)}" y="${y(b.n.high).toFixed(1)}"
      width="${Math.max(2, x1 - x0).toFixed(1)}" height="${Math.max(1, y(b.n.low) - y(b.n.high)).toFixed(1)}"
      data-tip="${esc(b.name)} \u00b7 median ${fmt(b.n.median)} ${esc(unit)} \u00b7 ${fmt(b.n.low)} to ${fmt(b.n.high)} over ${b.n.count} articles"></rect>
      <line class="steprule" x1="${x0.toFixed(1)}" y1="${y(b.n.median).toFixed(1)}"
        x2="${x1.toFixed(1)}" y2="${y(b.n.median).toFixed(1)}"></line>
      <text class="steplabel" x="${at.toFixed(1)}" y="${(H - B + 32).toFixed(1)}">${esc(b.name)}</text>`;
  }).join('');
  const line = milk.map(m => `${x((m.from + m.to) / 2).toFixed(1)},${y(m.value).toFixed(1)}`);
  const dots = milk.map(m => `<circle class="milkdot" cx="${x((m.from + m.to) / 2).toFixed(1)}"
    cy="${y(m.value).toFixed(1)}" r="3.2"
    data-tip="Breast milk \u00b7 ${esc(m.variant)} \u00b7 ${fmt(m.value)} ${esc(unit)}"></circle>`).join('');
  const stop = milk.length
    ? `<line class="stop" x1="${x(milk[milk.length - 1].to).toFixed(1)}" y1="${T}"
        x2="${x(milk[milk.length - 1].to).toFixed(1)}" y2="${H - B}"></line>` : '';
  const ticks = [];
  for (let m = 0; m <= LAST; m += 3) {
    ticks.push(`<text class="tick" x="${x(m).toFixed(1)}" y="${(H - B + 14).toFixed(1)}"
      text-anchor="middle">${m}</text>`);
  }
  const marks = [lo, (lo + hi) / 2, hi].map(v =>
    `<text class="tick" x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`).join('');
  el('plot').className = 'life';
  el('plot').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
    aria-label="${esc(want)} over the first year of life">
    ${stepShapes}${stop}
    <polyline class="milkhalo" points="${line.join(' ')}"></polyline>
    <polyline class="milkline" points="${line.join(' ')}"></polyline>${dots}
    <line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"></line>
    ${ticks.join('')}${marks}
    <text class="tick" x="${(L + (W - L - R) / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle">month of life</text>
  </svg>`;
}

function viewTable() {
  const want = has('nutrient') ? el('nutrient').value : DATA.nutrients[0].name;
  const unit = (DATA.nutrients.find(n => n.name === want) || {}).unit || '';
  const rows = WINDOWS.map(w => {
    const a = byDan.get(w.dan);
    return a && want in a.values
      ? `<tr><th class="who" scope="row">${esc(w.brand || 'Muttermilch')} ${esc(w.variant)}</th>
         <td>${fmt(w.from)} to ${fmt(w.to)}</td><td class="num">${esc(a.texts[want])}</td>
         <td class="num">—</td></tr>` : '';
  }).concat(DATA.stages.filter(s => !isReference(s.name)
      && s.name !== 'Spezialnahrung' && s.from !== null).map(s => {
    const n = s.nutrients.find(x => x.name === want);
    return n ? `<tr><th class="who" scope="row">${esc(s.name)}</th>
      <td>${fmt(s.from)}${s.to === null ? ' on' : ' to ' + fmt(s.to)}</td>
      <td class="num">${fmt(n.median)}</td>
      <td class="num">${fmt(n.low)} to ${fmt(n.high)}</td></tr>` : '';
  })).join('');
  el('tablecap').textContent = `${want} through the first year (${unit} per 100 ml)`;
  el('tablehead').innerHTML = '<th class="who">Milk</th><th>Months</th>'
    + '<th class="num">Declared or median</th><th class="num">Low to high</th>';
  el('tablebody').innerHTML = rows;
}
"""

LIFE_LEGEND = """<span><i style="background:var(--accent)"></i>breast milk month by month</span>
<span><i style="background:var(--series)"></i>the age step over the months it is sold for</span>
<span>the outline is the low to the high and the rule inside it is the median</span>
<span>the dashed rule is where the study stops</span>"""

NEAR_STYLE = """
.near { display: grid; gap: 3px; }
.near .nline { display: grid; grid-template-columns: var(--who) 1fr 4.5rem; gap: 0.6rem;
  align-items: center; font-size: 0.82rem; }
.near .nname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.near .nname .variant { color: var(--quiet); }
.near .nname .size { color: var(--quiet); font-size: 0.75rem; }
.near .track { position: relative; height: 16px; background: var(--band); border-radius: 3px; }
.near .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px;
  background: var(--series); }
.near .fill.on { background: var(--accent); }
.near .num { text-align: right; font-variant-numeric: tabular-nums; }
"""

NEAR_DRAW = """
function scoreOf(article, p) {
  const gaps = [];
  for (const n of p.nutrients) {
    const v = article.values[n.name];
    if (v === undefined || !n.milk.median || !v) continue;
    gaps.push(Math.abs(Math.log2(v / n.milk.median)));
  }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return {octaves: median, times: 2 ** median, held: gaps.length};
}

function drawChart() {
  const p = pair();
  const articles = (byStage.get(p.stage) || []);
  el('title').textContent = `Which ${p.stage} pack sits nearest ${esc(p.reference)}`;
  el('sub').textContent = `${articles.length} packs \u00b7 ${p.nutrients.length} nutrients both declare`
    + ' \u00b7 the typical nutrient of the pack against the milk of the same age';
  el('pack').textContent = '';
  const scored = articles.map(a => ({a, s: scoreOf(a, p)})).filter(r => r.s)
    .sort((x, y) => x.s.octaves - y.s.octaves);
  if (!scored.length) { el('plot').innerHTML = '<p class="empty">Nothing to score.</p>'; return; }
  const worst = Math.max(...scored.map(r => r.s.octaves));
  el('plot').className = 'near';
  el('plot').innerHTML = scored.map(({a, s}) => `<div class="nline">
    <span class="nname">${label(a)}</span>
    <span class="track">
      <i class="fill${picked.has(a.dan) ? ' on' : ''}" data-dan="${a.dan}"
        style="width:${(s.octaves / (worst || 1) * 100).toFixed(2)}%"
        data-tip="${esc(a.brand)} ${esc(a.variant)} \u00b7 the typical nutrient sits ${times(s.times)} the milk \u00b7 ${s.held} nutrients held"></i>
    </span>
    <span class="num">${times(s.times)}</span></div>`).join('');
}

function viewTable() {
  const p = pair();
  const scored = (byStage.get(p.stage) || []).map(a => ({a, s: scoreOf(a, p)}))
    .filter(r => r.s).sort((x, y) => x.s.octaves - y.s.octaves);
  el('tablecap').textContent = `Every ${p.stage} pack ranked by its distance from ${esc(p.reference)}`;
  el('tablehead').innerHTML = '<th class="who">Article</th><th>Pack</th>'
    + '<th class="num">Typical nutrient</th><th class="num">Nutrients held</th>';
  el('tablebody').innerHTML = scored.map(({a, s}) => `<tr>
    <th class="who" scope="row"><a href="${esc(a.url)}" rel="noreferrer">${esc(a.brand)} ${esc(a.name)}</a></th>
    <td>${esc(a.size)}</td><td class="num">${times(s.times)}</td>
    <td class="num">${s.held}</td></tr>`).join('');
}
"""

NEAR_LEGEND = """<span><i style="background:var(--series)"></i>how far the typical nutrient sits from the milk</span>
<span>a shorter bar is nearer the milk</span>"""


PERIOD_STYLE = """
.periods { overflow-x: auto; }
table.period { border-collapse: collapse; font-size: 0.78rem; white-space: nowrap; }
table.period th, table.period td { padding: 0.22rem 0.42rem; border-bottom: 1px solid var(--line); }
table.period thead th { color: var(--quiet); font-weight: 600; text-align: right;
  vertical-align: bottom; position: sticky; top: 0; background: var(--card); }
table.period thead th.group { text-align: left; border-bottom: 1px solid var(--ink);
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
table.period th.who { text-align: left; position: sticky; left: 0; background: var(--card);
  min-width: 13rem; z-index: 2; }
table.period thead th.who { z-index: 3; }
table.period th.who span { color: var(--quiet); font-weight: 400; }
table.period td { text-align: right; font-variant-numeric: tabular-nums; }
table.period td.milk { background: var(--band); }
table.period td.none { color: var(--quiet); }
table.period td.b0 { background: var(--low3); color: var(--ink0); }
table.period td.b1 { background: var(--low2); color: var(--ink1); }
table.period td.b2 { background: var(--low1); color: var(--ink2); }
table.period td.b3 { background: var(--mid); color: var(--ink3); }
table.period td.b4 { background: var(--high1); color: var(--ink4); }
table.period td.b5 { background: var(--high2); color: var(--ink5); }
table.period td.b6 { background: var(--high3); color: var(--ink6); }
table.period tbody tr:hover th.who { background: var(--band); }
"""

PERIOD_DRAW = """
function milkAt(window, name) {
  const article = byDan.get(window.dan);
  return article && name in article.values ? article.values[name] : null;
}

function drawChart() {
  const steps = DATA.stages.filter(s => !isReference(s.name));
  const paired = new Map((DATA.against || []).map(p => [p.stage, p]));
  const rows = ordered(across).map(n => {
    const milk = WINDOWS.map(w => milkAt(w, n.name));
    const cells = WINDOWS.map((w, i) => milk[i] === null
      ? '<td class="milk none">\u2014</td>'
      : `<td class="milk" data-tip="${esc(n.name)} \u00b7 Muttermilch ${esc(w.variant)} \u00b7 ${fmt(milk[i])} ${esc(n.unit)}">${fmt(milk[i])}</td>`).join('');
    const packs = steps.map(s => {
      const held = s.nutrients.find(x => x.name === n.name);
      if (!held) return '<td class="none">\u2014</td>';
      const pair = paired.get(s.name);
      const found = pair && pair.nutrients.find(x => x.name === n.name);
      if (!found || !found.milk.median) {
        return `<td data-tip="${esc(n.name)} \u00b7 ${esc(s.name)} \u00b7 median ${fmt(held.median)} ${esc(n.unit)} over ${held.count} packs \u00b7 the study does not reach this age so there is nothing to measure it against">${fmt(held.median)}</td>`;
      }
      const r = found.field.median / found.milk.median;
      return `<td class="b${binOf(r * 100)}" data-tip="${esc(n.name)} \u00b7 ${esc(s.name)} \u00b7 median ${fmt(held.median)} ${esc(n.unit)} over ${held.count} packs \u00b7 ${times(r)} the milk of the same age">${fmt(held.median)}</td>`;
    }).join('');
    return `<tr><th class="who" scope="row">${nameLink(n.name)} <span>${esc(n.unit)}</span></th>${cells}${packs}</tr>`;
  }).join('');

  el('title').textContent = 'Breast milk by lactation window against the packs of each age step';
  el('sub').textContent = `${WINDOWS.length} windows \u00b7 ${steps.length} age steps `
    + `\u00b7 ${across.length} nutrients \u00b7 per 100 ml as fed`;
  el('pack').textContent = 'A pack column is tinted against the milk of the age that step is '
    + 'sold for. The three steps the study never reaches carry no tint.';
  const head = '<tr><th class="who group">Nutrient</th>'
    + `<th class="group" colspan="${WINDOWS.length}">Breast milk by window</th>`
    + `<th class="group" colspan="${steps.length}">Median of the age step</th></tr>`
    + '<tr><th class="who"></th>'
    + WINDOWS.map(w => `<th>${esc(w.variant)}</th>`).join('')
    + steps.map(s => `<th>${esc(s.name)}</th>`).join('') + '</tr>';
  el('plot').className = 'periods';
  el('plot').innerHTML = `<table class="period"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function viewTable() {
  const steps = DATA.stages.filter(s => !isReference(s.name));
  el('tablecap').textContent = 'The same figures without the tint';
  el('tablehead').innerHTML = '<th class="who">Nutrient</th><th>Unit</th>'
    + WINDOWS.map(w => `<th class="num">${esc(w.variant)}</th>`).join('')
    + steps.map(s => `<th class="num">${esc(s.name)}</th>`).join('');
  el('tablebody').innerHTML = ordered(across).map(n => `<tr>
    <th class="who" scope="row">${nameLink(n.name)}</th><td>${esc(n.unit)}</td>`
    + WINDOWS.map(w => {
        const v = milkAt(w, n.name);
        return `<td class="num">${v === null ? '\u2014' : fmt(v)}</td>`;
      }).join('')
    + steps.map(s => {
        const held = s.nutrients.find(x => x.name === n.name);
        return `<td class="num">${held ? fmt(held.median) : '\u2014'}</td>`;
      }).join('')
    + '</tr>').join('');
}
"""

PERIOD_LEGEND = """<span><i style="background:var(--band)"></i>breast milk as the study publishes it</span>
<span><i style="background:var(--low2)"></i>the step declares less than the milk of that age</span>
<span><i style="background:var(--high2)"></i>the step declares more</span>
<span>A step the study never reaches carries no tint.</span>"""


STAR_STYLE = """
.stars { display: grid; gap: 1rem; }
.stars .together { display: grid; grid-template-columns: minmax(0, 1fr) 15rem; gap: 1rem;
  align-items: start; }
@media (max-width: 760px) { .stars .together { grid-template-columns: 1fr; } }
.stars .small { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: 0.6rem; }
.stars figure { margin: 0; cursor: pointer; border: 1px solid transparent; border-radius: 6px;
  padding: 0.3rem; }
.stars figure:hover { background: var(--band); }
.stars figure.on { border-color: var(--accent); background: var(--band); }
.stars figcaption { font-size: 0.72rem; line-height: 1.25; margin-top: 0.15rem; }
.stars figcaption b { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.stars figcaption span { color: var(--quiet); }
.stars svg { width: 100%; height: auto; display: block; }
.stars .web { stroke: var(--line); fill: none; }
.stars .one { stroke: var(--ink); fill: none; opacity: 0.55; stroke-dasharray: 3 3; }
.stars .spoke { stroke: var(--line); }
.stars .shape { fill: var(--series); fill-opacity: 0.12; stroke: var(--series); stroke-width: 1.6; }
.stars .shape.milk { fill: var(--accent); fill-opacity: 0.1; stroke: var(--accent); }
.stars .shape.dim { stroke: var(--deemph); fill: none; opacity: 0.4; }
.stars .shape.lift { stroke: var(--accent); stroke-width: 2.6; fill-opacity: 0.16; }
.stars .axis { fill: var(--quiet); font-size: 8px; }
.stars .ring { fill: var(--quiet); font-size: 8px; }
.stars .who { margin: 0; font-size: 0.8rem; }
.stars .who ol { margin: 0.3rem 0 0; padding-left: 1.2rem; }
.stars .who li { margin-bottom: 0.25rem; cursor: pointer; }
.stars .who li.lift { color: var(--accent); font-weight: 600; }
.stars .who .none { color: var(--quiet); }
.stars .hint { color: var(--quiet); font-size: 0.8rem; margin: 0 0 0.4rem; }
"""

STAR_DRAW = """
const RMIN = -3, RMAX = 5;
const RINGS = [0.25, 1, 4, 16];
const SPOKES = {
  headline: ['Brennwert', 'Eiweiß', 'Fett', 'Kohlenhydrate', 'Calcium', 'Eisen', 'Zink',
             'Jod', 'Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin B 12'],
  macros: ['Brennwert', 'Fett', 'davon gesättigte Fettsäuren', 'davon einfach ungesättigte Fettsäuren',
           'davon mehrfach ungesättigte Fettsäuren', 'Kohlenhydrate', 'davon Zucker', 'Laktose', 'Eiweiß'],
  minerals: ['Natrium', 'Kalium', 'Calcium', 'Magnesium', 'Phosphor', 'Eisen', 'Zink',
             'Kupfer', 'Jod', 'Selen', 'Mangan', 'Chlorid'],
  vitamins: ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Folat',
             'Vitamin B 1, Thiamin', 'Vitamin B 2, Riboflavin', 'Vitamin B 6',
             'Vitamin B 12', 'Niacin', 'Pantothensäure', 'Biotin'],
};
let lifted = null;

const armOf = r => Math.max(0, Math.min(1, (Math.log2(Math.max(1e-9, r)) - RMIN) / (RMAX - RMIN)));

function axesOf(pair) {
  const want = SPOKES[has('spokes') ? el('spokes').value : 'headline'] || SPOKES.headline;
  const held = new Map(pair.nutrients.map(n => [n.name, n]));
  return want.map(name => held.get(name)).filter(Boolean);
}

/* One closed shape over the spokes. Each arm is how many times the breast milk of the
   same age the article declares, on an axis counting doublings. */
function shapeOf(values, axes, size) {
  const mid = size / 2, span = size / 2 - 16;
  return axes.map((n, i) => {
    const turn = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
    const v = values[n.name];
    const at = v === undefined || !n.milk.median ? null : armOf(v / n.milk.median);
    if (at === null) return null;
    return `${(mid + Math.cos(turn) * span * at).toFixed(1)},${(mid + Math.sin(turn) * span * at).toFixed(1)}`;
  }).filter(Boolean);
}

function webOf(axes, size, labels) {
  const mid = size / 2, span = size / 2 - 16;
  const at = (i, f) => {
    const turn = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
    return [mid + Math.cos(turn) * span * f, mid + Math.sin(turn) * span * f];
  };
  let out = '';
  for (const ring of RINGS) {
    const f = armOf(ring);
    const points = axes.map((_, i) => at(i, f).map(v => v.toFixed(1)).join(',')).join(' ');
    out += `<polygon class="${ring === 1 ? 'one' : 'web'}" points="${points}"></polygon>`;
    if (labels) out += `<text class="ring" x="${mid + 2}" y="${(mid - span * f).toFixed(1)}">${ring === 1 ? '1\\u00d7' : times(ring)}</text>`;
  }
  out += axes.map((_, i) => {
    const [x, y] = at(i, 1);
    return `<line class="spoke" x1="${mid}" y1="${mid}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
  }).join('');
  if (labels) {
    out += axes.map((n, i) => {
      const [x, y] = at(i, 1.16);
      const anchor = Math.abs(x - mid) < 6 ? 'middle' : (x > mid ? 'start' : 'end');
      return `<text class="axis" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}">${esc(n.name.length > 15 ? n.name.slice(0, 14) + '\\u2026' : n.name)}</text>`;
    }).join('');
  }
  return out;
}

function star(values, axes, size, klass, labels) {
  const points = shapeOf(values, axes, size);
  const shape = points.length > 2
    ? `<polygon class="shape ${klass}" points="${points.join(' ')}"></polygon>` : '';
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="star plot">
    ${webOf(axes, size, labels)}${shape}</svg>`;
}

function plotsOf(pair) {
  const windows = new Set(pair.windows);
  const milk = (byStage.get(pair.reference || 'Muttermilch') || [])
    .filter(a => windows.has(a.variant))
    .map(a => ({kind: 'milk', key: 'w' + a.dan, dan: a.dan, title: a.brand,
                under: a.variant, values: a.values}));
  const packs = (byStage.get(pair.stage) || []).slice()
    .sort((a, b) => (a.brand + a.variant).localeCompare(b.brand + b.variant, 'de'))
    .map(a => ({kind: 'pack', key: 'p' + a.dan, dan: a.dan, title: a.brand,
                under: a.variant || a.name, values: a.values}));
  return milk.concat(packs);
}

function drawChart() {
  wire();
  const step = pair();
  const axes = axesOf(step);
  const plots = plotsOf(step);
  el('title').textContent = `Every pack of ${step.stage} as a star against the milk of the same age`;
  el('sub').textContent = `${plots.length} plots \\u00b7 ${axes.length} spokes `
    + `\\u00b7 one ring is ${step.reference} over ${step.windows.length} `
    + (step.windows.length === 1 ? 'record' : 'lactation windows');
  el('pack').textContent = 'Click a plot to hold it. Held plots are drawn over each other above.';

  const held = plots.filter(p => picked.has(p.dan));
  const over = held.length
    ? held.map(p => {
        const points = shapeOf(p.values, axes, 420);
        const lift = lifted === p.dan ? ' lift' : '';
        return points.length > 2
          ? `<polygon class="shape ${p.kind === 'milk' ? 'milk' : ''}${lift}" points="${points.join(' ')}" data-tip="${esc(p.title)} ${esc(p.under)}"></polygon>`
          : '';
      }).join('')
    : '';
  const legend = held.length
    ? `<ol>${held.map(p => `<li data-lift="${p.dan}" class="${lifted === p.dan ? 'lift' : ''}">`
        + `<b>${esc(p.title)}</b> ${esc(p.under)}</li>`).join('')}</ol>`
    : '<p class="none">Nothing held yet. Click a plot below.</p>';

  const grid = plots.map(p => {
    const on = picked.has(p.dan) ? ' on' : '';
    return `<figure class="${on.trim()}" data-dan="${p.dan}">
      ${star(p.values, axes, 150, p.kind === 'milk' ? 'milk' : (picked.size && !on ? 'dim' : ''), false)}
      <figcaption><b>${esc(p.title)}</b><span>${esc(p.under)}</span></figcaption></figure>`;
  }).join('');

  el('plot').className = 'stars';
  el('plot').innerHTML = `<p class="hint">One ring is the ${esc(step.reference)} of this age. `
    + `Outside it the pack declares more and inside it less. The axis counts doublings.</p>`
    + `<div class="together"><div><svg viewBox="0 0 420 420" role="img" `
    + `aria-label="held plots over each other">${webOf(axes, 420, true)}${over}</svg></div>`
    + `<div class="who"><b>Held</b>${legend}</div></div><div class="small">${grid}</div>`;
}

/* The draw block runs before the shared script so nothing here may touch the document
   until the first draw. */
let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  el('plot').addEventListener('pointerover', event => {
    const node = event.target.closest('[data-lift]');
    const want = node ? Number(node.dataset.lift) : null;
    if (want !== lifted) { lifted = want; draw(); }
  });
}

function viewTable() {
  const step = pair();
  const axes = axesOf(step);
  el('tablecap').textContent = `${step.stage} against ${esc(step.reference)} of the same age`;
  el('tablehead').innerHTML = '<th class="who">Article</th>'
    + axes.map(n => `<th class="num">${nameLink(n.name)}</th>`).join('');
  el('tablebody').innerHTML = plotsOf(step).map(p => `<tr>
    <th class="who" scope="row">${esc(p.title)} ${esc(p.under)}</th>`
    + axes.map(n => {
        const v = p.values[n.name];
        return `<td class="num">${v === undefined || !n.milk.median ? '\\u2014' : times(v / n.milk.median)}</td>`;
      }).join('') + '</tr>').join('');
}
"""

STAR_LEGEND = """<span><i style="background:var(--series)"></i>a pack of the step</span>
<span><i style="background:var(--accent)"></i>breast milk of one lactation window</span>
<span>The dashed ring is one times the milk. Colour carries no identity so a held plot is
named in the list beside the chart.</span>"""


VIEWS = [
    {
        "key": "panels",
        "controls": ["stage", "sort", "view", "clear"],
        "group": "step",
        "file": "panels.html",
        "name": "Small multiples",
        "title": "Every nutrient as its own small plot",
        "answers": "Where does this pack sit among the others on each nutrient in the unit the pack declares.",
        "style": PANEL_STYLE,
        "draw": PANEL_DRAW,
        "legend": PANEL_LEGEND,
        "what": "One panel per nutrient. Every panel runs from the lowest to the highest value of "
                "that nutrient in the step so the dots spread over the whole width.",
        "cost": "Every panel holds a different scale so a dot in one panel says nothing about a dot "
                "in the next. A panel is about 300 px wide so a difference is read off a handful of "
                "pixels. Only the two ends of the scale carry a number.",
    },
    {
        "key": "indexed",
        "controls": ["stage", "sort", "view", "clear"],
        "group": "step",
        "file": "indexed.html",
        "name": "One shared axis",
        "title": "Every nutrient indexed to the median of the step",
        "answers": "Which nutrients the brands actually differ on and which are settled by the recipe.",
        "style": INDEX_STYLE,
        "draw": INDEX_DRAW,
        "legend": INDEX_LEGEND,
        "what": "One row per nutrient on one axis. A value is drawn as its share of the median of "
                "the step so a microgram of vitamin D sits beside a kilocalorie.",
        "cost": "The axis carries a share rather than a declared number so the figure itself only "
                "appears on hover or in the table. The axis is held at 200% so the handful of values "
                "above that are pushed onto the edge as a square.",
    },
    {
        "key": "heatmap",
        "controls": ["stage", "sort", "view", "clear"],
        "group": "step",
        "file": "heatmap.html",
        "name": "Heatmap",
        "title": "Every article against every nutrient",
        "answers": "Which article is unlike the field and on which nutrients it is unlike it.",
        "style": HEAT_STYLE,
        "draw": HEAT_DRAW,
        "legend": HEAT_LEGEND,
        "what": "One row per article and one column per nutrient. The cell carries how far the "
                "declaration sits from the median of the step in seven steps.",
        "cost": "Colour carries the value so the cell holds no number. Seven steps read as seven "
                "classes so two packs 30% apart inside one step look identical. The column headings "
                "have to stand on end to fit.",
    },
    {
        "key": "profiles",
        "controls": ["stage", "sort", "view", "clear"],
        "group": "step",
        "file": "profiles.html",
        "name": "Profiles",
        "title": "One line per article across every nutrient",
        "answers": "What shape a recipe has and which packs follow each other across the whole table.",
        "style": PROFILE_STYLE,
        "draw": PROFILE_DRAW,
        "legend": PROFILE_LEGEND,
        "what": "One line per article. The line steps through every nutrient at its share of the "
                "median so a recipe reads as a shape rather than as a row of numbers.",
        "cost": "Twenty six lines cross constantly so a single line is only readable once it is "
                "held. The order of the nutrients along the foot is a choice and it changes every "
                "shape on the page. A nutrient the pack never declares is stepped over silently.",
    },
    {
        "key": "ladder",
        "file": "ladder.html",
        "name": "The step ladder",
        "title": "Every nutrient from Pre to Kindermilch",
        "controls": ["sort", "view"],
        "group": "across",
        "answers": "How the recipe of a nutrient changes as the child grows.",
        "style": LADDER_STYLE,
        "draw": LADDER_DRAW,
        "legend": LADDER_LEGEND,
        "what": "One panel per nutrient. The line joins the median of Pre 1 2 3 4 and Kindermilch "
                "and the band behind it is the lowest to the highest declaration of each step.",
        "cost": "The line carries the median so a step of four articles is drawn as loudly as a "
                "step of twenty seven. Every panel holds its own scale. Spezialnahrung is left out "
                "because a medical food is not the next milk of a growing child.",
    },
    {
        "key": "steps",
        "file": "steps.html",
        "name": "The step matrix",
        "title": "Every step as a share of the first one",
        "controls": ["sort", "view"],
        "group": "across",
        "answers": "Which nutrients are raised and which are cut as the steps go up.",
        "style": MATRIX_STYLE,
        "draw": MATRIX_DRAW,
        "legend": MATRIX_LEGEND,
        "what": "One row per nutrient and one column per age step. The cell carries the median of "
                "that step as a share of the first step that declares the nutrient and prints it.",
        "cost": "A ratio of two medians says nothing about the spread inside either step. A "
                "nutrient that arrives late is measured against its own first step rather than "
                "against Pre so two rows can hold different bases.",
    },
    {
        "key": "pairs",
        "file": "pairs.html",
        "name": "Two nutrients",
        "title": "One nutrient against another across the steps",
        "controls": ["x", "y", "view", "clear"],
        "group": "across",
        "answers": "Whether two nutrients move together and whether the steps sit apart.",
        "style": PAIRS_STYLE,
        "draw": PAIRS_DRAW,
        "legend": PAIRS_LEGEND,
        "what": "One panel per age step with the same two scales in every panel. A dot is an "
                "article at its declaration of the two nutrients.",
        "cost": "Two nutrients out of forty three at a time. The scales are shared so a step "
                "whose articles sit in one corner spends most of its panel on empty space. An "
                "article that declares only one of the two is left out and counted.",
    },
    {
        "key": "spread",
        "file": "spread.html",
        "name": "What is settled",
        "title": "How far the declarations reach on each nutrient",
        "controls": ["stage", "measure", "view"],
        "group": "step",
        "answers": "Which nutrients the recipe settles and which the brands are free on.",
        "style": BARS_STYLE,
        "draw": SPREAD_DRAW,
        "legend": SPREAD_LEGEND,
        "what": "One bar per nutrient sorted by how far the declarations of the step reach. The "
                "bar is the lowest to the highest as a share of the median.",
        "cost": "One published error stretches a whole bar so the order reports the extreme "
                "rather than the field. The middle eight in ten is offered for that reason and it "
                "hides a real outlier just as readily.",
    },
    {
        "key": "card",
        "file": "card.html",
        "name": "One pack",
        "title": "What one pack does against its own step",
        "controls": ["who", "view"],
        "group": "step",
        "answers": "What actually makes one pack different from the milk beside it.",
        "style": CARD_STYLE,
        "draw": CARD_DRAW,
        "legend": CARD_LEGEND,
        "what": "One row per nutrient the pack declares. The bar runs from the median of the step "
                "out to what this pack declares and the rows are sorted by that distance.",
        "cost": "One pack at a time. The field is the median of its own step so a pack of stage 4 "
                "is measured against three others. The bar is held at a hundred points either way.",
    },
    {
        "key": "balance",
        "file": "balance.html",
        "name": "The lean",
        "title": "Which packs sit above the field and which below",
        "controls": ["stage", "view", "clear"],
        "group": "step",
        "answers": "Which brands are generous across the whole table rather than on one nutrient.",
        "style": BALANCE_STYLE,
        "draw": BALANCE_DRAW,
        "legend": BALANCE_LEGEND,
        "what": "One bar per article. Every nutrient of the step is sorted into the seven bands "
                "and the bar is centred so what sits below the median stacks left and what sits "
                "above stacks right.",
        "cost": "A band counts a nutrient rather than weighing it so vitamin K counts as much as "
                "protein. The bands are coarse so five points and twenty four points land in the "
                "same block.",
    },
    {
        "key": "gap",
        "file": "gap.html",
        "name": "How far the step sits from the milk",
        "title": "Every nutrient as a multiple of breast milk",
        "controls": ["pair", "order", "view"],
        "group": "against",
        "answers": "Which nutrients a step copies from breast milk and which it departs from.",
        "style": GAP_STYLE,
        "draw": GAP_DRAW,
        "legend": GAP_LEGEND,
        "what": "One row per nutrient the step and the milk both declare. The dot is the step "
                "median divided by the milk median and the axis counts doublings so every step "
                "out is twice the last. The grey strip along the foot of the track is the milk "
                "over its own windows and the rule is where the two are equal.",
        "cost": "A ratio hides the declared figure so a nutrient that runs in micrograms reads "
                "as loudly as protein. A nutrient only one side declares is dropped rather than "
                "drawn at zero. Manganese is the widest bar on the page and both of its figures "
                "are the weak ones named under Limits.",
    },
    {
        "key": "beside",
        "file": "beside.html",
        "name": "The milk beside the step",
        "title": "Breast milk and the step in the unit the pack declares",
        "controls": ["pair", "order", "view"],
        "group": "against",
        "answers": "What the two actually declare rather than how many times one is the other.",
        "style": BESIDE_STYLE,
        "draw": BESIDE_DRAW,
        "legend": BESIDE_LEGEND,
        "what": "One panel per nutrient with two rails. The upper rail is breast milk over the "
                "windows of that age and the lower is the step over its packs. Both rails share "
                "the scale of the panel so the gap is the distance between the two dots.",
        "cost": "Every panel holds its own scale so a gap in one panel says nothing about a gap "
                "in the next. A panel is about 240 px wide so a small difference is a few pixels. "
                "Only the two ends of the scale carry a number.",
    },
    {
        "key": "lifetime",
        "file": "lifetime.html",
        "name": "The first year",
        "title": "One nutrient month by month either way",
        "controls": ["nutrient", "view"],
        "group": "against",
        "answers": "What a child actually drinks through the first year on breast milk or on the "
                   "packs sold for each age.",
        "style": LIFE_STYLE,
        "draw": LIFE_DRAW,
        "legend": LIFE_LEGEND,
        "what": "The month of life runs along the foot. The line is breast milk at each lactation "
                "window and each block is an age step drawn over the months it is sold for with "
                "its median ruled across it.",
        "cost": "One nutrient at a time. A step is drawn as one block so the recipe appears to "
                "change on the day the child turns six months. The milk line stops at 8,5 months "
                "because the study does so stage 3 and stage 4 and Kindermilch face nothing. "
                "Pre and stage 1 are sold for the same months so their outlines overlap and only "
                "the two names under the foot tell them apart. Spezialnahrung is left out. The "
                "scale spans the data rather than starting at zero so a small gap fills the plot "
                "and the subtitle is the only thing that says where it starts.",
    },
    {
        "key": "closest",
        "file": "closest.html",
        "name": "Which pack sits nearest",
        "title": "Every pack of a step ranked by its distance from the milk",
        "controls": ["pair", "view", "clear"],
        "group": "against",
        "answers": "Which tin on the shelf is nearest breast milk across the whole table.",
        "style": NEAR_STYLE,
        "draw": NEAR_DRAW,
        "legend": NEAR_LEGEND,
        "what": "One bar per pack. Every nutrient the pack and the milk both declare is measured "
                "as a number of doublings away from the milk and the bar is the middle one of "
                "those. A shorter bar is nearer the milk.",
        "cost": "One number flattens forty nutrients so a pack that matches the milk on protein "
                "and misses on iron scores like its opposite. It weighs vitamin K as much as fat. "
                "A pack that declares fewer nutrients is scored on fewer of them.",
    },
    {
        "key": "periods",
        "file": "periods.html",
        "name": "The period table",
        "title": "Breast milk by lactation window against the packs of each age step",
        "controls": ["sort", "view"],
        "group": "against",
        "answers": "What breast milk holds at each period of lactation and what the packs "
                   "sold for that age hold beside it, as numbers rather than as marks.",
        "style": PERIOD_STYLE,
        "draw": PERIOD_DRAW,
        "legend": PERIOD_LEGEND,
        "what": "One row per nutrient. The ten left columns are breast milk at each lactation "
                "window as the study publishes it. The right columns are the median of each "
                "age step tinted against the milk of the age that step is sold for.",
        "cost": "A step is one median so the spread inside it is gone. Stage 3 and stage 4 and "
                "Kindermilch carry no tint because the study stops at 8,5 months and there is "
                "nothing of that age to measure them against. The table is wider than a screen "
                "so the nutrient column is pinned and the rest scrolls.",
    },
    {
        "key": "stars",
        "file": "stars.html",
        "name": "The star wall",
        "title": "Every pack of one age step as a star against the milk of the same age",
        "controls": ["pair", "spokes", "view", "clear"],
        "group": "against",
        "answers": "What shape each recipe of a step has against breast milk, and how two "
                   "of them differ, without leaving the step.",
        "style": STAR_STYLE,
        "draw": STAR_DRAW,
        "legend": STAR_LEGEND,
        "what": "One small star per pack of the step and one per lactation window of the "
                "matching age. Each arm is how many times the breast milk of that age the "
                "pack declares and the dashed ring is one times it. Clicking a star holds "
                "it and every held star is drawn over the others above.",
        "cost": "Twelve spokes out of forty so the shape is a choice rather than the whole "
                "declaration. The order of the spokes around the circle changes every shape "
                "on the wall. Colour carries no identity so two held stars are told apart by "
                "the list beside the chart rather than by their hue. An arm past 32 times "
                "the milk sits on the rim.",
    },
]


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · dm Babymilch</title>
<style>{style}{extra}</style>
</head>
<body>
<header class="top">
  <h1>{title}</h1>
  <p class="lede">{lede} <a href="index.html">Every way</a> ·
    <a href="../compare.html">One nutrient at a time</a> · <a href="../index.html">The list</a>.</p>
</header>
<div class="controls">{controls}</div>
<main>
  <section class="card" id="chartcard">
    <h2 id="title"></h2>
    <p class="sub" id="sub"></p>
    <p class="sub" id="pack"></p>
    <p class="legend">{legend}</p>
    <div id="plot"></div>
  </section>
  <section class="card" id="tablecard" hidden>
    <h2 id="tablecap"></h2>
    <p class="sub">Every figure the chart draws as the pack declares it.</p>
    <table>
      <thead><tr id="tablehead"></tr></thead>
      <tbody id="tablebody"></tbody>
    </table>
  </section>
</main>
<section class="cost">
  <h2>{name}</h2>
  <p><b>What it is.</b> {what}</p>
  <p><b>What it answers.</b> {answers}</p>
  <p><b>What it costs.</b> {cost}</p>
</section>
<div id="tip" role="tooltip" hidden></div>
<script>window.__VIEWS__ = {data};</script>
<script>{draw}</script>
<script>{script}</script>
</body>
</html>
"""

CHOICE_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{count} ways to read the whole table · dm Babymilch</title>
<style>{style}
.options {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; }}
.option {{ display: grid; gap: 0.4rem; align-content: start; }}
.option h2 {{ margin: 0; font-size: 1rem; }}
.option h2 a {{ text-decoration: none; }}
.option p {{ margin: 0; font-size: 0.85rem; }}
.option .tag {{ color: var(--quiet); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }}
.band {{ margin: 1.6rem 0 0.2rem; font-size: 1.05rem; }}
.band:first-child {{ margin-top: 0; }}
.blurb {{ margin: 0 0 0.8rem; max-width: 46rem; color: var(--quiet); font-size: 0.85rem; }}
.shared {{ margin: 1.5rem 1.25rem 3rem; font-size: 0.88rem; }}
.shared h2 {{ font-size: 0.95rem; margin: 1.2rem 0 0.3rem; }}
.shared p {{ margin: 0 0 0.6rem; max-width: 46rem; }}
</style>
</head>
<body>
<header class="top">
  <h1>{count} ways to read the whole table</h1>
  <p class="lede">{lede} <a href="../compare.html">One nutrient at a time</a> ·
    <a href="../index.html">The list</a>.</p>
</header>
<main>{options}</main>
<section class="shared">
  <h2>What every option holds steady</h2>
  <p>One shell one dataset one builder. Every option reads the same {articles} powder
  articles and the same nutrient list and every option was emitted from
  <code>tools/make_views.py</code>.</p>
  <p>A nutrient is drawn for a step only when at least half the articles of that step declare
  it. Everything is the per 100 ml column as the baby drinks it.</p>
  <h2>The one number that makes a microgram comparable to a kilocalorie</h2>
  <p>Most of the options draw a value as its share of a median.
  Because a) the nutrients run from 0,001 mg to 500 kcal so one raw axis is unreadable b) two
  axes on one plot would invent a relation that is not in the data c) the median of the step is
  a figure the reader can name.</p>
  <h2>What the data does to the drawing</h2>
  <p>Both dm data errors are still in here. Aptamil Spezialnahrung declares 4 mg of manganese
  against a step median of 0,022 mg and an Aptamil Folgemilch 2 declares 17 µg of vitamin B12
  against a median of 0,18 µg. They sit at the ceiling of every indexed option and they are the
  reason the ceiling exists.</p>
</section>
</body>
</html>
"""


GROUPS = [
    (
        "step",
        "One age step at a time",
        "Every option here holds one step and shows every nutrient of it.",
    ),
    (
        "against",
        "Against breast milk",
        "Every option here holds a formula step beside the breast milk a baby of that age "
        "drinks. The pairing is read off the age each one declares. Stage 3 and stage 4 and "
        "Kindermilch have no option here because the study stops at 8,5 months.",
    ),
    (
        "across",
        "Across the age steps",
        "Every option here holds every step so Pre 1 2 3 4 and Kindermilch read against "
        "each other. Spezialnahrung is left out because a medical food is not the next "
        "milk of a growing child.",
    ),
]


def choice_page(data: dict[str, Any], lede: str) -> str:
    """Build the page that holds every option beside the others."""
    shown = [view for key, _, _ in GROUPS for view in VIEWS if view["group"] == key]
    numbered = {view["key"]: index + 1 for index, view in enumerate(shown)}
    blocks = []
    for key, title, blurb in GROUPS:
        cards = "".join(
            f'<section class="card option">'
            f'<p class="tag">Option {numbered[view["key"]]}</p>'
            f'<h2><a href="{esc(view["file"])}">{esc(view["name"])}</a></h2>'
            f'<p>{esc(view["what"])}</p>'
            f'<p><b>Answers.</b> {esc(view["answers"])}</p>'
            f'<p><b>Costs.</b> {esc(view["cost"])}</p>'
            f"</section>"
            for view in VIEWS
            if view["group"] == key
        )
        blocks.append(
            f'<h2 class="band">{esc(title)}</h2><p class="blurb">{esc(blurb)}</p>'
            f'<div class="options">{cards}</div>'
        )
    return CHOICE_TEMPLATE.format(
        style=STYLE,
        lede=esc(lede),
        options="".join(blocks),
        articles=len(data["articles"]),
        count=len(VIEWS),
    )


CONTROLS = {
    "stage": '<label class="control"><span>Age step</span><select id="stage">{stages}</select></label>',
    "sort": '<label class="control"><span>Nutrient order</span><select id="sort">'
            '<option value="macros">Macronutrients first</option>'
            '<option value="name">A to Z</option>'
            '<option value="spread">Widest spread first</option></select></label>',
    "x": '<label class="control"><span>Across</span><select id="x">{across}</select></label>',
    "y": '<label class="control"><span>Up</span><select id="y">{up}</select></label>',
    "who": '<label class="control"><span>Article</span><select id="who">{who}</select></label>',
    "measure": '<label class="control"><span>Measure</span><select id="measure">'
               '<option value="full">The full range</option>'
               '<option value="mid">The middle eight in ten</option></select></label>',
    "spokes": '<label class="control"><span>Spokes</span><select id="spokes">'
              '<option value="headline">The twelve</option>'
              '<option value="macros">Macronutrients</option>'
              '<option value="minerals">Minerals</option>'
              '<option value="vitamins">Vitamins</option></select></label>',
    "view": '<label class="control"><span>View</span><select id="view">'
            '<option value="chart">Chart</option>'
            '<option value="table">Table</option></select></label>',
    "clear": '<button type="button" id="clear">Clear the picks</button>',
    "pair": '<label class="control"><span>Age step</span><select id="stage">{paired}</select></label>',
    "order": '<label class="control"><span>Nutrient order</span><select id="order">'
             '<option value="gap">Furthest from the milk first</option>'
             '<option value="macros">Macronutrients first</option>'
             '<option value="name">A to Z</option></select></label>',
    "nutrient": '<label class="control"><span>Nutrient</span><select id="nutrient">{one}</select></label>',
}

# Two options can ask for the same state under different names. The age step picker of
# the against group offers only the steps that have a breast milk pair.
CONTROL_ID = {"pair": "stage"}

ACROSS = "Eiwei\u00df"
UP = "Brennwert"


def nutrient_options(data: dict[str, Any], chosen: str) -> str:
    """Offer every nutrient any step declares."""
    return "".join(
        f'<option value="{esc(nutrient["name"])}"'
        f'{" selected" if nutrient["name"] == chosen else ""}>'
        f'{esc(nutrient["name"])} ({esc(nutrient["unit"])})</option>'
        for nutrient in data["nutrients"]
    )


def article_options(data: dict[str, Any]) -> str:
    """Offer every article under the age step it is sold for."""
    held: dict[str, list[dict[str, Any]]] = {}
    for article in data["articles"]:
        held.setdefault(article["stage"], []).append(article)
    groups = []
    # the pack card opens on a pack rather than on a lactation window
    first = next((a["dan"] for stage in data["stages"] if stage["name"] != MOTHER
                  for a in held.get(stage["name"], [])), None)
    for stage in data["stages"]:
        articles = sorted(
            held.get(stage["name"], []),
            key=lambda article: (article["brand"], article["variant"]),
        )
        inner = "".join(
            f'<option value="{article["dan"]}"'
            f'{" selected" if article["dan"] == first else ""}>'
            f'{esc(article["brand"])} {esc(article["variant"])} {esc(article["size"])}</option>'
            for article in articles
        )
        groups.append(f'<optgroup label="{esc(stage["name"])}">{inner}</optgroup>')
    return "".join(groups)


def control_row(view: dict[str, Any], data: dict[str, Any]) -> str:
    """Build the control row this option asks for."""
    stages = [stage["name"] for stage in data["stages"]]
    labels = [f"Stage {name}" if name.isdigit() else name for name in stages]
    paired = [step["stage"] for step in data["against"]]
    # the step options open on the first formula step rather than on the breast milk one
    first = next((name for name in stages if name != MOTHER), stages[0] if stages else "")
    filled = {
        "stages": options(stages, labels, first),
        "paired": options(paired, [f"Stage {n}" if n.isdigit() else n for n in paired]),
        "across": nutrient_options(data, ACROSS),
        "up": nutrient_options(data, UP),
        "who": article_options(data),
        "one": nutrient_options(data, UP),
    }
    return "".join(
        CONTROLS[key].format(**filled) if "{" in CONTROLS[key] else CONTROLS[key]
        for key in view["controls"]
    )


def view_page(view: dict[str, Any], data: dict[str, Any], lede: str) -> str:
    """Build one option."""
    return TEMPLATE.format(
        title=esc(view["title"]),
        name=esc(view["name"]),
        what=esc(view["what"]),
        answers=esc(view["answers"]),
        cost=esc(view["cost"]),
        style=STYLE,
        extra=view["style"],
        legend=view["legend"],
        lede=esc(lede),
        controls=control_row(view, data),
        data=safe_json(data),
        script=SCRIPT.replace("__CLAMP__", str(CLAMP)),
        draw=view["draw"],
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="make_views",
        description="Build four ways of showing every nutrient of one age step at once.",
    )
    parser.add_argument("--data", type=Path, default=Path("products.json"), help="collected JSON")
    parser.add_argument("--out", type=Path, default=Path("views"), help="directory to write")
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
    if not args.repacks:
        extra = repacks(kept)
        kept = [product for product in kept if product["dan"] not in extra]
    data = shape(build(kept))
    stamp = datetime.date.fromtimestamp(args.data.stat().st_mtime)
    lede = (
        f"{len(data['articles'])} powder articles over "
        f"{len(data['stages'])} age steps. Collected from dm.de on "
        f"{stamp.day} {stamp:%B} {stamp.year}."
    )
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "index.html").write_text(choice_page(data, lede), encoding="utf-8")
    print(f"{args.out / 'index.html'} holds the {len(VIEWS)} options")
    for view in VIEWS:
        target = args.out / view["file"]
        target.write_text(view_page(view, data, lede), encoding="utf-8")
        size = target.stat().st_size / 1024
        print(f"{target} draws {view['name'].lower()} and weighs {size:.0f} kB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
