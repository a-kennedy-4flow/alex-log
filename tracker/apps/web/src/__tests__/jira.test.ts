// The Jira screen.
//
// The tickets are the real seven closed in August 2026. The hours are typed
// because Jira holds none on that site. See `docs/jira.md`.
//
// Nothing here reaches the network. `@/lib/api` is replaced so the page sees an
// answer of this file own making.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { CompletedTicket } from '@tracker/core'
import { setCatalogue } from '@tracker/core'
import { loadCatalogue } from '@tracker/fixtures'

const tickets: CompletedTicket[] = [
  {
    key: 'PLRS-1141',
    summary: 'Add TO/Load identification',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-26T14:34:46.607+0200',
    parentSummary: 'User group feedback',
    workdayId: '4100782',
    hours: 0,
    hoursSource: '',
  },
  {
    key: 'DEVH-4887',
    summary: 'Create WebProxy 4FL-APP-167v',
    projectKey: 'DEVH',
    resolvedAt: '2026-08-13T10:49:44.964+0200',
    parentSummary: null,
    workdayId: '4100915',
    hours: 0,
    hoursSource: '',
  },
]

const putSheet = vi.fn()
const linkJira = vi.fn()

/**
 * What `GET /api/jira/link` answers. Hoisted because `vi.mock` runs before the
 * module body and a test has to be able to steer it.
 */
const state = vi.hoisted(() => ({
  link: {
    linked: true,
    clientId: 'client-1',
    redirectUri: 'https://tracker.4flow.io/jira/callback',
    accountId: '712020:0cecee67',
    linkedAt: '2026-09-01T00:00:00.000Z',
  } as {
    linked: boolean
    clientId: string
    redirectUri: string
    accountId: string | null
    linkedAt: string | null
  } | null,
}))

/**
 * The stored months. The double keeps them because the fill writes a month then
 * has the editor read it back. A double that forgot would hide that.
 */
const stored = new Map<string, { location: string; halfDays: unknown[]; adjustedWorkDays: null }>()

vi.mock('@/lib/api', () => ({
  usingApi: true,
  ApiError: class extends Error {},
  api: {
    jiraLink: async () => {
      if (state.link === null) throw new Error('the API is down')
      return state.link
    },
    jiraMonth: async () => ({
      period: '2026-08',
      fetchedAt: '2026-09-07T12:00:00.000Z',
      cached: false,
      // Copied. A test that puts hours on a ticket must not change what the
      // next one reads.
      tickets: tickets.map((ticket) => ({ ...ticket })),
    }),
    putSheet: async (period: string, sheet: { location: string; halfDays: unknown[] }) => {
      putSheet(period, sheet)
      stored.set(period, { ...sheet, adjustedWorkDays: null })
      return sheet
    },
    getSheet: async (period: string) => {
      const sheet = stored.get(period)
      if (!sheet) throw new Error('no sheet')
      const [year, month] = period.split('-').map(Number)
      return { ...sheet, year, month, updatedAt: '2026-09-07T12:00:00.000Z' }
    },
    listSheets: async () => ({ sheets: [...stored.keys()].map((period) => ({ period, updatedAt: '' })) }),
    putProfile: async (profile: unknown) => profile,
    linkJira: async (code: string) => {
      linkJira(code)
      return { linked: true }
    },
    unlinkJira: async () => ({ linked: false }),
  },
  download: vi.fn(),
}))

const { i18n } = await import('@/i18n')
const JiraPage = (await import('@/pages/JiraPage.vue')).default
const { halfDays, profile } = await import('@/composables/useTimesheet')
const jira = await import('@/composables/useJira')
const consent = await import('@/lib/jira')

/** Read before any test moves it. `beforeEach` puts the mode back to hours. */
const defaultMode = jira.mode.value

setCatalogue(await loadCatalogue())

const plugins = [i18n]

/**
 * Puts hours on a ticket the way a worklog would.
 *
 * Decision 1 said not to type them so a test cannot either. This is what the
 * function returns when the site actually holds a worklog.
 */
function fromWorklog(key: string, hours: number): void {
  const ticket = jira.tickets.value.find((entry) => entry.key === key)
  if (!ticket) throw new Error(`no ticket ${key}`)
  ticket.hours = hours
  ticket.hoursSource = 'worklog'
}

