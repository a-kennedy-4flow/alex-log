/*
 * One dataset for all three mockups. Because a) the variants differ only in
 * design and b) a shared dataset is the only way to compare them fairly.
 *
 * May 2026 in DE_BERLIN. Three bank holidays fall in it so the non-working
 * styling is visible. The user is on an 80 per cent contract.
 */

const TS = {
  year: 2026,
  month: 5,
  monthName: 'May',
  location: 'DE_BERLIN',
  user: { first: 'Alexander', last: 'Kennedy', entity: '4flow SE', line: 'Consulting' },
  contract: 80,
  workingDays: 18,
  target: 14.5,
  booked: 13.5,
  filename: '20260531_4flow_2026_05_projecttracker_DE_BERLIN.xlsm',
  recipient: 'software.projecttracker@4flow.com',

  holidays: {
    '2026-05-01': 'Labour Day',
    '2026-05-14': 'Ascension Day',
    '2026-05-25': 'Whit Monday',
  },

  centres: {
    4100782: { title: 'Network design', customer: 'Customer A', line: 'Consulting' },
    4100915: { title: 'Transport optimisation', customer: 'Customer B', line: 'Consulting' },
    3000112: { title: 'Product development', customer: 'Internal', line: 'Software' },
    2000045: { title: 'Pre-sales support', customer: 'Internal', line: 'Consulting' },
    1002341: { title: 'Vacation', customer: 'Absence', line: '—' },
  },

  /* Date to the two half day rows. A null is an empty row. */
  bookings: {
    '2026-05-04': [{ id: 4100782, spec: 'Consulting', days: 1, task: 'Scenario review' }, null],
    '2026-05-05': [{ id: 4100782, spec: 'Consulting', days: 1, task: 'Scenario review' }, null],
    '2026-05-06': [
      { id: 4100782, spec: 'Consulting', days: 0.5 },
      { id: 3000112, spec: 'Development', days: 0.5, task: 'Release 2.4' },
    ],
    '2026-05-07': [{ id: 4100782, spec: 'Consulting', days: 1 }, null],
    '2026-05-08': [{ id: 2000045, spec: 'Pre-sales', days: 1, task: 'Tender response' }, null],
    '2026-05-11': [{ id: 4100915, spec: 'Analysis', days: 1, task: 'Lane costing' }, null],
    '2026-05-12': [{ id: 4100915, spec: 'Analysis', days: 1, task: 'Lane costing' }, null],
    '2026-05-13': [
      { id: 4100915, spec: 'Analysis', days: 0.5 },
      { id: 4100782, spec: 'Project management', days: 0.5 },
    ],
    '2026-05-15': [{ id: 1002341, spec: 'Vacation', days: 1 }, null],
    '2026-05-18': [{ id: 4100782, spec: 'Consulting', days: 1 }, null],
    '2026-05-19': [{ id: 4100782, spec: 'Consulting', days: 1 }, null],
    '2026-05-20': [{ id: 3000112, spec: 'Development', days: 1, task: 'Release 2.4' }, null],
    '2026-05-21': [{ id: 4100915, spec: 'Analysis', days: 0.5 }, null],
    '2026-05-26': [{ id: 4100915, spec: 'Analysis', days: 1 }, null],
  },

  byCentre: [
    { id: 4100782, customer: 'Customer A', line: 'Consulting', days: 6 },
    { id: 4100915, customer: 'Customer B', line: 'Consulting', days: 4 },
    { id: 3000112, customer: 'Internal', line: 'Software', days: 1.5 },
    { id: 2000045, customer: 'Internal', line: 'Consulting', days: 1 },
  ],
  vacation: 1,
  otherAbsence: 0,

  byWeek: [
    { week: 18, working: 0, nonWorking: 0, total: 0 },
    { week: 19, working: 5, nonWorking: 0, total: 5 },
    { week: 20, working: 4, nonWorking: 0, total: 4 },
    { week: 21, working: 3.5, nonWorking: 0, total: 3.5 },
    { week: 22, working: 1, nonWorking: 0, total: 1 },
  ],

  checks: [
    { severity: 'warn', text: '1 working day is missing.', rows: 'Rows 49 50 51 52' },
    {
      severity: 'warn',
      text: '2 rows use a cost centre whose specification list is missing from the tracker. The full list is offered instead.',
      rows: 'Rows 15 43',
    },
  ],
}

