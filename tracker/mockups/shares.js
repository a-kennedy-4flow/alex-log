/*
 * The quick fill state and the renderer every share option draws through.
 *
 * `data.js` holds the month. This holds the four cost centres the month is
 * split between and the arithmetic the app does on them. Because a) an option
 * that computed its own days would be comparing two things at once. b) the
 * days column is what tells the user whether a share was worth typing. c) the
 * rounding is the part each option has to survive and it is written once here.
 */

/* The mix. Four cost centres of the five `data.js` names. The absence one is
   not a share because the guided build places absence on its date. */
const MIX = [
  { id: 4100782, spec: 'Consulting', share: 40, tasks: 'Scenario review' },
  { id: 4100915, spec: 'Analysis', share: 30, tasks: 'Lane costing' },
  { id: 3000112, spec: 'Development', share: 20, tasks: 'Release 2.4' },
  { id: 2000045, spec: 'Pre-sales', share: 10, tasks: 'Tender response' },
]

const TARGET = TS.target

function total() {
  return MIX.reduce((sum, row) => sum + row.share, 0)
}

/**
 * The days each share works out to.
 *
 * A day is booked in halves so the target is divided into halves and handed out
 * by the largest remainder. The floors are dealt first and what is left goes to
 * the rows the division cut hardest. A plain round leaves the month half a day
 * over or under and the user is then asked to fix arithmetic they did not do.
 */
function daysPerRow() {
  const halves = TARGET * 2
  const exact = MIX.map((row) => (row.share / 100) * halves)
  const out = exact.map(Math.floor)
  let left = halves - out.reduce((sum, n) => sum + n, 0)
  const order = exact
    .map((value, at) => ({ at, part: value - Math.floor(value) }))
    .sort((a, b) => b.part - a.part)
  for (const item of order) {
    if (left <= 0) break
    out[item.at] += 1
    left -= 1
  }
  return out.map((n) => n / 2)
}

/** Divides a hundred between the rows. The remainder goes to the first. */
function spreadEvenly() {
  const each = Math.floor(100 / MIX.length)
  MIX.forEach((row, at) => (row.share = at === 0 ? 100 - each * (MIX.length - 1) : each))
}

/**
 * Draws the table. `cell` is the one thing an option changes. It is handed the
 * row and its index and returns the markup of the share column.
 *
 * `fourth` is what the column beside it holds. It is the days by default. An
 * option that asks for days in the share column names the per cent here
 * instead, because the same figure written twice is a column wasted.
 */
function renderRows(cell, fourth) {
  const days = daysPerRow()
  const right = fourth ?? ((row, at) => days[at].toFixed(1))
  document.querySelector('#rows').innerHTML = MIX.map((row, at) => {
    const centre = TS.centres[row.id]
    return `<tr>
      <td class="cc"><b class="num">${row.id}</b><span>${centre.title}</span></td>
      <td><select><option>${row.spec}</option></select></td>
      <td class="share">${cell(row, at)}</td>
      <td class="fig num">${right(row, at)}</td>
      <td><input type="text" value="${row.tasks}"></td>
      <td><button type="button" class="drop" title="Remove">&times;</button></td>
    </tr>`
  }).join('')
}

/** The two figures under the table. Every option reports the same pair. */
function renderTotals() {
  const sum = total()
  const box = document.querySelector('#total')
  box.textContent = `${Math.round(sum)} %`
  box.classList.toggle('off', Math.round(sum) !== 100)
  const days = daysPerRow().reduce((a, b) => a + b, 0)
  document.querySelector('#booked').textContent = days.toFixed(1)
  const warn = document.querySelector('#warn')
  if (warn) warn.hidden = Math.round(sum) === 100
}
