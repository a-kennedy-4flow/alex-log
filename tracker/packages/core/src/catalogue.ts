// The lists the editor and the export both resolve against.
//
// The data is injected rather than imported. Because a) the browser loads it
// from the API. b) Lambda loads it from DynamoDB. c) the tests load it from the
// extracted fixtures. Nothing here knows which.
//
// Backoffice uploads two files. One holds the project numbers. One holds the
// bank holidays. Each upload replaces what is there.

import type {
  AbsenceType,
  BusinessLine,
  CatalogueSource,
  LegalEntity,
  ObjectKey,
  Project,
  WorkLocation,
} from './types'

export interface CatalogueData {
  /** The workbook these lists were read from. Null until one is uploaded. */
  source: CatalogueSource | null
  locations: WorkLocation[]
  entities: LegalEntity[]
  /** Keyed by location code. Values are ISO dates. */
  holidays: Record<string, string[]>
  /**
   * Weekend days that count as working days, keyed by location. One location
   * works these and the rest do not so a single list applied everywhere would
   * turn a Berlin Sunday into a working day.
   */
  workingWeekends: Record<string, string[]>
  /** Keyed by the range name the tracker builds as `spec_<line>_<object>`. */
  specifications: Record<string, string[]>
  /** Range names that are #REF! in the workbook. */
  brokenSpecRanges: string[]
  absenceTypes: AbsenceType[]
  /** Column K accepts these values and nothing else. */
  timeValues: number[]
  businessLines: BusinessLine[]
  projects: Project[]
  /** How many rows were dropped as repeats of a workday id already seen. */
  duplicateProjectRows: number
}

/**
 * The catalogue as it arrives from outside. JSON and DynamoDB both widen a
 * union back to `string` so the caller is not made to narrow it. `setCatalogue`
 * does that once here.
 */
export interface CatalogueInput
  extends Partial<Omit<CatalogueData, 'projects' | 'absenceTypes' | 'duplicateProjectRows'>> {
  projects?: readonly RawProject[]
  absenceTypes?: readonly RawAbsence[]
}

export type RawProject = Omit<Project, 'objectKey'> & { objectKey: string }
export type RawAbsence = Omit<AbsenceType, 'objectKey'> & { objectKey: string }

export function toObjectKey(value: string): ObjectKey {
  return value === 'proj' || value === 'cc' ? value : 'na'
}

export const EMPTY_CATALOGUE: CatalogueData = {
  source: null,
  locations: [],
  entities: [],
  holidays: {},
  workingWeekends: {},
  specifications: {},
  brokenSpecRanges: [],
  absenceTypes: [],
  timeValues: [0.5, 1],
  businessLines: [],
  projects: [],
  duplicateProjectRows: 0,
}

/**
 * The live catalogue. Read it rather than holding a reference to one of its
 * arrays because `setCatalogue` replaces them.
 */
export const catalogue: CatalogueData = { ...EMPTY_CATALOGUE }

let byWorkdayId = new Map<string, Project>()
let absenceLabels = new Set<string>()

/** Absences are picked from the same dropdown so they need a project shape. */
function absenceAsProject(absence: AbsenceType): Project {
  return {
    costCentre: null,
    customerGroup: null,
    customer: null,
    customerId: null,
    projectNo: absence.projectNo,
    entity: null,
    businessLine: null,
    businessUnit: null,
    projectTitle: null,
    status: null,
    object: null,
    workdayId: absence.label,
    workdayTitle: absence.label,
    specification: null,
    hgbAllocation: null,
    businessLineKey: absence.businessLineKey,
    objectKey: absence.objectKey,
    specRange: absence.specRange,
  }
}

/**
 * Drops every repeat of a workday id already seen and counts what went.
 *
 * 350 workday ids appear more than once in the shipped list. The copies differ
 * only in cost centre and project number and never in title or business line or
 * type. The first wins because XLOOKUP in the tracker also returns the first
 * match. Keeping them would offer the user the same choice twice and would
 * repeat a key in the picker.
 *
 * The admin preview calls it before an upload so the number it shows is the
 * number the picker will offer.
 */
