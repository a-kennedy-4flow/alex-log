// The Jira screen.
//
// The tickets are two of the real seven closed in August 2026. The hours are
// typed because Jira holds none on that site. See `docs/jira.md`.
//
// One of the two carries a cost centre inherited from its epic and the other
// carries none. That is the pair the Jira client can produce so it is the pair
// the screen is tested against.
//
// Neither cost centre is in the shipped catalogue so both tickets fall back to
// the project map exactly as they did before the conversion existed. The
// conversion itself is tested against real numbers in `the Workday ID a ticket
// books against` below.
//
// Nothing here reaches the network. `@/lib/api` is replaced so the page sees an
// answer of this file own making.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { CompletedTicket } from '@tracker/core'
import { DEV_JIRA_CLIENT_ID, DEV_JIRA_CODE, setCatalogue } from '@tracker/core'
import { loadCatalogue } from '@tracker/fixtures'

const tickets: CompletedTicket[] = [
  {
    key: 'PLRS-1141',
    summary: 'Add TO/Load identification',
    projectKey: 'PLRS',
    resolvedAt: '2026-08-26T14:34:46.607+0200',
    parentKey: 'PLRS-900',
    parentSummary: 'User group feedback',
    costCentre: '4100782',
    costCentreFrom: 'PLRS-900',
    costCentreSpecification: null,
    costCentreSpecificationFrom: null,
    specification: null,
    days: {},
    workdayId: '4100782',
    hours: 0,
    hoursSource: '',
  },
  {
    key: 'DEVH-4887',
    summary: 'Create WebProxy 4FL-APP-167v',
    projectKey: 'DEVH',
    resolvedAt: '2026-08-13T10:49:44.964+0200',
    parentKey: null,
    parentSummary: null,
    costCentre: null,
    costCentreFrom: null,
    costCentreSpecification: null,
    costCentreSpecificationFrom: null,
    specification: null,
    days: {},
    workdayId: '4100915',
    hours: 0,
    hoursSource: '',
  },
]

const putSheet = vi.fn()
const linkJira = vi.fn()
/** Counted so a switch of Jira account can be shown to read the month again. */
const jiraMonth = vi.fn()

/**
 * What `GET /api/jira/link` answers. Hoisted because `vi.mock` runs before the
 * module body and a test has to be able to steer it.
 */
const state = vi.hoisted(() => ({
  link: {
    linked: true,
    clientId: 'client-1',
    redirectUri: 'https://tracker.4flow.io/jira/callback',
    siteUrl: 'https://4flow.atlassian.net',
    accountId: '712020:0cecee67',
    linkedAt: '2026-09-01T00:00:00.000Z',
  } as {
    linked: boolean
    clientId: string
    redirectUri: string
    siteUrl: string
    accountId: string | null
    linkedAt: string | null
  } | null,
}))

/**
 * The stored months. The double keeps them because the fill writes a month then
 * has the editor read it back. A double that forgot would hide that.
 */
const stored = new Map<string, { location: string; halfDays: unknown[]; adjustedWorkDays: null }>()

/**
 * Where the fill sent the user.
 *
 * The router is replaced rather than provided. Because a) this page is mounted
 * on its own so there is no route to navigate away from. b) importing the real
 * one pulls in every screen the tree names. c) the address is the whole
 * assertion.
 */
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@/router', () => ({ router: { navigate } }))

