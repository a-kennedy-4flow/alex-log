// Storage.
//
// One DynamoDB table holds everything. The partition key separates the users
// from the catalogue so a user can never read another user timesheet with a
// key they could guess.
//
//   USER#<sub>   PROFILE            the profile the user set on first login
//   USER#<sub>   SHEET#<yyyy-mm>    one saved month
//   USER#<sub>   REMIND#<yyyy-mm>   the reminder already sent for that month
//   USER#<sub>   JIRA               what lets the tracker read Jira as this user
//   CATALOGUE    CURRENT            the uploaded project list and holidays
//
// The catalogue is a megabyte of JSON which is over the 400 KB item limit so it
// is stored gzipped. It compresses to about 60 KB base64 which fits in one item
// and saves the read amplification of one item per project.

import { gzipSync, gunzipSync } from 'node:zlib'

import type { CatalogueInput, CompletedTicket, HalfDay, UserProfile } from '@tracker/core'

export interface StoredSheet {
  year: number
  month: number
  location: string
  halfDays: HalfDay[]
  /** Tracker cell B8 for this month alone. Null defers to the contract. */
  adjustedWorkDays: number | null
  updatedAt: string
  /**
   * When the workbook was last downloaded. Null once the sheet is edited again
   * because the downloaded file no longer matches what is stored. It is the
   * only signal the application has that a month was dealt with so the monthly
   * reminder reads it.
   */
  exportedAt: string | null
}

/**
 * One month of tickets already read from Jira.
 *
 * A closed month is served from here for a day and the current one for fifteen
 * minutes. Because a) a JQL search is one of the more expensive Jira calls. b)
 * the screen is reloaded more often than the data moves. c) a month that ended
 * a fortnight ago rarely changes again.
 */
export interface StoredTickets {
  period: string
  fetchedAt: string
  /**
   * The shape the tickets were written in. A cache at any other version is
   * discarded rather than read. Because a) the ticket gained the cost centre
   * and the parent key and the per day hours. b) an older row carries none of
   * them so the screen would read undefined. c) throwing one cache away costs
   * one search.
   */
  version: number
  tickets: CompletedTicket[]
}

/** Raise this whenever `CompletedTicket` gains or loses a field. */
export const TICKET_CACHE_VERSION = 2

/**
 * What lets the tracker read Jira as one user.
 *
 * Every token here is KMS ciphertext rather than a token. Because a table
 * export would otherwise carry a usable credential.
 *
 * Atlassian rotates a refresh token so spending one disables it. Three fields
 * exist for that alone. `access` spares most refreshes altogether.
 * `previousRefresh` is what a caller that lost the race falls back to.
 * `generation` stops a writer that overran its claim from overwriting a newer
 * token. The claim is an attribute of the item rather than a field here because
 * nothing that reads a link needs to see it. See `docs/jira.md`.
 */
export interface StoredJiraLink {
  /** The Atlassian account id that gave the consent. */
  accountId: string
  linkedAt: string
  refresh: string
  previousRefresh: string | null
  access: string | null
  /** ISO instant. Null until an access token has been fetched. */
  accessExpiresAt: string | null
  /** Bumped on every write. A conditional write is taken against it. */
  generation: number
  cache: StoredTickets | null
}

/** How long a caller may hold the right to refresh before the lease lapses. */
export const REFRESH_LEASE_MS = 30_000

/** How long an older refresh token is worth trying after it rotated. */
export const PREVIOUS_REFRESH_WINDOW_MS = 10 * 60_000

/** A closed month never moves much. The current one might. */
export const TICKET_CACHE_CLOSED_MS = 24 * 60 * 60_000
export const TICKET_CACHE_CURRENT_MS = 15 * 60_000

/** An access token is renewed early so a request never carries an expired one. */
export const ACCESS_MARGIN_MS = 60_000

export interface StoredCatalogue {
  version: string
  updatedAt: string
  data: CatalogueInput
}

export interface Repository {
  getProfile(sub: string): Promise<UserProfile | null>
  putProfile(sub: string, profile: UserProfile): Promise<void>
  getSheet(sub: string, period: string): Promise<StoredSheet | null>
  putSheet(sub: string, period: string, sheet: StoredSheet): Promise<void>
  listSheets(sub: string): Promise<{ period: string; updatedAt: string }[]>
  getCatalogue(): Promise<StoredCatalogue | null>
  putCatalogue(entry: StoredCatalogue): Promise<void>
  /**
   * Records that the reminder for this month has been sent. False means one was
   * already recorded so nothing should be sent.
   *
   * The claim is taken before the message so a retried run sends nothing. It is
   * released when the send itself fails so the next run may try again.
   */
  claimReminder(sub: string, period: string, at: Date): Promise<boolean>
  releaseReminder(sub: string, period: string): Promise<void>
  getJiraLink(sub: string): Promise<StoredJiraLink | null>
  /** Writes without checking. The link and the unlink paths take this. */
  putJiraLink(sub: string, link: StoredJiraLink): Promise<void>
  deleteJiraLink(sub: string): Promise<void>
  /**
   * Wins the right to spend the refresh token. False means somebody else holds
   * it so the caller must re-read rather than refresh.
   *
   * The lease lapses so a crash cannot lock a user out of their own link.
   */
  claimJiraRefresh(sub: string, until: Date): Promise<boolean>
  releaseJiraRefresh(sub: string): Promise<void>
  /**
   * Writes a link back after a refresh. False means the generation moved so
   * another caller wrote first and this one must re-read.
   */
  putJiraLinkIfUnchanged(
    sub: string,
    link: StoredJiraLink,
    generation: number,
  ): Promise<boolean>
}

