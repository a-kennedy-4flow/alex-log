// Domain types for the timesheet editor.
//
// The tracker workbook is the authority for these shapes. A field named after a
// tracker column keeps that name.

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
  holidayName: string | null
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