function dedupeByWorkdayId<T>(
  rows: readonly T[],
  idOf: (row: T) => string,
): { kept: T[]; dropped: number } {
  const seen = new Set<string>()
  const kept: T[] = []
  let dropped = 0
  for (const row of rows) {
    const id = idOf(row)
    if (seen.has(id)) {
      dropped++
      continue
    }
    seen.add(id)
    kept.push(row)
  }
  return { kept, dropped }
}

/**
 * The workday ids a catalogue would offer. The absences share the dropdown with
 * the cost centres so they are counted with them.
 *
 * The admin page and the upload route both report this rather than the row
 * count. Because a) hundreds of rows repeat an id. b) a repeat is never offered
 * twice. c) the two screens would otherwise disagree with the picker.
 */
export function offeredWorkdayIds(data: CatalogueInput): string[] {
  const ids = [
    ...(data.absenceTypes ?? []).map((absence) => absence.label),
    ...(data.projects ?? []).map((project) => project.workdayId),
  ]
  return dedupeByWorkdayId(ids, (id) => id).kept
}

/**
 * Replaces the catalogue. The absences are prepended to the project list so one
 * lookup serves both.
 */
export function setCatalogue(data: CatalogueInput): void {
  const projects: Project[] = (data.projects ?? []).map((p) => ({
    ...p,
    objectKey: toObjectKey(p.objectKey),
  }))
  const absenceTypes: AbsenceType[] = (data.absenceTypes ?? []).map((a) => ({
    ...a,
    objectKey: toObjectKey(a.objectKey),
  }))

  Object.assign(catalogue, EMPTY_CATALOGUE, data, { projects, absenceTypes })
  absenceLabels = new Set(absenceTypes.map((a) => a.label))

  const { kept: unique, dropped } = dedupeByWorkdayId(
    [...absenceTypes.map(absenceAsProject), ...projects],
    (project) => project.workdayId,
  )

  catalogue.projects = unique
  catalogue.duplicateProjectRows = dropped
  byWorkdayId = new Map(unique.map((p) => [p.workdayId, p]))

  // The counts are recomputed here rather than taken from the uploaded data.
  // Otherwise they would report the rows before deduplication and overstate
  // what the picker actually offers.
  const counts = new Map<string, number>()
  for (const project of unique) {
    if (!project.businessLine) continue
    counts.set(project.businessLine, (counts.get(project.businessLine) ?? 0) + 1)
  }
  catalogue.businessLines = (data.businessLines ?? [])
    .map((line) => ({ ...line, count: counts.get(line.name) ?? 0 }))
    .filter((line) => line.count > 0)
    .sort((a, b) => b.count - a.count)
}

/** True once the catalogue holds something to look up. */
export function catalogueReady(): boolean {
  return byWorkdayId.size > 0
}

export function isAbsence(workdayId: string | null): boolean {
  return workdayId !== null && absenceLabels.has(workdayId)
}

export function findProject(workdayId: string | null): Project | null {
  if (!workdayId) return null
  return byWorkdayId.get(workdayId) ?? null
}

/** Mirrors tracker column Z. */
export function businessLineKeyOf(project: Project | null): string {
  return project ? project.businessLineKey : '4flow'
}

/** Mirrors tracker column AA. */
export function objectKeyOf(project: Project | null): ObjectKey {
  return project ? project.objectKey : 'na'
}

/** Every specification the workbook knows. Used when a range cannot resolve. */
export function allSpecifications(): string[] {
  return catalogue.specifications['spec_4flow_na'] ?? []
}

export interface SpecOptions {
  options: string[]
  /** The range name the tracker would have used. */
  range: string
  /**
   * True when the cost centre names a list of its own. False when the workbook
   * leaves that list empty, in which case every specification is offered and a
   * blank is allowed because there is nothing to pick from by right.
   */
  hasOwnList: boolean
}

