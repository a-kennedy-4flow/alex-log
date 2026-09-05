// Storage.
//
// One DynamoDB table holds everything. The partition key separates the users
// from the catalogue so a user can never read another user timesheet with a
// key they could guess.
//
//   USER#<sub>   PROFILE           the profile the user set on first login
//   USER#<sub>   SHEET#<yyyy-mm>   one saved month
//   CATALOGUE    CURRENT           the uploaded project list and holidays
//
// The catalogue is a megabyte of JSON which is over the 400 KB item limit so it
// is stored gzipped. It compresses to about 60 KB base64 which fits in one item
// and saves the read amplification of one item per project.

import { gzipSync, gunzipSync } from 'node:zlib'

import type { CatalogueInput, HalfDay, UserProfile } from '@timesheets/core'

export interface StoredSheet {
  year: number
  month: number
  location: string
  halfDays: HalfDay[]
  /** Tracker cell B8 for this month alone. Null defers to the contract. */
  adjustedWorkDays: number | null
  updatedAt: string
}

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
}
