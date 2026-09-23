#!/usr/bin/env python3
"""
Emits one page per way of entering a share on the quick fill page.

Because a) a decision is only readable when one thing differs. b) six
hand-copied shells drift apart within a day. c) the share column is the only
thing under test so the shell and the dataset are written once and each page
here is its own delta.

The shell is `f-board.css` for the app chrome and `shares.css` for the table.
The dataset is `data.js` for the month and `shares.js` for the mix.
"""

from pathlib import Path

HERE = Path(__file__).parent

PAGE = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tracker — {{TITLE}}</title>
<link rel="stylesheet" href="f-board.css">
<link rel="stylesheet" href="shares.css">
<style>
{{CSS}}
</style>
</head>
<body>

<header class="top">
  <div class="area">
    <div class="bar">
      <span class="mark">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="9" cy="9" r="8" fill="#00263C"/><circle cx="17" cy="17" r="8" fill="#FF4D06"/>
        </svg>
        <span>4<em>flow</em> Tracker</span>
      </span>
      <nav>
        <a href="#">Month view</a><a href="#" class="on">Quick fill</a><a href="#">Guided build</a><a href="#">My settings</a>
      </nav>
      <div class="who"><span>Alexander Kennedy</span><button type="button">Sign out</button></div>
    </div>
  </div>
</header>

<div class="area">
  <div class="title">
    <h1>May 2026</h1>
    <span class="pill">DE_BERLIN</span>
    <span class="pill light">80 per cent contract</span>
    <p>{{STANDFIRST}}</p>
  </div>

  <div class="sheet">
    <div class="pad">
      <h2>Quick fill</h2>
      <p class="lead">Give each cost centre a share of the month. The tracker fills the working days from the first onwards and skips the days it books nothing on.</p>

{{ABOVE}}
      <table class="fill">
        <thead>
          <tr>
            <th class="cc">Cost centre</th>
            <th class="spec">Specification</th>
            <th class="share">{{HEAD}}</th>
            <th class="days">{{FOURTH}}</th>
            <th class="tasks">Tasks</th>
            <th class="act"></th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
        <tfoot>
          <tr>
            <td colspan="2">
              <span class="acts">
                <button type="button" class="btn">Add a cost centre</button>
                <button type="button" class="btn" id="even">100 / n</button>
              </span>
            </td>
            <td class="fig num" id="total">100 %</td>
            <td class="fig num" id="booked">14.5</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>

      <p class="warn" id="warn" hidden>The shares must add up to 100 per cent.</p>

      <div class="bottom">
        <p>Working days: 18 &middot; Target: 14.5 &middot; This replaces everything already booked in May.</p>
        <button type="button" class="primary">Apply</button>
      </div>
    </div>
  </div>

  <footer>{{WON}}{{FOOTER}}</footer>
</div>