vi.mock('@/lib/api', () => ({
  usingApi: true,
  ApiError: class extends Error {},
  api: {
    jiraLink: async () => {
      if (state.link === null) throw new Error('the API is down')
      return state.link
    },
    jiraMonth: async () => {
      jiraMonth()
      return {
        period: '2026-08',
        fetchedAt: '2026-09-07T12:00:00.000Z',
        cached: false,
        // Copied. A test that puts hours on a ticket must not change what the
        // next one reads.
        tickets: tickets.map((ticket) => ({ ...ticket })),
      }
    },
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
// The English catalogue is read rather than quoted so a rewrite of the wording
// fails nothing here.
const { default: en } = await import('@/i18n/messages/en')
const JiraPage = (await import('@/pages/JiraPage.vue')).default
const CostCentrePicker = (await import('@/components/CostCentrePicker.vue')).default
const { halfDays, period: openPeriod, profile } = await import('@/composables/useTimesheet')
const jira = await import('@/composables/useJira')
const consent = await import('@/lib/jira')
const dev = await import('@/composables/useDevUser')

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
  // What the two fixtures carry on `workdayId`. The API fills that field from
  // this map so the screen and the answer it received agree.
  profile.jiraProjects = { PLRS: '4100782', DEVH: '4100915' }
  profile.jiraTickets = {}
  for (const key of Object.keys(jira.shares)) delete jira.shares[key]
  jira.mode.value = 'hours'
  profile.workPercent = null
  profile.hoursPerDay = null
  stored.clear()
  navigate.mockClear()
  putSheet.mockClear()
  linkJira.mockClear()
  jiraMonth.mockClear()
  dev.jiraAsUser.value = ''
  sessionStorage.clear()
  consent.consentError.value = null
  jira.link.value = null
  jira.linkError.value = null
  state.link = {
    linked: true,
    clientId: 'client-1',
    redirectUri: 'https://tracker.4flow.io/jira/callback',
    siteUrl: 'https://4flow.atlassian.net',
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

describe('where the consent button sends the browser', () => {
  it('asks Atlassian for every scope the app is granted', () => {
    const url = new URL(
      consent.consentUrl('wJiihW00HOrSowAzpyBcDjWOj7vUMAXz', 'https://tracker.4flow.io/jira/callback', 'state-1'),
    )
    expect(`${url.origin}${url.pathname}`).toBe('https://auth.atlassian.com/authorize')
    const scope = url.searchParams.get('scope') ?? ''
    expect(scope).toContain('read:issue-details:jira')
    expect(scope).toContain('read:issue-worklog:jira')
    // Without this one the consent buys an hour and no refresh token.
    expect(scope).toContain('offline_access')
    // A write scope must never appear.
    expect(scope).not.toContain('write:')
  })

  it('skips Atlassian for the local double', () => {
    // The local API owns no Atlassian app so a real consent screen refuses its
    // client id. Nothing about the Jira page can be worked on if the press
    // leaves the tab.
    expect(consent.consentUrl(DEV_JIRA_CLIENT_ID, 'http://localhost:5173/jira/callback', 'state-1')).toBe(
      `${consent.JIRA_CALLBACK_PATH}?code=${DEV_JIRA_CODE}&state=state-1`,
    )
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
    state.link = {
      linked: false,
      clientId: 'client-1',
      redirectUri: 'r',
      siteUrl: '',
      accountId: null,
      linkedAt: null,
    }
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

  it('opens each ticket id in Jira', async () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    const keys = wrapper.findAll('a.key')
    expect(keys.map((key) => key.attributes('href'))).toEqual([
      'https://4flow.atlassian.net/browse/PLRS-1141',
      'https://4flow.atlassian.net/browse/DEVH-4887',
    ])
    expect(wrapper.get('a.key').attributes('target')).toBe('_blank')
  })

  it('leaves the id as text where the deployment names no site', async () => {
    state.link = { ...state.link!, siteUrl: '' }
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    expect(wrapper.findAll('a.key')).toHaveLength(0)
    expect(wrapper.text()).toContain('PLRS-1141')
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

describe('the Workday ID a ticket books against', () => {
  /** One ticket carrying only what the resolution reads. */
  function ticketOf(over: Partial<CompletedTicket>): CompletedTicket {
    return { ...(tickets[0] as CompletedTicket), ...over }
  }

  it('converts the Jira cost centre through the catalogue', () => {
    const ticket = ticketOf({ costCentre: '99980200', workdayId: '4100782' })
    expect(jira.workdayIdOf(ticket)).toBe('10200')
  })

  it('falls back to the project map where Jira carries no cost centre', () => {
    expect(jira.workdayIdOf(ticketOf({ costCentre: null, workdayId: '4100782' }))).toBe('4100782')
  })

  it('falls back to the project map where the catalogue never heard the number', () => {
    const ticket = ticketOf({ costCentre: '12345678', workdayId: '4100782' })
    expect(jira.workdayIdOf(ticket)).toBe('4100782')
  })

  it('lets a cost centre set on the ticket beat both', () => {
    profile.jiraTickets = { 'PLRS-1141': '10300' }
    const ticket = ticketOf({ costCentre: '99980200', workdayId: '4100782' })
    expect(jira.workdayIdOf(ticket)).toBe('10300')
  })

  // The project map is the answer of last resort whether it was written a month
  // ago or a moment ago. A pick that outranked Jira until the next reload was
  // the same pick answering two different ways.
  it('leaves the project map under the Jira cost centre', () => {
    profile.jiraProjects = { PLRS: '10300' }
    const ticket = ticketOf({ costCentre: '99980200', workdayId: '10300' })
    expect(jira.workdayIdOf(ticket)).toBe('10200')
  })

  it('books nothing where neither Jira nor the map answered', () => {
    profile.jiraProjects = {}
    expect(jira.workdayIdOf(ticketOf({ costCentre: null, workdayId: null }))).toBeNull()
  })

  it('counts a ticket Jira mapped as mapped rather than offering a picker', async () => {
    const page = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    jira.tickets.value = [ticketOf({ costCentre: '99980200', workdayId: null })]
    await flushPromises()
    expect(jira.totals.value.unmapped).toEqual([])
    expect(page.text()).toContain('10200')
  })
})

describe('the hours column', () => {
  function hoursOf(hours: number): string {
    return jira.hoursTextOf({ ...(tickets[0] as CompletedTicket), hours, hoursSource: 'worklog' })
  }

  it('rounds a worklog to two places', () => {
    // A worklog is seconds. One hour and fifty five minutes is
    // 1.9166666666666667 hours and the column has to read as a figure.
    expect(hoursOf(6900 / 3600)).toBe('1.92')
  })

  it('leaves a whole figure whole', () => {
    expect(hoursOf(7)).toBe('7')
  })

  it('drops a trailing zero rather than padding to two places', () => {
    expect(hoursOf(7.5)).toBe('7.5')
    expect(hoursOf(7.1)).toBe('7.1')
  })

  it('reads empty where Jira reported nothing', () => {
    // Every row of the 4flow site reads this way. That site holds no worklog.
    expect(hoursOf(0)).toBe('')
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

  it('opens the month it filled', async () => {
    // The fill writes rows the person has to read before they submit anything
    // and this screen shows them none of it. So the button lands them on the
    // screen that does.
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 48)
    await flushPromises()

    await wrapper.get('button.btn-primary').trigger('click')
    await flushPromises()
    expect(navigate).toHaveBeenCalledWith({ to: '/' })
    // The month the editor opens on is the one that was written rather than
    // whatever it held before. `fillMonth` moves it and the route does not.
    expect(openPeriod.value).toBe('2026-08')
  })

  it('leaves the user where they are when nothing was written', async () => {
    const wrapper = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 400)
    await flushPromises()

    const button = wrapper.get('button.btn-primary')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    await flushPromises()
    expect(navigate).not.toHaveBeenCalled()
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
  /**
   * The group one cost centre books under.
   *
   * A share is keyed by the group rather than by the Workday ID because one
   * cost centre holds a group per specification.
   */
  function keyOf(workdayId: string): string {
    return jira.groups.value.find((group) => group.workdayId === workdayId)?.key ?? workdayId
  }

  it('starts from the split the hours already imply', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    fromWorklog('PLRS-1141', 48)
    fromWorklog('DEVH-4887', 2)
    await flushPromises()
    expect(jira.shareOf(keyOf('4100782'))).toBe(96)
    expect(jira.shareOf(keyOf('4100915'))).toBe(4)
  })

  it('divides the month evenly when no hours were typed', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    await flushPromises()
    expect(jira.totals.value.hours).toBe(0)
    expect(jira.shareOf(keyOf('4100782'))).toBe(50)
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
    jira.shares[keyOf('4100782')] = 30
    jira.shares[keyOf('4100915')] = 30
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
      siteUrl: 'https://4flow.atlassian.net',
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
    state.link = {
      linked: false,
      clientId: '',
      redirectUri: '',
      siteUrl: '',
      accountId: null,
      linkedAt: null,
    }
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

// Where the cost centre of a row came from.
//
// A 4flow ticket rarely carries one and the epic above it carries one for
// everything beneath. So a figure on a row was read from that row or from a
// ticket the user is not looking at. The screen says which in smaller writing
// under the figure it explains.
// The specification beside the cost centre. `99988019` converts to `18019`
// which is `4s_General` and names a list of its own. The cost centres the
// other rows use name none so nothing there could be shown.
// The turning ring. Reading a month is two searches against Atlassian and a
// walk of the parent chains so the wait is long enough to look like a dead
// page. The turning is what says data is still moving.
describe('while Jira is being read', () => {
  async function mounted() {
    const page = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    return page
  }

  it('turns a ring beside the line saying the month is being read', async () => {
    const page = await mounted()
    jira.loading.value = true
    await flushPromises()
    const waiting = page.get('.waiting')
    expect(waiting.text()).toBe(en.jira.loading)
    expect(waiting.find('.busy').exists()).toBe(true)
    jira.loading.value = false
  })

  it('takes the ring away once the tickets land', async () => {
    const page = await mounted()
    expect(page.find('.busy').exists()).toBe(false)
    expect(page.findAll('tbody tr').length).toBeGreaterThan(0)
  })

  it('says the wait is a status so a reader who cannot see the ring is told', async () => {
    const page = await mounted()
    jira.loading.value = true
    await flushPromises()
    expect(page.get('.waiting').attributes('role')).toBe('status')
    // The ring carries no text of its own so it is hidden from the reader.
    expect(page.get('.busy').attributes('aria-hidden')).toBe('true')
    jira.loading.value = false
  })

  it('turns one before the link state is known', async () => {
    // Nothing on the page can be drawn until `GET /api/jira/link` answers.
    const page = mount(JiraPage, { global: { plugins } })
    expect(page.get('.waiting').text()).toBe(en.jira.loading)
    await flushPromises()
  })

  it('turns one on the fill button while the month is written', async () => {
    const page = await mounted()
    fromWorklog('PLRS-1141', 8)
    jira.filling.value = true
    await flushPromises()
    const button = page.get('button.btn-primary')
    expect(button.text()).toBe(en.jira.filling)
    expect(button.find('.busy').exists()).toBe(true)
    jira.filling.value = false
  })
})

describe('the specification of a row', () => {
  const SOFTWARE = { costCentre: '99988019', costCentreFrom: 'PLRS-900' }

  function ticketOf(over: Partial<CompletedTicket>): CompletedTicket {
    return { ...(tickets[0] as CompletedTicket), ...over }
  }

  /** The specification cell of the one row the table holds. */
  async function cellOf(over: Partial<CompletedTicket>) {
    const page = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    jira.tickets.value = [ticketOf({ ...SOFTWARE, ...over })]
    await flushPromises()
    return page.get('tbody tr').findAll('td.cc')[1]!
  }

  it('names the ticket a specification was read off', async () => {
    const cell = await cellOf({
      costCentreSpecification: '4s_Overheads_Product_operations',
      costCentreSpecificationFrom: 'COMM-23080',
    })
    expect(cell.get('.pill').text()).toBe('4s_Overheads_Product operations')
    expect(cell.get('.from').text()).toBe('Specification from COMM-23080')
  })

  it('says so where the ticket carried its own', async () => {
    const cell = await cellOf({
      costCentreSpecification: '4s_Overheads_Absence',
      costCentreSpecificationFrom: 'PLRS-1141',
    })
    expect(cell.get('.from').text()).toBe('Specification on this ticket')
  })

  it('takes the first of the list where Jira carried none', async () => {
    const cell = await cellOf({})
    expect(cell.get('.pill').text()).toBe('4s_Overheads_Concept & development')
    expect(cell.get('.from').text()).toBe('Default specification of this cost centre')
  })

  it('reports a label this cost centre does not allow', async () => {
    const cell = await cellOf({
      costCentreSpecification: '9963711',
      costCentreSpecificationFrom: 'CUS-2479',
    })
    expect(cell.get('.from.odd').text()).toBe(
      'Jira says 9963711 on CUS-2479 which this cost centre does not allow',
    )
    // The row still books rather than being left short.
    expect(cell.get('.pill').text()).toBe('4s_Overheads_Concept & development')
  })

  it('offers none where the cost centre names no list', async () => {
    // `99980200` converts to `10200`. Its range is `#REF!` in the workbook so
    // nothing applies by right and a blank stands.
    const cell = await cellOf({ costCentre: '99980200', costCentreFrom: 'PLRS-900' })
    expect(cell.findAll('.pill')).toHaveLength(0)
    expect(cell.get('.from').text()).toBe('This cost centre names no specification list')
  })

  it('books one cost centre as a row per specification', async () => {
    mount(JiraPage, { global: { plugins } })
    await flushPromises()
    jira.tickets.value = [
      ticketOf({
        ...SOFTWARE,
        key: 'PLRS-1',
        costCentreSpecification: '4s_Overheads_Absence',
        costCentreSpecificationFrom: 'COMM-23090',
      }),
      ticketOf({
        ...SOFTWARE,
        key: 'PLRS-2',
        costCentreSpecification: '4s_Overheads_Other',
        costCentreSpecificationFrom: 'COMM-23089',
      }),
    ]
    await flushPromises()
    expect(jira.groups.value.map((group) => group.specification)).toEqual([
      '4s_Overheads_Absence',
      '4s_Overheads_Other',
    ])
    // One cost centre and two rows. The intro counts the cost centres.
    expect(jira.workdayIdCount.value).toBe(1)
  })
})

describe('the line under a Workday ID', () => {
  function ticketOf(over: Partial<CompletedTicket>): CompletedTicket {
    return { ...(tickets[0] as CompletedTicket), ...over }
  }

  /** The one row the table holds. */
  async function rowOf(over: Partial<CompletedTicket>) {
    const page = mount(JiraPage, { global: { plugins } })
    await flushPromises()
    jira.tickets.value = [ticketOf(over)]
    await flushPromises()
    return { page, row: page.get('tbody tr') }
  }

  it('names the epic a cost centre was inherited from', async () => {
    const { row } = await rowOf({ costCentre: '99980200', costCentreFrom: 'PLRS-900' })
    expect(row.get('.pill').text()).toBe('10200')
    expect(row.get('.from').text()).toBe('Cost centre 99980200 from PLRS-900')
  })

  it('says so where the ticket carried its own', async () => {
    const { row } = await rowOf({ costCentre: '99980200', costCentreFrom: 'PLRS-1141' })
    expect(row.get('.from').text()).toBe('Cost centre 99980200 on this ticket')
  })

  it('names the project where the map is what answered', async () => {
    const { row } = await rowOf({ costCentre: null, costCentreFrom: null })
    expect(row.get('.pill').text()).toBe('4100782')
    expect(row.get('.from').text()).toBe('Cost centre you set for PLRS')
  })

  it('reports a number the catalogue does not know beside the answer it took', async () => {
    const { row } = await rowOf({ costCentre: '12345678', costCentreFrom: 'PLRS-900' })
    expect(row.get('.pill').text()).toBe('4100782')
    expect(row.get('.from.odd').text()).toBe(
      'Jira says 12345678 on PLRS-900 which the catalogue does not know',
    )
  })

  it('offers a picker on the row where the whole chain carried none', async () => {
    profile.jiraProjects = {}
    const { row } = await rowOf({ costCentre: null, costCentreFrom: null })
    expect(row.findAll('.pill')).toHaveLength(0)
    expect(row.get('.from').text()).toBe('No cost centre on this ticket or any epic above it')
    expect(row.findComponent(CostCentrePicker).exists()).toBe(true)
  })

  it('keeps what the picker on a row was told', async () => {
    profile.jiraProjects = {}
    const { page, row } = await rowOf({ costCentre: null, costCentreFrom: null })
    await row.findComponent(CostCentrePicker).vm.$emit('update:modelValue', '10100')
    await flushPromises()

    // Written to the profile the moment it is chosen. Keyed by ticket because
    // one project is not one cost centre.
    expect(profile.jiraTickets).toEqual({ 'PLRS-1141': '10100' })
    const after = page.get('tbody tr')
    expect(after.get('.pill').text()).toBe('10100')
    expect(after.get('.from').text()).toBe('Cost centre you set on this ticket')
    expect(after.findComponent(CostCentrePicker).exists()).toBe(false)
  })

  it('books the month against a cost centre set on a row', async () => {
    profile.jiraProjects = {}
    const { row } = await rowOf({ costCentre: null, costCentreFrom: null })
    expect(jira.totals.value.unmapped).toHaveLength(1)

    await row.findComponent(CostCentrePicker).vm.$emit('update:modelValue', '10100')
    await flushPromises()
    expect(jira.totals.value.unmapped).toEqual([])
    expect(jira.groups.value.map((group) => group.workdayId)).toEqual(['10100'])
  })
})

// The local only switch that reads the Jira month of another account.
//
// The account this was built on holds no worklog and no cost centre so neither
// path can be seen against it. `JIRA_AS_USER` set that for the whole server.
// This changes it in the browser and the local server reads the header.
describe('the Jira account switch', () => {
  const ALEX = '712020:0cecee67-bb99-467b-b2f6-5664d8db8d5c'

  /** The dev box. It renders above every branch of the screen. */
  function boxOf() {
    const page = mount(JiraPage, { global: { plugins } })
    return { page, box: () => page.get('.dev') }
  }

  it('names the account the server started for until one is typed', async () => {
    const { box } = boxOf()
    await flushPromises()
    expect(box().text()).toContain('the account this server started for')
  })

  it('keeps what was typed and sends it as a header', async () => {
    const { box } = boxOf()
    await flushPromises()
    await box().get('button').trigger('click')
    await box().get('input').setValue(ALEX)
    await box().get('.btn').trigger('click')
    await flushPromises()

    expect(dev.jiraAsUser.value).toBe(ALEX)
    // The local server reads this. The deployed one ignores it.
    expect(dev.devHeaders()['x-dev-jira-as-user']).toBe(ALEX)
    expect(box().text()).toContain(ALEX)
  })

  it('reads the month again as whoever was named', async () => {
    const { box } = boxOf()
    await flushPromises()
    expect(jiraMonth).toHaveBeenCalledTimes(1)

    await box().get('button').trigger('click')
    await box().get('input').setValue(ALEX)
    await box().get('.btn').trigger('click')
    await flushPromises()
    expect(jiraMonth).toHaveBeenCalledTimes(2)
  })

  it('refuses an id no Atlassian account could have', async () => {
    // The id reaches JQL inside quotes on the server. The rule is one exported
    // constant so the field and the server cannot disagree.
    const { box } = boxOf()
    await flushPromises()
    await box().get('button').trigger('click')
    await box().get('input').setValue('alex" OR key = "X')
    await box().get('.btn').trigger('click')
    await flushPromises()

    expect(dev.jiraAsUser.value).toBe('')
    expect(box().text()).toContain('not an Atlassian account id')
    expect(jiraMonth).toHaveBeenCalledTimes(1)
  })

  it('gives the account back', async () => {
    dev.jiraAsUser.value = ALEX
    const { box } = boxOf()
    await flushPromises()
    await box().get('button').trigger('click')
    const buttons = box().findAll('.btn')
    expect(buttons).toHaveLength(2)
    await buttons[1]!.trigger('click')
    await flushPromises()

    expect(dev.jiraAsUser.value).toBe('')
    expect(dev.devHeaders()['x-dev-jira-as-user']).toBeUndefined()
    expect(box().text()).toContain('the account this server started for')
  })

  it('says the double reads no other account', async () => {
    // The double serves one fixed month of one fixed account. The server
    // refuses the header and this says so before that happens.
    state.link = { ...state.link!, clientId: DEV_JIRA_CLIENT_ID }
    const { box } = boxOf()
    await flushPromises()
    expect(box().text()).toContain('the double answers so this changes nothing')
  })
})