/** `2026-08` is the period key. */
export const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/

export function periodOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function splitPeriod(period: string): { year: number; month: number } {
  const [year, month] = period.split('-')
  return { year: Number(year), month: Number(month) }
}

/** Six months of history. Older sheets expire rather than being swept. */
export const HISTORY_MONTHS = 6

export function expiryFor(period: string, now: Date): number {
  const { year, month } = splitPeriod(period)
  // The month after the sheet plus the retention window.
  const expires = Date.UTC(year, month + HISTORY_MONTHS, 1)
  return Math.floor(Math.max(expires, now.getTime()) / 1000)
}

export function compress(data: unknown): string {
  return gzipSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('base64')
}

export function decompress<T>(blob: string): T {
  return JSON.parse(gunzipSync(Buffer.from(blob, 'base64')).toString('utf8')) as T
}

/* ---------- in memory ---------- */

/**
 * Used by the tests and by the local development server. It keeps the same
 * shape as the DynamoDB implementation so a handler cannot tell them apart.
 */
export class MemoryRepository implements Repository {
  private profiles = new Map<string, UserProfile>()
  private sheets = new Map<string, StoredSheet>()
  private catalogue: StoredCatalogue | null = null
  private reminders = new Set<string>()
  private links = new Map<string, StoredJiraLink>()
  /** Sub to the instant the held claim lapses. */
  private claims = new Map<string, number>()

  async getProfile(sub: string): Promise<UserProfile | null> {
    return this.profiles.get(sub) ?? null
  }

  async putProfile(sub: string, profile: UserProfile): Promise<void> {
    this.profiles.set(sub, profile)
  }

  async getSheet(sub: string, period: string): Promise<StoredSheet | null> {
    return this.sheets.get(`${sub}/${period}`) ?? null
  }

  async putSheet(sub: string, period: string, sheet: StoredSheet): Promise<void> {
    this.sheets.set(`${sub}/${period}`, sheet)
  }

  async listSheets(sub: string): Promise<{ period: string; updatedAt: string }[]> {
    const out: { period: string; updatedAt: string }[] = []
    for (const [key, sheet] of this.sheets) {
      const [owner, period] = key.split('/')
      if (owner === sub && period) out.push({ period, updatedAt: sheet.updatedAt })
    }
    return out.sort((a, b) => b.period.localeCompare(a.period))
  }

  async getCatalogue(): Promise<StoredCatalogue | null> {
    return this.catalogue
  }

  async putCatalogue(entry: StoredCatalogue): Promise<void> {
    this.catalogue = entry
  }

  async claimReminder(sub: string, period: string): Promise<boolean> {
    const key = `${sub}/${period}`
    if (this.reminders.has(key)) return false
    this.reminders.add(key)
    return true
  }

  async releaseReminder(sub: string, period: string): Promise<void> {
    this.reminders.delete(`${sub}/${period}`)
  }

  async getJiraLink(sub: string): Promise<StoredJiraLink | null> {
    const link = this.links.get(sub)
    return link ? { ...link } : null
  }

  async putJiraLink(sub: string, link: StoredJiraLink): Promise<void> {
    this.links.set(sub, { ...link })
  }

  async deleteJiraLink(sub: string): Promise<void> {
    this.links.delete(sub)
    this.claims.delete(sub)
  }

  async claimJiraRefresh(sub: string, until: Date): Promise<boolean> {
    const held = this.claims.get(sub)
    if (held !== undefined && held > Date.now()) return false
    this.claims.set(sub, until.getTime())
    return true
  }

  async releaseJiraRefresh(sub: string): Promise<void> {
    this.claims.delete(sub)
  }

  async putJiraLinkIfUnchanged(
    sub: string,
    link: StoredJiraLink,
    generation: number,
  ): Promise<boolean> {
    const held = this.links.get(sub)
    if (!held || held.generation !== generation) return false
    this.links.set(sub, { ...link })
    return true
  }
}
