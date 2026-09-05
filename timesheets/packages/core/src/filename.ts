// The export file name.
//
// The shipped sample is `Name.Firstname_2026_04_projecttracker_nn.xlsm`. The
// trailing part is the region such as `DE_BERLIN` or `AT_VIENNA`. A location
// code carries the entity number then the country then the city so the entity
// number is dropped.
//
// A city holding a separator such as `Ruesselsheim / Bad Nauheim` collapses to
// single underscores. Because a) a slash cannot appear in a file name. b) the
// receiving mailbox reads the name. c) a run of punctuation would leave a
// double underscore.

export function regionOf(locationCode: string | null): string {
  if (!locationCode) return 'UNKNOWN'
  const withoutEntity = locationCode.split('_').slice(1).join('_')
  return withoutEntity
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export interface FilenameParts {
  firstName: string
  lastName: string
  year: number
  month: number
  location: string | null
}

export function exportFilename({
  firstName,
  lastName,
  year,
  month,
  location,
}: FilenameParts): string {
  const person = `${lastName}.${firstName}`.replace(/\s+/g, '')
  const period = `${year}_${String(month).padStart(2, '0')}`
  return `${person}_${period}_projecttracker_${regionOf(location)}.xlsm`
}
