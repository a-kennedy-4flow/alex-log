/*
 * The board renderer shared by the decision mockups.
 *
 * A chip carries the class `cc-<workday id>` and nothing more. The page picks
 * how that class looks. Because a) the three chip options then differ in CSS
 * alone. b) one renderer cannot disagree with itself about a total.
 */

/** Weekday heads in the order the board draws them. */
const HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Draws the month.
 *
 * `cell` runs for every day so a page can add its own control to a cell. It
 * returns extra html or an empty string.
 */
function renderBoard(target, cell = () => '') {
  const cells = calendarCells()
  let html = HEADS.map((d) => `<div class="head">${d}</div>`).join('')
  for (const day of cells) {
    if (!day) {
      html += '<div class="cell blank"></div>'
      continue
    }
    const chips = day.entries
      .filter(Boolean)
      .map((e) => `<span class="chip cc-${e.id}"><b class="num">${e.id}</b><i>${e.days}</i></span>`)
      .join('')
    const free = !day.nonWorking && day.total < 1
    html += `<div class="cell${day.nonWorking ? ' off' : ''}${free ? ' free' : ''}" data-date="${day.key}" data-day="${day.day}">
      <div class="top"><span class="d num">${day.day}</span>${
        day.holiday ? `<span class="lab">${day.holiday}</span>` : ''
      }</div>
      <div class="chips">${chips}</div>
      ${cell(day, free)}
    </div>`
  }
  document.querySelector(target).innerHTML = html
}

/** The dashed control a free working day carries. */
function addControl(day, free) {
  return free ? '<button type="button" class="add">+</button>' : ''
}

/** Fills whichever aside sections the page actually has. */
function fillAside() {
  const put = (sel, html) => {
    const node = document.querySelector(sel)
    if (node) node.innerHTML = html
  }
  const most = Math.max(...TS.byWeek.map((w) => w.total))
  put(
    '#weeks',
    TS.byWeek
      .map(
        (w) =>
          `<li class="${w.total ? '' : 'none'}"><span class="lab">CW ${w.week}</span><span class="bar"><i style="width:${most ? (w.total / most) * 100 : 0}%"></i></span><span class="d">${w.total || '—'}</span></li>`,
      )
      .join(''),
  )
  put(
    '#checks',
    TS.checks
      .map((c) => `<li><span class="badge">?</span><span>${c.text}<span class="rows">${c.rows}</span></span></li>`)
      .join(''),
  )
  put(
    '#recent',
    Object.entries(TS.centres)
      .map(([id, c]) => `<button type="button" class="tag" title="${c.title}">${id}</button>`)
      .join(''),
  )
  put(
    '#legend',
    Object.entries(TS.centres)
      .map(([id, c]) => `<span class="chip cc-${id}" title="${c.title}"><b class="num">${id}</b></span>`)
      .join(''),
  )
}