<script src="data.js"></script>
<script src="shares.js"></script>
<script>
{{SCRIPT}}
</script>
</body>
</html>
"""

# ---------------------------------------------------------------- the control

BOX_SCRIPT = """
function draw() {
  renderRows((row, at) => `<span class="pct"><input type="number" min="0" max="100" step="1" value="${row.share}" data-at="${at}"><span class="sign">%</span></span>`)
  renderTotals()
  for (const field of document.querySelectorAll('.pct input')) {
    field.addEventListener('input', () => {
      MIX[Number(field.dataset.at)].share = Number(field.value || 0)
      redraw()
    })
  }
}
/* The row being typed in keeps its focus and its caret. Only the figures move. */
function redraw() {
  const days = daysPerRow()
  document.querySelectorAll('#rows tr').forEach((tr, at) => {
    tr.querySelector('td.fig').textContent = days[at].toFixed(1)
  })
  renderTotals()
}
document.querySelector('#even').addEventListener('click', () => { spreadEvenly(); draw() })
draw()
"""

BOX_CSS = """.pct{display:flex;align-items:center;gap:5px}
.sign{color:var(--grey);font-size:12px}
"""

# --------------------------------------------------------------- A. a slider

SLIDER_CSS = """th.share{width:210px}
.sl{display:flex;align-items:center;gap:10px}
.sl input[type=range]{flex:1;min-width:0}
/* The figure is 4ch of tabular digits so the row does not shift as it changes. */
.sl b{min-width:5ch;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
"""

SLIDER_SCRIPT = """
function draw() {
  renderRows((row, at) => `<span class="sl"><input type="range" min="0" max="100" step="1" value="${row.share}" data-at="${at}" aria-label="Share of the month"><b class="num">${row.share} %</b></span>`)
  renderTotals()
  for (const slider of document.querySelectorAll('.sl input')) {
    slider.addEventListener('input', () => {
      const at = Number(slider.dataset.at)
      MIX[at].share = Number(slider.value)
      redraw()
    })
  }
}
function redraw() {
  const days = daysPerRow()
  document.querySelectorAll('#rows tr').forEach((tr, at) => {
    tr.querySelector('.sl b').textContent = MIX[at].share + ' %'
    tr.querySelector('td.fig').textContent = days[at].toFixed(1)
  })
  renderTotals()
}
document.querySelector('#even').addEventListener('click', () => { spreadEvenly(); draw() })
draw()
"""

# ----------------------------------------------- B. sliders that hold the 100

BALANCE_CSS = """th.share{width:250px}
.sl{display:flex;align-items:center;gap:8px}
.sl input[type=range]{flex:1;min-width:0}
.sl b{min-width:5ch;text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
/* The pin. A pinned row is held out of the balancing. */
.pin{border:1px solid var(--warm-grey);background:var(--white);color:var(--grey);border-radius:var(--r);padding:3px 8px;cursor:pointer;font-size:12px;line-height:1.5}
.pin[aria-pressed=true]{background:var(--smart-blue);border-color:var(--smart-blue);color:var(--white)}
"""

BALANCE_SCRIPT = """
const pinned = new Set()

/**
 * Hands the rest of the hundred to the rows that are neither pinned nor the one
 * being dragged. It is shared out in the proportion those rows already hold so
 * a row at twice another stays at twice it. The remainder lands on the largest
 * so the total is exactly a hundred rather than 99.
 */
function balance(moved) {
  const free = MIX.map((row, at) => at).filter((at) => at !== moved && !pinned.has(at))
  if (free.length === 0) return
  const held = MIX.reduce((sum, row, at) => sum + (at === moved || pinned.has(at) ? row.share : 0), 0)
  const left = Math.max(0, 100 - held)
  const was = free.reduce((sum, at) => sum + MIX[at].share, 0)
  const exact = free.map((at) => (was === 0 ? left / free.length : (MIX[at].share / was) * left))
  const out = exact.map(Math.floor)
  let over = left - out.reduce((a, b) => a + b, 0)
  const order = exact.map((value, i) => ({ i, part: value - Math.floor(value) })).sort((a, b) => b.part - a.part)
  for (const item of order) { if (over <= 0) break; out[item.i] += 1; over -= 1 }
  free.forEach((at, i) => (MIX[at].share = out[i]))
}

function draw() {
  renderRows((row, at) => `<span class="sl">
      <button type="button" class="pin" aria-pressed="${pinned.has(at)}" data-at="${at}" title="Hold this share">Hold</button>
      <input type="range" min="0" max="100" step="1" value="${row.share}" data-at="${at}" aria-label="Share of the month">
      <b class="num">${row.share} %</b>
    </span>`)
  renderTotals()
  for (const slider of document.querySelectorAll('.sl input')) {
    slider.addEventListener('input', () => {
      const at = Number(slider.dataset.at)
      MIX[at].share = Number(slider.value)
      balance(at)
      redraw()
    })
  }
  for (const pin of document.querySelectorAll('.pin')) {
    pin.addEventListener('click', () => {
      const at = Number(pin.dataset.at)
      if (pinned.has(at)) pinned.delete(at); else pinned.add(at)
      pin.setAttribute('aria-pressed', String(pinned.has(at)))
    })
  }
}
function redraw() {
  const days = daysPerRow()
  document.querySelectorAll('#rows tr').forEach((tr, at) => {
    tr.querySelector('.sl b').textContent = MIX[at].share + ' %'
    tr.querySelector('.sl input').value = MIX[at].share
    tr.querySelector('td.fig').textContent = days[at].toFixed(1)
  })
  renderTotals()
}
document.querySelector('#even').addEventListener('click', () => { pinned.clear(); spreadEvenly(); draw() })
draw()
"""

# --------------------------------------------------- C. one bar with handles

BAR_ABOVE = """      <div class="bar" id="bar"></div>
      <p class="note">Drag a divider. The month is always whole so what one cost centre takes the one beside it gives up.</p>
"""

BAR_CSS = """th.share{width:80px}
.bar{display:flex;height:54px;margin:0 0 6px;border-radius:var(--r);overflow:hidden;gap:2px}
.seg{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;font-weight:700;font-variant-numeric:tabular-nums;font-size:13px}
/* Four fills that each carry their own label. Smart Blue holds 4.70 on Vibrant
   Orange and 8.64 on Bold Pink and 12.69 on Warm Grey. White holds 15.64 on
   Smart Blue. Computed with contrast.py rather than recalled. */
.seg.c0{background:#00263C;color:#FFFFFF}
.seg.c1{background:#FF4D06;color:#00263C}
.seg.c2{background:#FFA0F5;color:#00263C}
.seg.c3{background:#EEE6E0;color:#00263C}
.seg span{padding:0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* The divider. It is the gap between two segments widened into a target. */
.grip{position:absolute;top:0;right:-7px;width:14px;height:100%;cursor:col-resize;z-index:2;background:none;border:0;padding:0}
/* Smart Blue rather than white. A white divider holds 1.23 to 1 on the Warm
   Grey segment and 1.30 on the Bold Pink one so it vanishes on both. Smart Blue
   holds 4.70 and 8.64 and 12.69 on the three light fills. */
.grip::after{content:'';position:absolute;top:14px;bottom:14px;left:6px;width:2px;background:var(--smart-blue)}
.grip:hover::after,.grip:focus-visible::after{top:6px;bottom:6px;background:var(--orange)}
.key{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 16px;padding:0;list-style:none;font-size:12px}
.key li{display:flex;align-items:center;gap:6px;color:var(--grey)}
.key i{width:12px;height:12px;border-radius:3px;display:block}
"""

BAR_SCRIPT = """
/** The fill of each row. Four is what the palette carries with a label on it. */
function paintBar() {
  const bar = document.querySelector('#bar')
  bar.innerHTML = MIX.map((row, at) => `<div class="seg c${at}" style="flex:0 0 ${row.share}%">
      <span>${row.id} &middot; ${row.share}%</span>
      ${at < MIX.length - 1 ? `<button type="button" class="grip" data-at="${at}" aria-label="Divider between ${row.id} and ${MIX[at + 1].id}"></button>` : ''}
    </div>`).join('')
  for (const grip of bar.querySelectorAll('.grip')) {
    grip.addEventListener('pointerdown', (event) => startDrag(event, Number(grip.dataset.at)))
    grip.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
      if (step === undefined) return
      event.preventDefault()
      move(Number(grip.dataset.at), step)
    })
  }
}

/** A divider takes from one side and gives to the other. Nothing else moves. */
function move(at, by) {
  const give = by > 0 ? at + 1 : at
  const take = by > 0 ? at : at + 1
  const step = Math.min(Math.abs(by), MIX[give].share)
  MIX[take].share += step
  MIX[give].share -= step
  redraw()
}

function startDrag(event, at) {
  const bar = document.querySelector('#bar')
  const width = bar.getBoundingClientRect().width
  const from = event.clientX
  const start = MIX[at].share
  const pair = start + MIX[at + 1].share
  event.target.setPointerCapture(event.pointerId)
  function onMove(e) {
    const moved = Math.round(((e.clientX - from) / width) * 100)
    const next = Math.max(0, Math.min(pair, start + moved))
    MIX[at + 1].share = pair - next
    MIX[at].share = next
    redraw()
  }
  function onUp() {
    event.target.removeEventListener('pointermove', onMove)
    event.target.removeEventListener('pointerup', onUp)
  }
  event.target.addEventListener('pointermove', onMove)
  event.target.addEventListener('pointerup', onUp)
}

function draw() {
  renderRows((row) => `<span class="fig num" style="display:block">${row.share} %</span>`)
  paintBar()
  renderTotals()
}
function redraw() {
  const days = daysPerRow()
  document.querySelectorAll('#rows tr').forEach((tr, at) => {
    tr.querySelector('td.share span').textContent = MIX[at].share + ' %'
    tr.querySelector('td.fig').textContent = days[at].toFixed(1)
  })
  paintBar()
  renderTotals()
}
document.querySelector('#even').addEventListener('click', () => { spreadEvenly(); draw() })
draw()
"""

# ------------------------------------------------------ D. days rather than %

DAYS_CSS = """th.share{width:132px}
.st{position:relative;display:block}
.st input{padding-right:40px!important;min-height:44px}
.arrows{position:absolute;top:3px;right:3px;bottom:3px;display:flex;flex-direction:column;gap:2px}
.arrows button{display:flex;align-items:center;justify-content:center;flex:1;min-width:30px;padding:0;border:0;border-radius:6px;background:var(--white);color:var(--smart-blue);cursor:pointer}
.arrows button:hover{background:var(--smart-blue);color:var(--white)}
"""

DAYS_SCRIPT = """
const UP = '<svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M4.5 0 9 6H0z" fill="currentColor"/></svg>'
const DOWN = '<svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M4.5 6 9 0H0z" fill="currentColor"/></svg>'

/** Typing days sets the share. The share is what the month is divided by. */
function setDays(at, days) {
  const held = Math.max(0, Math.round(days * 2) / 2)
  MIX[at].share = Math.round((held / TARGET) * 100)
  redraw()
}

function draw() {
  renderRows((row, at) => {
    const days = daysPerRow()[at]
    return `<span class="st">
      <input type="number" min="0" max="${TARGET}" step="0.5" value="${days.toFixed(1)}" data-at="${at}" aria-label="Days on this cost centre">
      <span class="arrows">
        <button type="button" data-at="${at}" data-by="0.5" aria-label="Increase">${UP}</button>
        <button type="button" data-at="${at}" data-by="-0.5" aria-label="Decrease">${DOWN}</button>
      </span>
    </span>`
  }, (row) => `${row.share} %`)
  renderTotals()
  for (const field of document.querySelectorAll('.st input')) {
    field.addEventListener('change', () => setDays(Number(field.dataset.at), Number(field.value)))
  }
  for (const arrow of document.querySelectorAll('.arrows button')) {
    arrow.addEventListener('click', () => {
      const at = Number(arrow.dataset.at)
      setDays(at, daysPerRow()[at] + Number(arrow.dataset.by))
    })
  }
}
function redraw() {
  const days = daysPerRow()
  document.querySelectorAll('#rows tr').forEach((tr, at) => {
    tr.querySelector('.st input').value = days[at].toFixed(1)
    tr.querySelector('td.fig').textContent = MIX[at].share + ' %'
  })
  renderTotals()
}
document.querySelector('#even').addEventListener('click', () => { spreadEvenly(); draw() })
draw()
"""

# ----------------------------------------------------------- E. a weight each

WEIGHT_CSS = """th.share{width:130px}
.wt{display:flex;align-items:center;gap:8px}
.wt input{width:70px!important}
.wt b{font-variant-numeric:tabular-nums;font-weight:700;min-width:5ch;text-align:right}
"""

WEIGHT_SCRIPT = """
/* The weight each row was given. One is a single portion and two is twice it. */
const WEIGHTS = [4, 3, 2, 1]

/**
 * Normalises the weights onto a hundred. The floors are dealt first and what is
 * left goes to the rows the division cut hardest, so the total is exactly a
 * hundred whatever the weights are.
 */
function normalise() {
  const sum = WEIGHTS.reduce((a, b) => a + b, 0)
  if (sum === 0) { MIX.forEach((row) => (row.share = 0)); return }
  const exact = WEIGHTS.map((w) => (w / sum) * 100)
  const out = exact.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = exact.map((value, i) => ({ i, part: value - Math.floor(value) })).sort((a, b) => b.part - a.part)
  for (const item of order) { if (left <= 0) break; out[item.i] += 1; left -= 1 }
  MIX.forEach((row, at) => (row.share = out[at]))
}

function draw() {
  normalise()
  renderRows((row, at) => `<span class="wt">
      <input type="number" min="0" max="99" step="1" value="${WEIGHTS[at]}" data-at="${at}" aria-label="Weight">
      <b class="num">${row.share} %</b>
    </span>`)
  renderTotals()
  for (const field of document.querySelectorAll('.wt input')) {
    field.addEventListener('input', () => {
      WEIGHTS[Number(field.dataset.at)] = Math.max(0, Number(field.value || 0))
      normalise()
      redraw()
    })
  }
}
function redraw() {
  const days = daysPerRow()
  document.querySelectorAll('#rows tr').forEach((tr, at) => {
    tr.querySelector('.wt b').textContent = MIX[at].share + ' %'
    tr.querySelector('td.fig').textContent = days[at].toFixed(1)
  })
  renderTotals()
}
document.querySelector('#even').addEventListener('click', () => {
  WEIGHTS.fill(1)
  draw()
})
draw()
"""

PAGES = [
    dict(
        key='s0-box',
        title='the control — the box the page has today',
        standfirst='What the five are measured against.',
        head='Share',
        css=BOX_CSS,
        above='',
        script=BOX_SCRIPT,
        footer="""<b>The control. A number box a row.</b> This is the quick fill page as it stands. The user types a figure and reads the total under the column.
    It costs nothing to build because it is already built. It costs the arithmetic. Four rows means four numbers the user has to make add up to a hundred themselves,
    and the page only says whether they managed it after the last one is typed. The <code>100 / n</code> button is there because that arithmetic is the complaint.""",
    ),
    dict(
        key='s1-slider',
        title='option A — a slider a row',
        standfirst='Option A. Each share is dragged on its own track.',
        head='Share',
        css=SLIDER_CSS,
        above='',
        script=SLIDER_SCRIPT,
        footer="""<b>Option A. A slider a row.</b> The share is dragged rather than typed and the figure beside it says where the handle landed.
    A rough split is quick because a rough split is all a drag can express.
    It costs the total. Four independent sliders do not add up to a hundred and the user chases the last few per cent between them.
    It costs precision as well. The track here is 150 px so one per cent is 1.5 px and no one lands on 37 by dragging.
    It costs 90 px of column width, which is width the cost centre and the specification columns give up.""",
    ),
    dict(
        key='s2-balance',
        title='option B — sliders that hold the hundred',
        standfirst='Option B. Dragging one share takes it from the others.',
        head='Share',
        won=True,
        css=BALANCE_CSS,
        above='',
        script=BALANCE_SCRIPT,
        footer="""<b>Option B. Sliders that hold the hundred.</b> What one row takes the others give up in the proportion they already held. The total is a hundred at every moment so the error message never appears and <code>100 / n</code> is only a starting point.
    Hold pins a row so a share the user has settled is not moved by the next drag.
    It costs predictability. A drag on one row rewrites three figures the user did not touch, and that is the thing people distrust in a control like this. Hold is the answer to it and it is one more thing to learn.
    It costs column width. It also costs the last row: with three rows pinned a drag has nowhere to put the remainder and the handle stops dead.
    Built in <code>SimpleView.vue</code> with the balancing in <code>balanceShares</code> in core. The share cell went to two lines there rather than the one this page uses, because the running app gives the table 732 px and the cost centre column takes 321 px of it, which put the figure off the visible table. Two lines also give the track 148 px where one line left it 95 px.""",
    ),
    dict(
        key='s3-bar',
        title='option C — one bar with dividers',
        standfirst='Option C. The month is one bar and the dividers are dragged.',
        head='Share',
        css=BAR_CSS,
        above=BAR_ABOVE,
        script=BAR_SCRIPT,
        footer="""<b>Option C. One bar and a divider between each pair.</b> The month is a hundred by construction so no arithmetic is possible and none is asked for. The shape of the month is readable at a glance, which is the one thing a column of figures never gives.
    It costs the palette. The four fills are Smart Blue and Vibrant Orange and Bold Pink and Warm Grey, which are the four the theme has that carry a label: computed at 15.64 and 4.70 and 8.64 and 12.69 to 1. A fifth cost centre has no fill left, and the page allows any number of them.
    The fills do not separate from each other. Vibrant Orange beside Bold Pink is 1.84 to 1 and Bold Pink beside Warm Grey is 1.47, both under the 3 a graphic needs. The label inside each segment is what tells them apart, so a share too narrow to hold its label is a segment nobody can name. That is every share under about 8 per cent.
    It costs the keyboard too. A divider is not a control a browser gives, so the arrow keys on it are written by hand.""",
    ),
    dict(
        key='s4-days',
        title='option D — days rather than per cent',
        standfirst='Option D. The user books days and the per cent is derived.',
        head='Days',
        fourth='Share',
        css=DAYS_CSS,
        above='',
        script=DAYS_SCRIPT,
        footer="""<b>Option D. Days rather than per cent.</b> Nobody worked 37 per cent of May. They worked five and a half days. This asks for the figure the user actually holds and derives the share the tracker wants from it.
    The arrows step half a day, which is the smallest unit the tracker books, so every value the field can reach is a value the month can hold.
    It costs the round trip. The share is stored as an integer per cent so 5.5 days of 14.5 is 38 per cent, and 38 per cent of 14.5 comes back as 5.5. It holds here for every row but it is arithmetic the user cannot see and it will not hold for every target.
    It costs the target. A user who books 14 days when the target is 14.5 has to be told what the target was, and changing the month or the contract rewrites every row.
    The two columns swap over here. Days is what is typed and Share is what the page works out, because the same figure written in both would be a column spent on nothing.""",
    ),
    dict(
        key='s5-weights',
        title='option E — a weight a row',
        standfirst='Option E. A weight each and the app does the division.',
        head='Weight',
        css=WEIGHT_CSS,
        above='',
        script=WEIGHT_SCRIPT,
        footer="""<b>Option E. A weight a row.</b> Twice as much on one cost centre as on another is a 2 and a 1. The app normalises the weights onto a hundred and the per cent beside the field says what that came to.
    It is the only one of the five where adding a fifth cost centre needs no other row to be retyped. A weight of 1 is added and the rest fall where they fall.
    It costs the direct answer. A user who knows the split is 40 and 30 and 20 and 10 has to type 4 and 3 and 2 and 1, and a user who knows it is 37 and 33 and 30 has to type 37 and 33 and 30 anyway.
    It costs the stored figure. The number typed is never the number saved, and a rounded 33 per cent against a weight of 1 in 3 is a difference the user is not shown the arithmetic for.""",
    ),
]

WON = '<b class="won">Chosen 2026-09-22.</b> '

INDEX = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tracker — entering a share on quick fill</title>
<link rel="stylesheet" href="f-board.css">
<style>
.area{max-width:980px}
h1{font-size:30px;margin:26px 0 10px}
.intro{color:var(--grey);max-width:74ch}
ol{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:14px}
li a{display:block;background:var(--white);border-radius:var(--r);padding:18px 22px;text-decoration:none;color:inherit}
li a:hover{outline:2px solid var(--bright-blue);outline-offset:-2px}
li a.won{outline:2px solid var(--orange);outline-offset:-2px}
.tag{display:inline-block;background:var(--orange);color:var(--smart-blue);font-weight:700;border-radius:var(--r);padding:1px 9px;font-size:12px;margin-right:8px;vertical-align:2px}
li b{display:block;font-size:17px;margin-bottom:4px}
li span{color:var(--grey);font-size:13px}
.chosen{outline:2px solid var(--orange);outline-offset:-2px}
footer{padding:36px 0 60px}
</style>
</head>
<body>
<div class="area">
  <h1>Entering a share on quick fill</h1>
  <p class="intro">Five ways to give a cost centre its share of the month, and the box the page has today to measure them against. Every page reads the same four cost centres out of <code>data.js</code> and sits in the same sheet. The share column is the only thing that differs. Each page ends with what the option costs.</p>
  <p class="intro"><b>Option B won on 2026-09-22 and is built.</b> Because a) the arithmetic of making four figures reach a hundred is the complaint the <code>100 / n</code> button was added for. b) B is the only one of the five that removes that arithmetic rather than checking it afterwards, because the total cannot leave a hundred. c) the shares are a split of one month and a control that can express nothing else says so. It costs predictability, and Hold is what pays it. The four that lost are kept because a decision is only readable beside what it beat.</p>
  <ol>
{{ITEMS}}
  </ol>
  <footer>Built by <code>build-shares.py</code>. The shell is <code>f-board.css</code> and <code>shares.css</code>. The data is <code>data.js</code> and <code>shares.js</code>. Every contrast ratio quoted was computed with <code>contrast.py</code>.</footer>
</div>
</body>
</html>
"""


def build() -> None:
    items = []
    for page in PAGES:
        html = PAGE
        for token, value in (
            ('{{TITLE}}', page['title']),
            ('{{STANDFIRST}}', page['standfirst']),
            ('{{HEAD}}', page['head']),
            ('{{FOURTH}}', page.get('fourth', 'Days')),
            ('{{CSS}}', page['css'].rstrip()),
            ('{{ABOVE}}', page['above'].rstrip()),
            ('{{SCRIPT}}', page['script'].strip()),
            ('{{WON}}', WON if page.get('won') else ''),
            ('{{FOOTER}}', page['footer']),
        ):
            html = html.replace(token, value)
        assert '{{' not in html, page['key']
        (HERE / f'{page["key"]}.html').write_text(html, encoding='utf-8')
        print(f'wrote {page["key"]}.html')
        lead = page['footer'].split('</b>')[0].replace('<b>', '')
        tag = '<span class="tag">Built</span>' if page.get('won') else ''
        items.append(
            f'    <li><a class="{"won" if page.get("won") else ""}" href="{page["key"]}.html">'
            f'<b>{tag}{lead}</b><span>{page["standfirst"]}</span></a></li>'
        )
    index = INDEX.replace('{{ITEMS}}', '\n'.join(items))
    assert '{{' not in index
    (HERE / 'shares-index.html').write_text(index, encoding='utf-8')
    print('wrote shares-index.html')


if __name__ == '__main__':
    build()
