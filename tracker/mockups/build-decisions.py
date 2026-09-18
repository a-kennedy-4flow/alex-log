#!/usr/bin/env python3
"""
Emits one page per decision option.

Because a) a decision is only readable when one thing differs. b) six
hand-copied shells drift apart. c) the shell already lives in f-board.css so
each page here is its own delta and nothing else.
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
        <a href="#" class="on">Month view</a><a href="#">Quick fill</a><a href="#">My settings</a><a href="#">Cost centres</a>
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
      <div class="controls">
        <label class="field"><span>Year</span><select><option>2026</option></select></label>
        <label class="field"><span>Month</span><select><option>May</option></select></label>
        <label class="field"><span>Location</span><select><option>DE_BERLIN</option></select></label>
        <div class="field">
          <span>View</span>
          <div class="views">
            <button type="button">Grid</button><button type="button" class="on">Board</button>
          </div>
        </div>
        <dl class="stats">
          <div class="stat"><dt>Working days</dt><dd>18</dd></div>
          <div class="stat"><dt>Target</dt><dd>14.5</dd></div>
          <div class="stat"><dt>Booked</dt><dd class="off">13.5</dd></div>
        </dl>
      </div>

      <div class="cols">
        <div class="{{BOARD}}">
          <div class="legend"><span class="lab">Legend</span><span id="legend"></span></div>
          <div class="board" id="board"></div>
{{UNDER}}
        </div>
{{SIDE}}
      </div>
    </div>

    <div class="download">
      <div class="fn"><span>File name</span>20260531_4flow_2026_05_projecttracker_DE_BERLIN.xlsm</div>
      <p>Download the tracker then email it to software.projecttracker@4flow.com.</p>
      <button type="button" class="primary">Download the tracker</button>
    </div>
  </div>

  <footer>{{FOOTER}}</footer>
</div>

<script src="data.js"></script>
<script src="f-board.js"></script>
<script>
const POP = `{{POP}}`
{{SCRIPT}}
fillAside()
</script>
</body>
</html>
"""

ASIDE = """        <aside>
          <section>
            <h2>This month</h2>
            <div class="figure"><span class="big">13.5</span><span class="of">/ 14.5</span><span class="unit">days</span></div>
            <div class="track"><div class="fill"></div></div>
            <ul class="weeks" id="weeks"></ul>
            <p class="foot">18 working days at your location.</p>
          </section>
          <section>
            <h2>Checks</h2>
            <ul class="checks" id="checks"></ul>
          </section>
          <section>
            <h2>Your cost centres</h2>
            <div class="recent" id="recent"></div>
            <p class="foot">Click one to book it on the next free day.</p>
          </section>
        </aside>
"""

FIELDS = """            <label class="ed"><span>Cost centre</span><select><option>4100915 — Transport optimisation</option></select></label>
            <label class="ed"><span>Specification</span><select><option>Analysis</option></select></label>
            <label class="ed"><span>Days</span><select><option>1</option><option>0.5</option></select></label>
            <label class="ed"><span>Location</span><select><option>DE_BERLIN</option></select></label>
            <label class="ed"><span>Tasks</span><input type="text" value="Lane costing"></label>
"""

RAIL = """        <aside class="rail">
          <section>
            <h2>Wednesday 20 May</h2>
""" + FIELDS + """            <div class="acts">
              <button type="button" class="ghost">Split the day</button>
              <button type="button" class="save">Save</button>
            </div>
          </section>
          <section>
            <h2>This month</h2>
            <div class="figure"><span class="big">13.5</span><span class="of">/ 14.5</span><span class="unit">days</span></div>
            <div class="track"><div class="fill"></div></div>
            <p class="foot">1 day to go. 18 working days at your location.</p>
          </section>
          <section>
            <h2>Checks</h2>
            <ul class="checks" id="checks"></ul>
          </section>
        </aside>
"""

POP_FIELDS = (
    '<label class="ed"><span>Cost centre</span><select><option>3000112 — Product development</option></select></label>'
    '<label class="ed"><span>Specification</span><select><option>Development</option></select></label>'
    '<div class="two"><label class="ed"><span>Days</span><select><option>0.5</option><option>1</option></select></label>'
    '<label class="ed"><span>Location</span><select><option>DE_BERLIN</option></select></label></div>'
    '<label class="ed"><span>Tasks</span><input type="text" value="Release 2.4"></label>'
)

