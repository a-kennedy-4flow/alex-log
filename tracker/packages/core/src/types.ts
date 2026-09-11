// Domain types for the timesheet editor.
//
// The tracker workbook is the authority for these shapes. A field named after a
// tracker column keeps that name.

import type { LocaleCode } from './locales'

/** A bookable cost centre or project. */
export interface Project {
  costCentre: string | null
  customerGroup: string | null
  customer: string | null
  customerId: string | number | null
  projectNo: string | number | null
  entity: string | null
  businessLine: string | null
  businessUnit: string | null
  projectTitle: string | null
  status: string | null
  object: string | null
  /** Tracker column I. The value the user picks. */
  workdayId: string
  workdayTitle: string | null
  specification: string | null
  hgbAllocation: string | null
  /** Business line with its spaces stripped. Mirrors tracker column Z. */
  businessLineKey: string
  /** `proj` or `cc` or `na`. Mirrors tracker column AA. */
  objectKey: ObjectKey
  /** Name of the specification range this project may pick from. */
  specRange: string
}

export type ObjectKey = 'proj' | 'cc' | 'na'

/**
 * An absence the user declares. The workbook offers these in the same dropdown
 * as the cost centres so the editor treats them as projects with a text id.
 */
export interface AbsenceType {
  label: string
  projectNo: string | null
  businessLineKey: string
  objectKey: ObjectKey
  specRange: string
}

export interface WorkLocation {
  code: string
  entityNo: string
  countryCode: string
  city: string
}

export interface LegalEntity {
  country: string | null
  entity: string
}

/**
 * Where a catalogue came from. `workbook` is the uploaded filename. The other
 * three are what the workbook states about its own project list.
 */
export interface CatalogueSource {
  workbook: string | null
  projectListUpdated: string | null
  projectListFile: string | null
  projectListPath: string | null
  /**
   * The 4s project numbers list laid over the project list of the tracker.
   * Absent until one is uploaded. It names projects the tracker leaves blank so
   * it never replaces the four fields above.
   */
  projectNumbers?: { workbook: string; listUpdated: string | null } | null
}

export interface BusinessLine {
  name: string
  /** The name with its spaces stripped. Mirrors tracker column Z. */
  key: string
  /** How many project list rows carry this line. */
  count: number
}

/**
 * One half of one calendar day. The tracker gives every day two rows so a day
 * can be split between two cost centres.
 */
export interface HalfDay {
  /** ISO date of the day this half belongs to. */
  date: string
  /** 0 is the upper tracker row. 1 is the lower one. */
  half: 0 | 1
  workdayId: string | null
  specification: string | null
  /**
   * True when the specification was filled in for the user rather than chosen.
   * Stored so the marker survives a reload. The export ignores it because the
   * tracker has no such column.
   */
  specificationIsDefault: boolean
  days: 0.5 | 1 | null
  location: string | null
  tasks: string | null
}

/** Everything the calendar knows about one day at one location. */
export interface CalendarDay {
  date: string
  dayOfMonth: number
  /** ISO 8601 week number. Tracker column F. */
  week: number
  /** Monday is 1. Sunday is 7. */
  weekday: number
  /** Tracker column G. True for a weekend or a bank holiday. */
  nonWorking: boolean
  /**
   * True for a bank holiday at this location. Held apart from `nonWorking`
   * because a board cell has to say which of the two it is. The workbook lists
   * dates and no names so there is no name to carry.
   */
  holiday: boolean
  /** True when a Saturday is listed as a working day for this location. */
  workingWeekend: boolean
}

/** The user profile. Cognito supplies the name and the email. */
export interface UserProfile {
  email: string
  firstName: string
  lastName: string
  /** Chosen on first login. Tracker cell A2. */
  location: string | null
  /** Chosen on first login. */
  entity: string | null
  /**
   * Chosen on first login. Orders the cost centre picker so the user sees their
   * own line first. It does not restrict what they may book.
   */
  businessLine: string | null
  /**
   * The share of a full month the user is contracted for. 0 through 100. Null
   * for a full month. It sets the expected days for every month rather than
   * being typed again each time.
   */
  workPercent: number | null
  /**
   * The language of the interface and of the monthly reminder. Null until the
   * wizard has asked. The browser cannot be read from a Lambda so the answer is
   * stored rather than detected.
   */
  locale: LocaleCode | null
  /** False mutes the monthly reminder. */
  remindByEmail: boolean
  /**
   * How long a working day is for this user. Null takes the eight hour default.
   *
   * It sets what half a day means when a Jira ticket carries hours. A six hour
   * day makes the half day three. It does not change how many days the month
   * expects. That is `workPercent` and a part time month is fewer days rather
   * than shorter ones unless this says otherwise.
   */
  hoursPerDay: number | null
  /**
   * One Jira project key to one Workday ID. Written when the user maps a row on
   * the Jira screen and proposed on every later month.
   *
   * It is held per user rather than centrally. Because a) nobody has asked for
   * a central map. b) the user is the only one who knows which cost centre
   * their project belongs to. c) a central map can be added later without
   * moving this.
   */
  jiraProjects: Record<string, string>
  /**
   * One Jira ticket key to one Workday ID. Written when the user answers a
   * ticket no cost centre could be found for.
   *
   * It sits beside the project map rather than replacing it. Because a) one
   * project is not one cost centre so a project answer is a guess for the
   * tickets of it Jira says nothing about. b) a ticket answer is a fact about
   * that ticket. c) the two are read in that order and `resolveCostCentre`
   * holds it.
   */
  jiraTickets: Record<string, string>
}

export interface TimesheetKey {
  year: number
  /** 1 through 12. */
  month: number
}

export interface Timesheet extends TimesheetKey {
  location: string
  halfDays: HalfDay[]
  /**
   * Tracker cell B8 for this month alone. Set when a month differs from the
   * contract. Null means the contract percentage decides.
   */
  adjustedWorkDays: number | null
}

/** One row of the tracker aggregation block at rows 71 to 85. */
export interface AggregateRow {
  /** Null when the row carries a day value but no cost centre. */
  workdayId: string | null
  specification: string | null
  days: number
  customer: string | null
  projectTitle: string | null
  businessLine: string | null
}

/** One row of the tracker per week block at rows 95 to 100. */
export interface WeekRow {
  week: number
  workingDays: number
  nonWorkingDays: number
  total: number
}

export type Severity = 'error' | 'warning'

export interface ValidationIssue {
  severity: Severity
  /** Key into the translation catalogue. */
  code: string
  /** Values interpolated into the message. */
  values?: Record<string, string | number>
  /** Tracker rows the issue points at. Used to highlight the grid. */
  rows?: string[]
}
