import { writeFileSync } from 'node:fs'
import { loadSamples } from '@tracker/fixtures/samples'

const out = process.argv[2]
const SUB = process.argv[3]

const samples = await loadSamples()
const complete = samples.find((s) => s.statusMessage === 'Your project tracker is completed!')
const halfDays = complete.rows.map((r) => ({
  date: r.date,
  half: (r.row - 5) % 2,
  workdayId: r.workdayId === null ? null : String(r.workdayId),
  specification: r.specification,
  days: r.days,
  location: r.location,
  tasks: r.tasks === null ? null : String(r.tasks),
}))
const period = `${complete.year}-${String(complete.month).padStart(2, '0')}`

const claims = {
  sub: SUB,
  email: 'bench@example.invalid',
  given_name: 'Bench',
  family_name: 'Run',
}

function event(method, rawPath, body) {
  return {
    version: '2.0',
    rawPath,
    isBase64Encoded: false,
    body: body === undefined ? null : JSON.stringify(body),
    requestContext: { http: { method }, authorizer: { jwt: { claims } } },
  }
}

writeFileSync(`${out}/catalogue.json`, JSON.stringify(event('GET', '/api/catalogue')))
writeFileSync(
  `${out}/profile.json`,
  JSON.stringify(event('PUT', '/api/me', { location: complete.location, entity: '02_GmbH' })),
)
writeFileSync(
  `${out}/sheet.json`,
  JSON.stringify(event('PUT', `/api/timesheets/${period}`, { halfDays, location: complete.location })),
)
writeFileSync(`${out}/export.json`, JSON.stringify(event('POST', `/api/timesheets/${period}/export`)))
writeFileSync(`${out}/me.json`, JSON.stringify(event('GET', '/api/me')))
writeFileSync(`${out}/jira404.json`, JSON.stringify(event('GET', '/api/jira/nope')))
writeFileSync(`${out}/period.txt`, period)
console.log('period', period, 'location', complete.location, 'halfDays', halfDays.length)