/* ISO week number. The tracker groups the month by it. */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - start) / 86400000 + 1) / 7)
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* One flat list of half day rows for the whole month. */
function monthRows() {
  const out = []
  const last = new Date(TS.year, TS.month, 0).getDate()
  for (let day = 1; day <= last; day += 1) {
    const date = new Date(TS.year, TS.month - 1, day)
    const key = `${TS.year}-${String(TS.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const holiday = TS.holidays[key] ?? null
    const pair = TS.bookings[key] ?? [null, null]
    out.push({
      key,
      day,
      week: isoWeek(date),
      weekday: WEEKDAY[date.getDay()],
      short: `${String(day).padStart(2, '0')}.${String(TS.month).padStart(2, '0')}.`,
      nonWorking: weekend || holiday !== null,
      holiday,
      entries: pair,
      total: (pair[0]?.days ?? 0) + (pair[1]?.days ?? 0),
    })
  }
  return out
}

/*
 * Renders the grid body. Each mockup owns its own CSS so only the class names
 * and the cell order are shared.
 */
function renderGrid(target) {
  const rows = monthRows()
  let html = ''
  let lastWeek = null
  for (const day of rows) {
    if (day.week !== lastWeek) {
      html += `<tr class="week-break"><td colspan="8">CW ${day.week}</td></tr>`
      lastWeek = day.week
    }
    /* The lower half appears only once the day is split. */
    const shown = day.entries[1] ? 2 : 1
    for (let half = 0; half < shown; half += 1) {
      const entry = day.entries[half]
      const centre = entry ? TS.centres[entry.id] : null
      const classes = [
        day.nonWorking ? 'non-working' : '',
        half === 0 ? 'day-start' : '',
        entry ? 'filled' : 'empty',
        entry && centre.customer === 'Absence' ? 'absence' : '',
      ]
        .filter(Boolean)
        .join(' ')
      html += `<tr class="${classes}">`
      if (half === 0) {
        html += `<td class="c-date" rowspan="${shown}"><span class="num">${day.short}</span>${
          day.holiday
            ? `<span class="flag">${day.holiday}</span>`
            : day.nonWorking
              ? '<span class="flag">Non-working day</span>'
              : ''
        }</td>`
        html += `<td class="c-day" rowspan="${shown}">${day.weekday}</td>`
      }
      html += `<td class="c-cc">${
        entry
          ? `<span class="num">${entry.id}</span><span class="cc-title">${centre.title}</span>`
          : '<span class="ph">Pick a cost centre</span>'
      }</td>`
      html += `<td class="c-spec">${entry ? entry.spec : '<span class="ph">&mdash;</span>'}</td>`
      html += `<td class="c-days num">${entry ? entry.days : ''}</td>`
      html += `<td class="c-loc">${entry ? TS.location : ''}</td>`
      html += `<td class="c-tasks">${entry?.task ?? ''}</td>`
      html += `<td class="c-act">${
        entry ? '<button type="button" class="icon" title="Clear row">&times;</button>' : ''
      }</td>`
      html += '</tr>'
    }
  }
  document.querySelector(target).innerHTML = html
}

/*
 * Additions for the calendar and the allocation mockups. A and B and C do not
 * read any of this so they are untouched.
 */

/*
 * Chip styling per cost centre. The palette holds five usable fills so five
 * cost centres is the limit before the styling stops separating them.
 */
const CHIP = {
  4100782: 'chip-blue',
  4100915: 'chip-bright',
  3000112: 'chip-grey',
  2000045: 'chip-orange',
  1002341: 'chip-pink',
}

const MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* The month as calendar cells. Leading blanks keep the first day in its column. */
function calendarCells() {
  const rows = monthRows()
  const first = new Date(TS.year, TS.month - 1, 1).getDay()
  const blanks = (first + 6) % 7
  return [...Array(blanks).fill(null), ...rows]
}

function renderCalendar(target) {
  const cells = calendarCells()
  let html = MON_FIRST.map((d) => `<div class="head">${d}</div>`).join('')
  for (const day of cells) {
    if (!day) {
      html += '<div class="cell blank"></div>'
      continue
    }
    const chips = day.entries
      .filter(Boolean)
      .map(
        (e) =>
          `<span class="chip ${CHIP[e.id]}"><b class="num">${e.id}</b><i>${e.days}</i></span>`,
      )
      .join('')
    const free = !day.nonWorking && day.total < 1
    html += `<div class="cell${day.nonWorking ? ' off' : ''}${free ? ' free' : ''}">
      <div class="top"><span class="d num">${day.day}</span>${
        day.holiday ? `<span class="lab">${day.holiday}</span>` : ''
      }</div>
      <div class="chips">${chips}</div>
      ${free ? '<button type="button" class="add">+</button>' : ''}
    </div>`
  }
  document.querySelector(target).innerHTML = html
}

/* The split behind the month. Vacation is one of the rows because it books days. */
function allocation() {
  const rows = [
    ...TS.byCentre.map((r) => ({ ...r, title: TS.centres[r.id].title })),
    { id: 1002341, customer: 'Absence', line: '—', days: TS.vacation, title: 'Vacation' },
  ]
  const free = Math.round((TS.target - TS.booked) * 2) / 2
  return { rows, free }
}