POPOVER_CSS = """/* The popover. A 1px Smart Blue edge stands in for the shadow F does not use. */
.cell.open{background:#FFF6F2}
.pop{
  position:absolute;top:calc(100% - 6px);left:-1px;width:300px;z-index:5;
  background:var(--white);border:1px solid var(--smart-blue);border-radius:var(--r);padding:16px 18px;
}
.pop h3{margin:0 0 12px;font-size:14px}
.ed{display:grid;gap:3px;margin-bottom:10px}
.ed span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--grey)}
.ed select,.ed input{
  width:100%;background:var(--warm-grey);border:0;border-radius:var(--r);padding:8px 11px;color:inherit;
}
.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.acts{display:flex;gap:8px;margin-top:14px}
.ghost{flex:1;border:1px solid var(--warm-grey);background:none;color:var(--smart-blue);border-radius:var(--r);padding:9px 0;cursor:pointer}
.save{flex:1;border:0;background:var(--orange);color:var(--smart-blue);font-weight:700;border-radius:var(--r);padding:9px 0;cursor:pointer}
"""

RAIL_CSS = """.cols{grid-template-columns:minmax(0,1fr) 340px}
/* The chosen day carries the outline. Vibrant Orange marks one thing at a time. */
.cell.sel{outline:2px solid var(--orange);outline-offset:-2px}
.ed{display:grid;gap:3px;margin-bottom:10px}
.ed span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--grey)}
.ed select,.ed input{
  width:100%;background:var(--warm-grey);border:0;border-radius:var(--r);padding:8px 11px;color:inherit;
}
.acts{display:flex;gap:8px;margin-top:14px}
.ghost{flex:1;border:1px solid var(--warm-grey);background:none;color:var(--smart-blue);border-radius:var(--r);padding:9px 0;cursor:pointer}
.save{flex:1;border:0;background:var(--orange);color:var(--smart-blue);font-weight:700;border-radius:var(--r);padding:9px 0;cursor:pointer}
.rail h2{margin-bottom:12px}
"""

MINIMAL_CSS = """.cell{min-height:142px}
/* Two fields in the cell. The rest of the row stays in the grid. */
.mini{display:grid;gap:4px;margin-top:auto}
.mini select{
  width:100%;background:var(--warm-grey);border:0;border-radius:var(--r);padding:5px 8px;
  font-size:12px;color:inherit;
}
.mini select{width:100%}
.more{
  position:absolute;top:6px;right:6px;border:0;background:none;color:var(--grey);
  border-radius:var(--r);padding:1px 6px;cursor:pointer;font-size:15px;line-height:1.1;
}
.more:hover{background:var(--warm-grey);color:var(--smart-blue)}
.handoff{
  margin-top:16px;border-left:6px solid var(--orange);background:#FFF6F2;
  border-radius:var(--r);padding:14px 18px;font-size:13px;
}
.handoff b{display:block;margin-bottom:3px}
.handoff p{margin:0}
"""

HANDOFF = """          <div class="handoff">
            <b>Three fields are not on the board</b>
            <p>Specification takes the default of the cost centre. Location takes your profile. Tasks stays empty. The ⋯ on a booked day opens that day in the grid.</p>
          </div>
"""

# Decision 4. The board is held at the width where the chip stops fitting.
#
# A workday id runs to seven digits and the day value takes three more. The chip
# needs 101px for both and a cell at a 1280px window gives it 83px. The mockup
# area is wider than the app so every option here pins the board to 604px. That
# is the seven cells a 1280px window leaves the app today. Because a) the fault
# is invisible at the natural mockup width. b) an option judged where it does
# not bite proves nothing.
SQUEEZE = """/* The board is held at what a 1280px window gives the app. */
.board{max-width:604px}
.legend{max-width:604px}

/* A `1fr` track still refuses to go under its own content so the seven columns
   of `f-board.css` come out unequal. `MonthCalendar.vue` draws a table with a
   fixed layout where every column is the same width. The mockup has to match
   it or an option is judged on a column the app never draws. */
.board{grid-template-columns:repeat(7,minmax(0,1fr))}

/* The app sets `.num` in the mono stack and a digit there is wider than the
   Arial digit `f-board.css` draws. The d1 and d2 pages keep the Arial digit
   because those decisions were judged on it. */
.chip b,.cell .d{font-family:ui-monospace,'SF Mono','Cascadia Mono',Menlo,Consolas,monospace}

/* The guard. It belongs to every option because a box crossing the cell rule is
   the fault rather than a design. Nothing below overrides it. */
.cell{min-width:0}
.chips{min-width:0}
.chip{min-width:0}
.chip b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip i{flex:none}

/* The date holds its width and the flag beside it breaks inside the word.
   `Ascension Day` is 13 characters against the 44px the cell leaves it. */
.cell .top{min-width:0}
.cell .d{flex:none}
.cell .lab{min-width:0;overflow-wrap:break-word}
"""

