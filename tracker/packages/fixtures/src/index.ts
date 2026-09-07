// Seed data extracted from the shipped workbooks by `pnpm fixtures`.
//
// It stands in for the API while the backend is wired and it seeds an empty
// DynamoDB table. The tests use it as the oracle because the numbers in the
// sample files are the ones Excel itself computed.

// No import from core. The two packages would otherwise depend on each other
// because core tests read these fixtures. `setCatalogue` narrows the loose JSON
// types so nothing here has to.

import locationsFile from '../data/locations.json'
import holidaysFile from '../data/holidays.json'
import specificationsFile from '../data/specifications.json'
import entryOptionsFile from '../data/entry-options.json'

/** Which workbook the catalogue came from and when its project list was cut. */
export const source = locationsFile.source

/**
 * Everything except the project list. The project list is a megabyte so it
 * loads on its own.
 */
export const catalogueSeed = {
  source: locationsFile.source,
  locations: locationsFile.locations,
  entities: locationsFile.entities,
  holidays: holidaysFile.holidays,
  workingWeekends: holidaysFile.workingWeekends,
  specifications: specificationsFile.specifications,
  brokenSpecRanges: specificationsFile.brokenSpecRanges.map((r) => r.name),
  absenceTypes: entryOptionsFile.absenceTypes,
  timeValues: entryOptionsFile.timeValues,
  businessLines: entryOptionsFile.businessLines,
}

export async function loadProjects() {
  const file = await import('../data/projects.json')
  return file.default.projects
}

/** The seed with the project list included. */
export async function loadCatalogue() {
  return { ...catalogueSeed, projects: await loadProjects() }
}