beforeEach(() => {
  profile.location = '01_DE_Berlin'
  jira.period.value = '2026-08'
  jira.tickets.value = []
  for (const key of Object.keys(jira.chosenProjects)) delete jira.chosenProjects[key]
  for (const key of Object.keys(jira.shares)) delete jira.shares[key]
  jira.mode.value = 'hours'
  profile.workPercent = null
  profile.hoursPerDay = null
  stored.clear()
  putSheet.mockClear()
  linkJira.mockClear()
  sessionStorage.clear()
  consent.consentError.value = null
  jira.link.value = null
  jira.linkError.value = null
  state.link = {
    linked: true,
    clientId: 'client-1',
    redirectUri: 'https://tracker.4flow.io/jira/callback',
    accountId: '712020:0cecee67',
    linkedAt: '2026-09-01T00:00:00.000Z',
  }
})

describe('the last period', () => {
  it('is the month before the one the clock is in', () => {
    expect(jira.lastPeriod(new Date('2026-09-07T00:00:00Z'))).toBe('2026-08')
  })

  it('crosses a year end', () => {
    expect(jira.lastPeriod(new Date('2026-01-04T00:00:00Z'))).toBe('2025-12')
  })
})

describe('the consent callback', () => {
  /** What `startLink` left behind before Atlassian took the tab. */
  function asked(state: string, back = '/jira'): void {
    sessionStorage.setItem('tracker.jira.state', state)
    sessionStorage.setItem('tracker.jira.return', back)
  }

  it('passes over an address that is not the callback', async () => {
    expect(await consent.finishLink('/jira')).toBeNull()
    expect(linkJira).not.toHaveBeenCalled()
  })

  it('reads the callback out of the address it is handed', async () => {
    // Sign in carried the consent through its own redirect so the address bar
    // holds that path while the Jira one waits to be applied.
    asked('state-1')
    expect(location.pathname).not.toBe(consent.JIRA_CALLBACK_PATH)
    const back = await consent.finishLink('/jira/callback?code=code-1&state=state-1')
    expect(linkJira).toHaveBeenCalledWith('code-1')
    expect(back).toBe('/jira')
  })

  it('sends the user back where the consent started', async () => {
    asked('state-1', '/jira?period=2026-08')
    expect(await consent.finishLink('/jira/callback?code=code-1&state=state-1')).toBe(
      '/jira?period=2026-08',
    )
  })

  it('refuses a response the tab did not ask for', async () => {
    asked('state-1')
    await expect(
      consent.finishLink('/jira/callback?code=code-1&state=state-2'),
    ).rejects.toThrow('does not match this tab')
    expect(linkJira).not.toHaveBeenCalled()
  })

  it('refuses a callback carrying no code at all', async () => {
    await expect(consent.finishLink('/jira/callback')).rejects.toThrow()
    expect(linkJira).not.toHaveBeenCalled()
  })

  it('carries the words Atlassian refused with', async () => {
    await expect(
      consent.finishLink('/jira/callback?error=access_denied&error_description=the+user+said+no'),
    ).rejects.toThrow('the user said no')
  })

  it('shows a failed consent on the screen that offers the button', async () => {
    state.link = { linked: false, clientId: 'client-1', redirectUri: 'r', accountId: null, linkedAt: null }
    consent.consentError.value = 'the Jira response does not match this tab'
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.text()).toContain('Jira did not finish connecting')
    expect(wrapper.text()).toContain('does not match this tab')
  })
})

describe('the screen', () => {
  it('lists the tickets and both summaries', async () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.text()).toContain('PLRS-1141')
    expect(wrapper.text()).toContain('DEVH-4887')
    // The list then the group then the days. Three tables down one sheet.
    expect(wrapper.findAll('table')).toHaveLength(3)
    expect(wrapper.findAll('.sheet')).toHaveLength(1)
    expect(wrapper.findAll('.card')).toHaveLength(0)
  })

  it('shows the epic as context and never as the task text', async () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.get('.epic').text()).toBe('User group feedback')
  })

  it('reports no hours where the site holds no worklog', async () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(jira.totals.value.hours).toBe(0)
    expect(jira.totals.value.roundedDays).toBe(0)
    expect(wrapper.text()).toContain('Closed last month')
    // Decision 1 said not to type them so the column carries no control.
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
  })

  it('opens on the share rather than on the hours', () => {
    // Decision 1 again. A screen that cannot be typed into must divide the
    // month some other way.
    expect(defaultMode).toBe('percent')
  })

  it('moves every figure when a worklog carries an hour', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 48)
    fromWorklog('DEVH-4887', 2)
    await flushPromises()
    expect(jira.totals.value.hours).toBe(50)
    expect(jira.totals.value.trueDays).toBe(6.25)
    expect(jira.totals.value.roundedDays).toBe(6.5)
    expect(jira.groups.value).toHaveLength(2)
  })
})