CLIP_CSS = """/* Option A. One line and the id gives way. Nothing else changes. */
"""

WRAP_CSS = """/* Option B. The day value drops to a line of its own once both will not fit. */
.chip{flex-wrap:wrap;row-gap:0}
"""

MARK_CSS = """/* Option C. A half day is drawn rather than written so the id holds the chip
   alone. The fill stops halfway. No shade is invented because the cut is
   between Warm Grey and the white of the cell. */
.chip i{display:none}
.chip.half{background:linear-gradient(90deg,var(--warm-grey) 0 50%,var(--white) 50% 100%)}
.half-key{margin-top:14px;font-size:12px;color:var(--grey);display:flex;align-items:center;gap:9px}
.half-key .chip{font-size:11px;padding:3px 9px}
"""

COMPACT_CSS = """/* Option D. Less type and less padding buy the line back. 11px is what the
   cell already sets on a bank holiday label. */
.cell{padding:8px 6px}
.chip{font-size:11px;padding:3px 6px;gap:5px}
"""

SCROLL_CSS = """/* Option E. A cell holds a minimum and the board scrolls sideways under it.
   This is what `MonthGrid.vue` already does with its nine columns. */
.scroller{overflow-x:auto}
.board{min-width:728px;max-width:none}
.scroller{max-width:604px}
"""

TIGHT_CSS = COMPACT_CSS + """
/* Then option B under it. The compact chip holds one line to 1440px and wraps
   below that rather than cutting the id. */
.chip{flex-wrap:wrap;row-gap:0}
"""

# Option E is the one page that needs a box around the board. The rest differ in
# CSS alone.
SCROLL_SCRIPT = """renderBoard('#board', addControl)
const board = document.querySelector('#board')
const scroller = document.createElement('div')
scroller.className = 'scroller'
board.parentNode.insertBefore(scroller, board)
scroller.appendChild(board)"""

# The half day mark is a class rather than a value so the CSS can draw it.
MARK_SCRIPT = """renderBoard('#board', addControl)
for (const chip of document.querySelectorAll('.chip')) {
  const value = chip.querySelector('i')
  if (value && value.textContent.trim() === '0.5') chip.classList.add('half')
}
document.querySelector('#board').insertAdjacentHTML(
  'afterend',
  '<p class="half-key">A chip filled to halfway is half a day. <span class="chip cc-4100782 half"><b class="num">4100782</b></span> <span class="chip cc-4100915"><b class="num">4100915</b></span></p>',
)"""

