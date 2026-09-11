// Which cost centre one Jira ticket books against.
//
// Jira holds a cost centre and the tracker books against a Workday ID. This is
// the order the two are joined in. It answers where the figure came from as
// well as what it is because a user has to know a cost centre was inherited
// before they book a month against it.
//
// The order lives here rather than in `useJira.ts` because it is domain and not
// rendering. The browser is still the only caller. The Jira function never
// loads the catalogue so it cannot run this. `docs/jira.md` says why.

import { defaultSpecificationFor, matchSpecification, workdayIdForCostCentre } from './catalogue'
import type { CompletedTicket } from './hours'

/**
 * What answered the Workday ID.
 *
 * `ticket` and `project` are both a person having said so. `jira` is the field
 * on the ticket or on the nearest ancestor carrying one. `none` is nothing
 * having answered and that is the row which offers a picker.
 */
export type CostCentreSource = 'ticket' | 'jira' | 'project' | 'none'

/** What a person has said. Both maps live on the profile. */
export interface CostCentreChoices {
  /**
   * One ticket key to one Workday ID.
   *
   * It is keyed by ticket rather than by project because one project is not one
   * cost centre. Because a) a 4flow project runs work for several of them. b)
   * the ticket is the finest thing the screen holds. c) the project map is still
   * there underneath for the ticket nobody has answered.
   */
  tickets: Record<string, string>
  /** One Jira project key to one Workday ID. The last answer there is. */
  projects: Record<string, string>
}

export interface ResolvedCostCentre {
  /** Null where nothing answered. Such a ticket is shown and never booked. */
  workdayId: string | null
  source: CostCentreSource
  /** The Jira cost centre. Null where no ticket in the chain carried one. */
  costCentre: string | null
  /** The ticket that cost centre was read from. Null where there is none. */
  from: string | null
  /**
   * True where Jira carried a cost centre the catalogue does not know.
   *
   * A flag rather than a source because the ticket still books against whatever
   * the maps answer. The screen says both. Because a) a number the catalogue
   * never heard of is a number somebody has to look at. b) saying nothing would
   * read as Jira carrying nothing. c) it is reported rather than guessed from.
   */
  unknown: boolean
}

/**
 * The Workday ID a ticket books against and where it came from.
 *
 * Four answers in order. A cost centre set on this ticket. The Jira cost centre
 * converted through the catalogue. The map of the project. Nothing.
 *
 * A ticket answer beats Jira. Because a) it is the one answer a person made for
 * this ticket on purpose. b) it is the only way to correct an epic carrying the
 * wrong cost centre for one ticket beneath it. c) it is set on a ticket Jira
 * says nothing about so it usually competes with nothing.
 *
 * Jira beats the project map. Because a) a cost centre is per ticket and the
 * map is per project so Jira is the finer answer. b) an epic carries one for
 * everything beneath it so a whole release books with nobody typing. c) the map
 * stays the answer for a project Jira says nothing about.
 */
export function resolveCostCentre(
  ticket: CompletedTicket,
  choices: CostCentreChoices,
): ResolvedCostCentre {
  const costCentre = ticket.costCentre
  const from = costCentre === null ? null : ticket.costCentreFrom
  const converted = workdayIdForCostCentre(costCentre)
  const unknown = costCentre !== null && converted === null
  const found = { costCentre, from, unknown }

  const set = choices.tickets[ticket.key]
  if (set) return { workdayId: set, source: 'ticket', ...found }
  if (converted) return { workdayId: converted, source: 'jira', ...found }
  const mapped = choices.projects[ticket.projectKey]
  if (mapped) return { workdayId: mapped, source: 'project', ...found }
  return { workdayId: null, source: 'none', ...found }
}

/**
 * What answered the specification.
 *
 * `jira` is the label on the specification ticket read into the workbook list.
 * `default` is the first specification the cost centre allows. `none` is a cost
 * centre that names no list of its own so a blank stands.
 */
export type SpecificationSource = 'jira' | 'default' | 'none'

export interface ResolvedSpecification {
  /** What the row books. Null where the cost centre allows no list. */
  specification: string | null
  source: SpecificationSource
  /** The Jira label. Null where no ticket in the chain carried one. */
  label: string | null
  /** The specification ticket the label was read from. Null where there is none. */
  from: string | null
  /**
   * True where Jira carried a label this cost centre does not allow.
   *
   * The row still books the default so the month is not left short. The screen
   * says both. Because a) a specification outside the list is not bookable. b)
   * the field also holds a cost centre number somebody typed into the wrong
   * box. c) correcting it in Jira is somebody business and they cannot correct
   * what they cannot see.
   */
  unknown: boolean
}

/**
 * The specification a ticket books and where it came from.
 *
 * A specification is only meaningful inside its cost centre so the Workday ID
 * decides the list before the label is read at all. A label the list does not
 * hold answers nothing and the default stands.
 *
 * The Workday ID is passed rather than resolved here. Because `resolveCostCentre`
 * already answers it and resolving it twice is two places for the order to drift.
 */
export function resolveSpecification(
  ticket: CompletedTicket,
  workdayId: string | null,
): ResolvedSpecification {
  const label = ticket.costCentreSpecification
  const from = label === null ? null : ticket.costCentreSpecificationFrom
  const matched = matchSpecification(workdayId, label)
  if (matched) return { specification: matched, source: 'jira', label, from, unknown: false }

  const unknown = label !== null && workdayId !== null
  const fallback = defaultSpecificationFor(workdayId)
  if (fallback) return { specification: fallback, source: 'default', label, from, unknown }
  return { specification: null, source: 'none', label, from, unknown }
}
