// The API client.
//
// `VITE_API_URL` decides where the data comes from. With it set the app talks to
// the API. Without it the app runs on the extracted fixtures and keeps the
// timesheets in localStorage so the UI can be worked on with nothing else
// running.

import type {
  CatalogueInput,
  CompletedTicket,
  HalfDay,
  UserProfile,
  ValidationIssue,
} from '@tracker/core'
import { devHeaders } from '@/composables/useDevUser'
import { apiToken, authEnabled } from '@/lib/auth'

export const API_URL: string = import.meta.env.VITE_API_URL ?? ''
export const usingApi = API_URL !== ''

/**
 * The deployed API identifies the caller from the Cognito access token. The
 * local development server has no token check and reads the dev headers.
 */
async function callerHeaders(): Promise<Record<string, string>> {
  if (authEnabled) {
    const token = await apiToken()
    return token ? { authorization: `Bearer ${token}` } : {}
  }
  return import.meta.env.DEV ? devHeaders() : {}
}

export class ApiError extends Error {
  readonly status: number
  readonly codes: string[]

  constructor(status: number, message: string, codes: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.codes = codes
  }
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(await callerHeaders()),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    let message = `${method} ${path} failed with ${response.status}`
    let codes: string[] = []
    try {
      const problem = (await response.clone().json()) as { error?: string; codes?: string[] }
      if (problem.error) message = problem.error
      if (problem.codes) codes = problem.codes
    } catch {
      // A non JSON body leaves the status line as the message.
    }
    throw new ApiError(response.status, message, codes)
  }
  return response
}

async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  return (await request(method, path, body)).json() as Promise<T>
}

export interface StoredSheet {
  year: number
  month: number
  location: string
  halfDays: HalfDay[]
  /** Tracker cell B8 for this month alone. Null defers to the contract. */
  adjustedWorkDays: number | null
  updatedAt: string
  /**
   * When the workbook was last downloaded. It survives a later edit so the
   * monthly reminder stays muted once a month has been sent. A month whose
   * `updatedAt` is later than this was edited after its download.
   */
  exportedAt: string | null
}

export interface SheetInput {
  location: string
  halfDays: HalfDay[]
  adjustedWorkDays: number | null
}

export interface JiraLinkState {
  linked: boolean
  /** Empty when no app is registered for this deployment. */
  clientId: string
  redirectUri: string
  /** The Atlassian site. Empty leaves a ticket id on the screen unlinked. */
  siteUrl: string
  accountId: string | null
  linkedAt: string | null
}

export interface JiraMonth {
  period: string
  fetchedAt: string
  /** True when the answer came from the stored copy rather than from Jira. */
  cached: boolean
  tickets: CompletedTicket[]
}

export const api = {
  // The route answers with the stored lists under the version that holds them.
  catalogue: () => json<CatalogueInput & { version: string; updatedAt: string }>(
    'GET',
    '/api/catalogue',
  ),
  putCatalogue: (data: unknown) =>
    json<{ version: string; updatedAt: string; projects: number }>(
      'PUT',
      '/api/admin/catalogue',
      data,
    ),
  getProfile: () => json<UserProfile>('GET', '/api/me'),
  putProfile: (profile: UserProfile) => json<UserProfile>('PUT', '/api/me', profile),
  listSheets: () =>
    json<{ sheets: { period: string; updatedAt: string }[] }>('GET', '/api/timesheets'),
  getSheet: (period: string) => json<StoredSheet>('GET', `/api/timesheets/${period}`),
  putSheet: (period: string, sheet: SheetInput) =>
    json<StoredSheet>('PUT', `/api/timesheets/${period}`, sheet),
  check: (period: string, sheet: SheetInput) =>
    json<{ issues: ValidationIssue[]; blocked: boolean; target: number }>(
      'POST',
      `/api/timesheets/${period}/check`,
      sheet,
    ),

  // The Jira routes answer from a function of its own. The path is what routes
  // them so nothing here differs from any other call.
  jiraLink: () => json<JiraLinkState>('GET', '/api/jira/link'),
  linkJira: (code: string) =>
    json<{ linked: boolean; accountId: string }>('POST', '/api/jira/link', { code }),
  unlinkJira: () => json<{ linked: boolean }>('DELETE', '/api/jira/link'),
  jiraMonth: (period: string) => json<JiraMonth>('GET', `/api/jira/completed/${period}`),

  /**
   * Returns the workbook and the name the recipient expects.
   *
   * `shown` is the name the panel already put on the screen. It is what the
   * download is called when the header cannot be read. Because a) the panel and
   * the API build the name from the same rule in `filename.ts` so the two agree
   * on every field. b) a browser hides `content-disposition` on a cross origin
   * response the API does not expose it on. c) a period alone is not a name the
   * recipient can file and it is not the name the user was promised.
   */
  async export(period: string, shown: string): Promise<{ filename: string; blob: Blob }> {
    const response = await request('POST', `/api/timesheets/${period}/export`)
    const disposition = response.headers.get('content-disposition') ?? ''
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? shown
    return { filename, blob: await response.blob() }
  },

  /**
   * Sends the workbook to the mailbox of whoever is signed in.
   *
   * No address is handed over. The API reads it from the token so nobody can
   * post another person's month to a mailbox of their choosing. The answer
   * names where it went because that is what the panel reports.
   */
  emailTracker: (period: string) =>
    json<{ to: string; filename: string }>('POST', `/api/timesheets/${period}/email`),
}

/** Hands the file to the browser. The user emails it on. */
export function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
