// The filled months from the shipped workbooks with the numbers Excel itself
// computed. Test only. Kept out of the main entry point so the browser bundle
// never carries them.

import sampleIndex from '../data/samples/index.json'

export interface SampleRow {
  row: number
  date: string
  dayOfMonth: number | null
  week: number | null
  nonWorking: boolean
  workdayId: string | number | null
  specification: string | null
  days: number | null
  location: string | null
  tasks: string | number | null
}

export interface Sample {
  workbook: string
  name: string | null
  firstName: string | null
  lastName: string | null
  location: string | null
  year: number
  month: number
  workDays: number | null
  adjustedWorkDays: number | null
  target: number
  totalDays: number
  fromWeek: number | null
  toWeek: number | null
  vacationDays: number
  otherAbsenceDays: number
  /** Tracker cell O2. What Excel told the user about the target. */
  statusMessage: string | null
  /** Tracker cell O3. What Excel told the user about the entries. */
  entryMessage: string | null
  rows: SampleRow[]
  weekTable: { week: number; workingDays: number; nonWorkingDays: number; total: number }[]
  aggregate: {
    workdayId: string
    specification: string | null
    days: number
    customer: string | null
    projectTitle: string | null
  }[]
}

export const sampleSlugs: string[] = sampleIndex.map((s) => s.slug)

export async function loadSample(slug: string): Promise<Sample> {
  const file = await import(`../data/samples/${slug}.json`)
  return file.default as Sample
}

export async function loadSamples(): Promise<Sample[]> {
  return Promise.all(sampleSlugs.map(loadSample))
}