PAGES = [
    dict(
        key='d1-popover',
        title='decision 1 option A — popover',
        standfirst='Decision 1. A popover opens the day on the cell.',
        board='edge',
        css=POPOVER_CSS,
        under='',
        side=ASIDE,
        script="""renderBoard('#board', addControl)
const cell = document.querySelector('[data-day="6"]')
cell.classList.add('open')
cell.insertAdjacentHTML(
  'beforeend',
  `<div class="pop"><h3>Wednesday 6 May — lower half</h3>${POP}<div class="acts"><button type="button" class="ghost">Clear this half</button><button type="button" class="save">Save</button></div></div>`,
)""",
        footer="""<b>Decision 1 option A. A popover on the cell.</b> The day opens where it sits. The month stays whole behind it.
    Every field a grid row carries fits inside. It costs a layer above the board. A popover near the sheet edge has to flip its side.
    A keyboard user needs the focus held inside it then handed back to the cell.
    The chip treatment is held at decision 2 option B so only the editing differs across these three.""",
    ),
    dict(
        key='d1-rail',
        title='decision 1 option B — detail rail',
        standfirst='Decision 1. A rail beside the board holds the day.',
        board='edge',
        css=RAIL_CSS,
        under='',
        side=RAIL,
        script="""renderBoard('#board', addControl)
document.querySelector('[data-day="20"]').classList.add('sel')""",
        footer="""<b>Decision 1 option B. A detail rail.</b> The day opens beside the board. Nothing ever covers the month.
    The rail is always there so there is no open state to manage. It costs 340 px of width.
    The checks move under the rail and the cost centre list drops off the page.
    The chip treatment is held at decision 2 option B so only the editing differs across these three.""",
    ),
    dict(
        key='d1-minimal',
        title='decision 1 option C — two fields in the cell',
        standfirst='Decision 1. The cell takes two fields and the grid takes the rest.',
        board='edge',
        css=MINIMAL_CSS,
        under=HANDOFF,
        side=ASIDE,
        script="""function control(day, free) {
  if (free) {
    return `<div class="mini">
      <select><option>Cost centre</option></select><select><option>1 day</option><option>0.5</option></select>
    </div>`
  }
  return day.total > 0 ? '<button type="button" class="more" title="Open this day in the grid">⋯</button>' : ''
}
renderBoard('#board', control)""",
        footer="""<b>Decision 1 option C. The cell edits two fields.</b> A free day takes a cost centre with a day value in place.
    Specification falls to the default of that cost centre. Location falls to your profile. Tasks stays empty.
    The board becomes the fast path rather than the whole editor. It costs a trip to the grid whenever a task has to be typed.
    The chip treatment is held at decision 2 option B so only the editing differs across these three.""",
    ),
    dict(
        key='d2-fills',
        title='decision 2 option A — five fills',
        standfirst='Decision 2. Each cost centre takes a fill.',
        board='fills',
        css='',
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 2 option A. Five fills.</b> A cost centre is read at a glance and the number confirms it.
    Two of the five are tints mixed from Bright Blue and Vibrant Orange. The deck forbids inventing a shade.
    A brand owner has to approve those two before this ships. Five is the limit before the fills stop separating.
    A sixth cost centre in one month has no fill left to take.""",
    ),
    dict(
        key='d2-edge',
        title='decision 2 option B — a line down the edge',
        standfirst='Decision 2. A theme line names the cost centre.',
        board='edge',
        css='',
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 2 option B. A theme line down the chip edge.</b> The chip stays Warm Grey and a 4 px line carries the identity.
    No shade is invented so nothing needs approval. Bright Blue is allowed here because a line carries no text.
    Five lines separate cleanly. The one cost is Vibrant Orange. It is reserved for the primary action so a line spends that reservation.
    Drop the orange line and four cost centres separate rather than five.""",
    ),
    dict(
        key='d2-neutral',
        title='decision 2 option C — no colour',
        standfirst='Decision 2. The number carries the identity alone.',
        board='neutral',
        css='',
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 2 option C. No colour.</b> Every chip is Warm Grey. The number is the only thing that separates one cost centre from another.
    Nothing needs approval. A month may hold any number of cost centres. This is what A and B and F already do in the grid.
    It costs the glance. Two cost centres in one week look alike until the number is read.""",
    ),
    dict(
        key='d4-clip',
        title='decision 4 option A — the id gives way',
        standfirst='Decision 4. The chip holds one line and cuts the id to reach it.',
        board='edge',
        css=SQUEEZE + CLIP_CSS,
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 4 option A. One line and the id gives way.</b> The chip never leaves its cell and never grows.
    It costs the id. A cut id names no cost centre and the reader has to open the day to learn which one it is.
    16 of the 21 ids on this page are cut so it is the normal case rather than the rare one.
    The board is held at 604 px across all six pages. That is the seven cells a 1280 px window leaves the app today.""",
    ),
    dict(
        key='d4-wrap',
        title='decision 4 option B — the day value drops a line',
        standfirst='Decision 4. The day value takes a second line when both will not fit.',
        board='edge',
        css=SQUEEZE + WRAP_CSS,
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 4 option B. The day value drops to a line of its own.</b> The id gets the first line to itself.
    12 px type is still too wide to pay for the drop. 16 of the 21 ids are cut here which is what option A cuts without growing at all.
    It costs cell height for nothing. The cell runs to 139 px against 108 px today.
    The board is held at 604 px across all six pages. That is the seven cells a 1280 px window leaves the app today.""",
    ),
    dict(
        key='d4-mark',
        title='decision 4 option C — a half day is drawn',
        standfirst='Decision 4. The day value becomes a mark so the id has the chip.',
        board='edge',
        css=SQUEEZE + MARK_CSS,
        under='',
        side=ASIDE,
        script=MARK_SCRIPT,
        footer="""<b>Decision 4 option C. The day value is drawn rather than written.</b> A chip filled to halfway is half a day and a solid chip is a whole one.
    The id then has the chip to itself so one line holds it. No shade is invented because the cut is between Warm Grey and the white of the cell.
    It costs a convention the reader has to learn. It also costs the figure itself. A key under the board pays part of that.
    16 of the 21 ids are cut here even so. Dropping three characters does not buy back the five the 12 px id is over.
    The board is held at 604 px across all six pages. That is the seven cells a 1280 px window leaves the app today.""",
    ),
    dict(
        key='d4-compact',
        title='decision 4 option D — a smaller chip',
        standfirst='Decision 4. Less type and less padding buy the line back.',
        board='edge',
        css=SQUEEZE + COMPACT_CSS,
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 4 option D. A smaller chip.</b> 11 px text with 6 px of padding needs 87 px where the chip today needs 101 px.
    11 px is what the cell already sets on a bank holiday label so nothing new arrives.
    The id alone then fits the chip exactly. 5 of the 21 are still cut because those chips hold the day value on the same line.
    It costs nothing but it does not finish the job on its own.
    The board is held at 604 px across all six pages. That is the seven cells a 1280 px window leaves the app today.""",
    ),
    dict(
        key='d4-scroll',
        title='decision 4 option E — the board scrolls',
        standfirst='Decision 4. A cell holds a minimum and the board scrolls under it.',
        board='edge',
        css=SQUEEZE + SCROLL_CSS,
        under='',
        side=ASIDE,
        script=SCROLL_SCRIPT,
        footer="""<b>Decision 4 option E. The board scrolls sideways.</b> A cell never goes under 104 px so the chip fits as it is drawn today.
    <code>MonthGrid.vue</code> already answers its own width this way so the two views would agree.
    It costs the whole month. Seeing the month at once is what the board is for and a scrolled board shows five days of the seven.
    The board is held at 604 px across all six pages. That is the seven cells a 1280 px window leaves the app today.""",
    ),
    dict(
        key='d4-tight',
        title='decision 4 option F — smaller then wrapped',
        standfirst='Decision 4. The smaller chip wraps rather than cuts.',
        board='edge',
        css=SQUEEZE + TIGHT_CSS,
        under='',
        side=ASIDE,
        script="renderBoard('#board', addControl)",
        footer="""<b>Decision 4 option F. D then B.</b> The smaller chip holds one line from 1440 px up and drops the day value to a second line below that.
    None of the 21 ids is cut here. It is the only one of the six that manages that without taking the month off the screen.
    In the app the id stays whole down to 800 px and the cut of option A is left as the guard under it.
    It costs 19 px of cell height on a day holding a seven digit id.
    The board is held at 604 px across all six pages. That is the seven cells a 1280 px window leaves the app today.""",
    ),
]


def build() -> None:
    for page in PAGES:
        html = PAGE
        for token, value in (
            ('{{TITLE}}', page['title']),
            ('{{STANDFIRST}}', page['standfirst']),
            ('{{BOARD}}', page['board']),
            ('{{CSS}}', page['css'].rstrip()),
            ('{{UNDER}}', page['under'].rstrip()),
            ('{{SIDE}}', page['side'].rstrip()),
            ('{{POP}}', POP_FIELDS),
            ('{{SCRIPT}}', page['script']),
            ('{{FOOTER}}', page['footer']),
        ):
            html = html.replace(token, value)
        assert '{{' not in html, page['key']
        (HERE / f'{page["key"]}.html').write_text(html, encoding='utf-8')
        print(f'wrote {page["key"]}.html')


if __name__ == '__main__':
    build()
