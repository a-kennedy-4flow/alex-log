// The monthly reminder against the in memory repository.
//
// September 2026 is used throughout. It holds twenty two working days for a
// location with no bank holiday in it so the third from the end is the 28th.
// Pilsen keeps St Wenceslas on that same date which moves its reminder to the
// 25th. That pair is what proves the day is resolved per location.

import { beforeEach, describe, expect, it } from 'vitest'
import { loadCatalogue } from '@tracker/fixtures'
import type { UserProfile } from '@tracker/core'

import { MemoryMailer, type Mailer, type Message } from '../mail'
import { FakeJira, PlainCipher } from '../jira-fake'
import type { TokenDeps } from '../jira-tokens'
import {
  localDate,
  reminderDate,
  runReminders,
  type Directory,
  type DirectoryUser,
  type ReminderDeps,
} from '../reminder'
import { MemoryRepository, type StoredJiraLink, type StoredSheet } from '../repository'

const catalogue = await loadCatalogue()

const BERLIN = 'Europe/Berlin'
const URL = 'https://tracker.4flow.io'

/** 07:00 in Berlin on the day the reminder is due for a location with no holiday. */
const DUE = new Date('2026-09-28T05:00:00.000Z')

const ALEX: DirectoryUser = {
  sub: 'user-1',
  email: 'alexander.kennedy@4flow.com',
  firstName: 'Alexander',
}

function profileOf(over: Partial<UserProfile> = {}): UserProfile {
  return {
    email: ALEX.email,
    firstName: 'Alexander',
    lastName: 'Kennedy',
    location: null,
    entity: null,
    businessLine: null,
    workPercent: null,
    locale: null,
    remindByEmail: true,
    hoursPerDay: null,
    jiraProjects: {},
    ...over,
  }
}

function sheetOf(over: Partial<StoredSheet> = {}): StoredSheet {
  return {
    year: 2026,
    month: 9,
    location: '01_DE_Berlin',
    halfDays: [],
    adjustedWorkDays: null,
    updatedAt: '2026-09-20T09:00:00.000Z',
    exportedAt: null,
    ...over,
  }
}

/** A link as it stands right after one exchange. Plain tokens in a test. */
function linkOf(over: Partial<StoredJiraLink> = {}): StoredJiraLink {
  return {
    accountId: '712020:0cecee67',
    linkedAt: '2026-09-28T05:00:00.000Z',
    refresh: 'plain:refresh-1',
    previousRefresh: null,
    access: 'plain:access-1',
    // Live for the whole run so nothing is refreshed.
    accessExpiresAt: '2026-09-28T06:00:00.000Z',
    generation: 1,
    cache: null,
    ...over,
  }
}

class FailingMailer implements Mailer {
  attempts = 0
  constructor(private readonly failures: number) {}
  async send(): Promise<void> {
    this.attempts++
    if (this.attempts <= this.failures) throw new Error('rejected')
  }
}

let repository: MemoryRepository
let mailer: MemoryMailer
let users: DirectoryUser[]

const directory: Directory = { list: async () => users }

/** The Jira side of the run. September is the month the reminder is about. */
function jiraDeps(jira = new FakeJira('2026-09')): TokenDeps {
  return { repository, jira, cipher: new PlainCipher(), now: () => DUE }
}

function deps(over: Partial<ReminderDeps> = {}): ReminderDeps {
  return {
    repository,
    mailer,
    directory,
    now: () => DUE,
    timeZone: BERLIN,
    url: URL,
    ...over,
  }
}

beforeEach(async () => {
  repository = new MemoryRepository()
  mailer = new MemoryMailer()
  users = [ALEX]
  const updatedAt = '2026-09-01T00:00:00.000Z'
  await repository.putCatalogue({ version: updatedAt, updatedAt, data: catalogue })
  // The run seeds the calendar itself. This makes the pure helpers usable too.
  await runReminders(deps({ now: () => new Date('2026-09-01T05:00:00.000Z') }))
})

describe('which day', () => {
  it('reads the calendar date at the schedule time zone', () => {
    // Half past midnight UTC is already the next day in Berlin.
    expect(localDate(new Date('2026-09-27T22:30:00.000Z'), BERLIN)).toBe('2026-09-28')
  })

  it('falls three working days before the month ends', () => {
    expect(reminderDate(2026, 9, null)).toBe('2026-09-28')
  })

  it('moves earlier where a bank holiday sits in the last week', () => {
    expect(reminderDate(2026, 9, '02_CZ_Pilsen')).toBe('2026-09-25')
  })
})