describe('the fill', () => {
  it('writes the month and books what the rounding asked for', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 48)
    fromWorklog('DEVH-4887', 2)
    await flushPromises()

    expect(await jira.fillMonth()).toBe(true)
    await flushPromises()
    const booked = halfDays.value.filter((entry) => entry.workdayId !== null)
    const days = booked.reduce((sum, entry) => sum + (entry.days ?? 0), 0)
    expect(days).toBe(6.5)
    expect(putSheet).toHaveBeenCalled()
    expect(putSheet.mock.calls[0]?.[0]).toBe('2026-08')
  })

  it('puts the ticket key and summary in the tasks column', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('DEVH-4887', 8)
    await flushPromises()
    await jira.fillMonth()
    await flushPromises()
    const booked = halfDays.value.filter((entry) => entry.workdayId === '4100915')
    expect(booked.length).toBeGreaterThan(0)
    expect(booked[0]?.tasks).toContain('DEVH-4887')
    expect(booked[0]?.tasks).toContain('Create WebProxy')
  })

  it('skips every non-working day', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 40)
    await flushPromises()
    await jira.fillMonth()
    await flushPromises()
    const booked = halfDays.value.filter((entry) => entry.workdayId !== null)
    // August 2026 begins on a Saturday so the first two days are non-working.
    expect(booked.some((entry) => entry.date === '2026-08-01')).toBe(false)
    expect(booked.some((entry) => entry.date === '2026-08-02')).toBe(false)
  })

  it('counts the half days it would replace', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 16)
    await flushPromises()
    await jira.fillMonth()
    await flushPromises()
    // Decision 2 took overwrite so the count is what the button says first.
    expect(jira.wouldReplace.value).toBeGreaterThan(0)
  })

  it('refuses a month that cannot hold the rounded total', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    // Far more than the twenty one working days August 2026 holds.
    fromWorklog('PLRS-1141', 400)
    await flushPromises()
    expect(jira.fits.value).toBe(false)
    expect(await jira.fillMonth()).toBe(false)
  })
})

describe('the percentage fallback', () => {
  it('starts from the split the hours already imply', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 48)
    fromWorklog('DEVH-4887', 2)
    await flushPromises()
    expect(jira.shareOf('4100782')).toBe(96)
    expect(jira.shareOf('4100915')).toBe(4)
  })

  it('divides the month evenly when no hours were typed', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    jira.chosenProjects.PLRS = '4100782'
    jira.chosenProjects.DEVH = '4100915'
    await flushPromises()
    expect(jira.totals.value.hours).toBe(0)
    expect(jira.shareOf('4100782')).toBe(50)
  })

  it('books the whole target rather than the rounded hours', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 8)
    await flushPromises()
    expect(jira.daysToBook.value).toBe(1)

    jira.mode.value = 'percent'
    await flushPromises()
    // Twenty one working days and no part time factor on this profile.
    expect(jira.daysToBook.value).toBe(21)

    expect(await jira.fillMonth()).toBe(true)
    await flushPromises()
    const days = halfDays.value.reduce((sum, entry) => sum + (entry.days ?? 0), 0)
    expect(days).toBe(21)
    jira.mode.value = 'hours'
  })

  it('reports a share that does not add to a hundred', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 8)
    fromWorklog('DEVH-4887', 8)
    await flushPromises()
    jira.shares['4100782'] = 30
    jira.shares['4100915'] = 30
    expect(jira.shareTotal.value).toBe(60)
  })
})

describe('connecting', () => {
  it('shows no layout at all until the state answers', () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    // Before the read answers there is a waiting line and no wrong layout.
    expect(wrapper.findAll('table')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Connect Jira')
  })

  it('offers a retry when the state could not be read', async () => {
    state.link = null
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.text()).toContain('the API is down')
    expect(wrapper.text()).toContain('Try again')
    // Never the linked layout. That is what hid the connect button.
    expect(wrapper.findAll('table')).toHaveLength(0)
  })

  it('offers the button to a user who has not linked', async () => {
    state.link = {
      linked: false,
      clientId: 'client-1',
      redirectUri: 'https://tracker.4flow.io/jira/callback',
      accountId: null,
      linkedAt: null,
    }
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.text()).toContain('Connect Jira')
    expect(wrapper.get('button.btn-primary').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('table')).toHaveLength(0)
  })

  it('says so rather than offering a dead button with no app registered', async () => {
    state.link = { linked: false, clientId: '', redirectUri: '', accountId: null, linkedAt: null }
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.get('button.btn-primary').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('No Jira app is configured')
  })

  it('gives a linked user a way out', async () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.text()).toContain('Disconnect Jira')
  })
})