/**
 * The specifications one workday id may use. The tracker picks the range by
 * business line and by whether the id is a cost centre or a project.
 *
 * `spec_CorporateServices_cc` is #REF! in the workbook and 44 cost centres need
 * it so the full list is offered and the caller is told it is unverified.
 */
export function specificationsFor(workdayId: string | null): SpecOptions {
  const project = findProject(workdayId)
  const range = `spec_${businessLineKeyOf(project)}_${objectKeyOf(project)}`
  const options = catalogue.specifications[range]
  if (options && options.length > 0) return { options, range, hasOwnList: true }
  return { options: allSpecifications(), range, hasOwnList: false }
}

/**
 * True when the user has to choose a specification.
 *
 * A cost centre that names its own list must be told which of them applies. One
 * whose list the workbook leaves empty has nothing that applies by right so a
 * blank stands.
 */
export function specificationIsRequired(workdayId: string | null): boolean {
  if (workdayId === null) return false
  return specificationsFor(workdayId).hasOwnList
}

/** What a row can be called. Most rows carry no name at all. */
export function labelOf(project: Project): string {
  return (
    project.workdayTitle ??
    project.projectTitle ??
    project.customer ??
    (project.projectNo === null ? '' : `project ${project.projectNo}`)
  )
}

/**
 * How well one row answers the query. A lower number sorts first.
 *
 * The id is what the user types so an id match beats a text match. Typing `24`
 * must reach `24112` before `18249`. Because a) the id is the thing being
 * picked. b) a substring anywhere buries the obvious answer. c) the user knows
 * the first digits of their own cost centre.
 */
const RANK = { exactId: 0, idPrefix: 1, absence: 2, idContains: 3, text: 4, none: 5 } as const

function rankOf(project: Project, q: string): number {
  const id = project.workdayId.toLowerCase()
  if (id === q) return RANK.exactId
  if (id.startsWith(q)) return RANK.idPrefix
  if (isAbsence(project.workdayId)) {
    return labelOf(project).toLowerCase().includes(q) ? RANK.absence : RANK.none
  }
  if (id.includes(q)) return RANK.idContains
  const text = `${labelOf(project)} ${project.customer ?? ''} ${project.costCentre ?? ''} ${project.projectNo ?? ''}`
  return text.toLowerCase().includes(q) ? RANK.text : RANK.none
}

/**
 * Search over the picker.
 *
 * With no query the two absences lead because they are the most common pick.
 * With a query the ranking above decides and the user own business line breaks
 * a tie. The whole list is scanned before the cut because a good match can sit
 * anywhere in it.
 */
export function searchProjects(
  query: string,
  limit = 50,
  preferredBusinessLine: string | null = null,
): Project[] {
  const q = query.trim().toLowerCase()
  const mine = (p: Project): number =>
    preferredBusinessLine !== null && p.businessLine === preferredBusinessLine ? 0 : 1

  if (q === '') {
    const absences: Project[] = []
    const preferred: Project[] = []
    const rest: Project[] = []
    for (const p of catalogue.projects) {
      if (isAbsence(p.workdayId)) absences.push(p)
      else if (mine(p) === 0) preferred.push(p)
      else rest.push(p)
    }
    return [...absences, ...preferred, ...rest].slice(0, limit)
  }

  const scored: { project: Project; rank: number; own: number; order: number }[] = []
  catalogue.projects.forEach((project, order) => {
    const rank = rankOf(project, q)
    if (rank === RANK.none) return
    scored.push({ project, rank, own: mine(project), order })
  })

  scored.sort((a, b) => a.rank - b.rank || a.own - b.own || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.project)
}

/**
 * The specification a row starts with.
 *
 * The first of the list when the cost centre names one. Nothing when it does
 * not, because offering the first of every specification there is would be a
 * guess dressed as an answer.
 */
export function defaultSpecificationFor(workdayId: string | null): string | null {
  if (workdayId === null) return null
  const spec = specificationsFor(workdayId)
  return spec.hasOwnList ? (spec.options[0] ?? null) : null
}