describe('who is sent to', () => {
  it('sends nothing on any other day', async () => {
    const summary = await runReminders(deps({ now: () => new Date('2026-09-27T05:00:00.000Z') }))
    expect(summary.sent).toBe(0)
    expect(mailer.sent).toHaveLength(0)
  })

  it('sends to a user who owes the month', async () => {
    const summary = await runReminders(deps())
    expect(summary).toEqual({ considered: 1, sent: 1, failed: 0 })
    expect(mailer.sent[0]?.to).toBe(ALEX.email)
  })

  it('names the month and the working days left', async () => {
    await runReminders(deps())
    const message = mailer.sent[0] as Message
    expect(message.subject).toBe('Your September tracker')
    expect(message.text).toContain('September ends in 3 working days.')
    expect(message.text).toContain(URL)
  })

  it('writes in the language the profile holds', async () => {
    await repository.putProfile(ALEX.sub, profileOf({ locale: 'de' }))
    await runReminders(deps())
    expect(mailer.sent[0]?.subject).toBe('Ihr Tracker für September')
  })

  it('uses the day of the location the user works at', async () => {
    await repository.putProfile(ALEX.sub, profileOf({ location: '02_CZ_Pilsen' }))
    expect((await runReminders(deps())).sent).toBe(0)

    const earlier = new Date('2026-09-25T05:00:00.000Z')
    expect((await runReminders(deps({ now: () => earlier }))).sent).toBe(1)
  })
})

describe('who is left alone', () => {
  it('skips a month whose workbook was downloaded', async () => {
    await repository.putSheet(ALEX.sub, '2026-09', sheetOf({ exportedAt: '2026-09-24T08:00:00Z' }))
    expect((await runReminders(deps())).sent).toBe(0)
  })

  it('reminds again once the sheet is edited after the download', async () => {
    await repository.putSheet(ALEX.sub, '2026-09', sheetOf({ exportedAt: null }))
    expect((await runReminders(deps())).sent).toBe(1)
  })

  it('reminds a profile saved before the switch existed', async () => {
    const legacy = profileOf()
    delete (legacy as Partial<UserProfile>).remindByEmail
    await repository.putProfile(ALEX.sub, legacy)
    expect((await runReminders(deps())).sent).toBe(1)
  })

  it('skips a user who turned the reminder off', async () => {
    await repository.putProfile(ALEX.sub, profileOf({ remindByEmail: false }))
    expect((await runReminders(deps())).sent).toBe(0)
  })

  it('sends once however often the run repeats', async () => {
    expect((await runReminders(deps())).sent).toBe(1)
    expect((await runReminders(deps())).sent).toBe(0)
    expect(mailer.sent).toHaveLength(1)
  })
})

describe('when the send fails', () => {
  it('lets a later run try the address that failed', async () => {
    users = [ALEX, { ...ALEX, sub: 'user-2', email: 'other@4flow.com' }]
    const failing = new FailingMailer(1)
    expect(await runReminders(deps({ mailer: failing }))).toEqual({
      considered: 2,
      sent: 1,
      failed: 1,
    })

    // The first claim was released and the second was kept. Only the address
    // that failed is tried again.
    expect((await runReminders(deps({ mailer: failing }))).sent).toBe(1)
  })

  it('throws when every send fails so the schedule retries', async () => {
    users = [ALEX, { ...ALEX, sub: 'user-2', email: 'other@4flow.com' }]
    await expect(runReminders(deps({ mailer: new FailingMailer(99) }))).rejects.toThrow(
      'all 2 reminders failed',
    )
  })

  it('keeps going when one address of many fails', async () => {
    users = [ALEX, { ...ALEX, sub: 'user-2', email: 'other@4flow.com' }]
    const summary = await runReminders(deps({ mailer: new FailingMailer(1) }))
    expect(summary).toEqual({ considered: 2, sent: 1, failed: 1 })
  })
})

describe('without a catalogue', () => {
  it('refuses to guess the working days', async () => {
    await expect(runReminders(deps({ repository: new MemoryRepository() }))).rejects.toThrow(
      'no catalogue',
    )
  })
})

describe('the Jira line', () => {
  it('is left out for a user who has not linked', async () => {
    await runReminders(deps({ jira: jiraDeps() }))
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]?.text).not.toContain('Jira')
  })

  it('names the count for a user who has', async () => {
    await repository.putJiraLink(ALEX.sub, linkOf())
    await runReminders(deps({ jira: jiraDeps() }))
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]?.text).toContain('7 Jira tickets')
    // The month is named so the screen opens on the one being reminded about.
    expect(mailer.sent[0]?.text).toContain('/jira?period=2026-09')
  })

  it('is left out where the month holds nothing', async () => {
    await repository.putJiraLink(ALEX.sub, linkOf())
    // The double answers for one month alone so any other returns nothing.
    await runReminders(deps({ jira: jiraDeps(new FakeJira('2026-01')) }))
    expect(mailer.sent[0]?.text).not.toContain('Jira')
  })

  it('sends the reminder even when Jira cannot be read', async () => {
    await repository.putJiraLink(ALEX.sub, linkOf())
    const broken = new FakeJira('2026-09')
    broken.completed = async () => {
      throw new Error('Atlassian is down')
    }
    await runReminders(deps({ jira: jiraDeps(broken) }))
    // The message is the point. The count is an extra.
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]?.text).not.toContain('Jira')
  })

  it('reads Jira only for a user who is being reminded today', async () => {
    await repository.putJiraLink(ALEX.sub, linkOf())
    const jira = new FakeJira('2026-09')
    // Nobody is due on the first of the month.
    await runReminders(
      deps({ jira: jiraDeps(jira), now: () => new Date('2026-09-01T05:00:00.000Z') }),
    )
    expect(jira.searches).toBe(0)
  })
})
