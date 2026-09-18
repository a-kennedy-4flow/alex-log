// The export file name.
//
// The trailing part is the country code of the location. `01_DE_Berlin` gives
// `DE`. The city is not in the name.
//
// Three pieces of evidence settle that. The workbook Alexander Kennedy actually
// submitted for August 2026 is `Kennedy.Alexander_2026_08_projecttracker_DE.xlsm`
// and it came from `01_DE_Berlin`. The blank sample is
// `Name.Firstname_2026_04_projecttracker_nn.xlsm` and `nn` is two characters
// wide. Every location in the catalogue carries a `countryCode` of two letters.
// Open question 39 of the readme held this open until 2026-09-07.

import { catalogue } from './catalogue'

/**
 * The country code of a location.
 *
 * The catalogue is asked first because it holds the answer as a field. A code
 * the catalogue does not know falls back to the second segment. Because a) a
 * location code is the entity number then the country then the city. b) an
 * export must still be named where the catalogue is stale. c) the two agree on
 * all twenty two locations so the fallback is only ever reached for a code
 * nobody uploaded.
 */
export function regionOf(locationCode: string | null): string {
  if (!locationCode) return 'UNKNOWN'
  const known = catalogue.locations.find((entry) => entry.code === locationCode)
  const code = known?.countryCode ?? locationCode.split('_')[1] ?? ''
  return code.toUpperCase().replace(/[^A-Z0-9]+/g, '') || 'UNKNOWN'
}

/**
 * The location an export is named and built for.
 *
 * The stored month wins over the profile. Because a) the workbook is built for
 * the month rather than for wherever the person sits today. b) a month worked
 * in Warsaw keeps its Polish bank holidays after a move to Berlin. c) the
 * screen names the file before the download happens so both sides have to
 * answer this the same way or the name on the screen is not the name that
 * arrives.
 *
 * An empty stored location is absence rather than a location. That is what a
 * month saved before the profile carried one holds.
 */
export function exportLocation(
  sheetLocation: string | null,
  profileLocation: string | null,
): string | null {
  return (sheetLocation || null) ?? profileLocation ?? null
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

/* ---------- The name in a header ---------- */

/**
 * The file name as the parameters of a `content-disposition` header.
 *
 * A header carries bytes rather than text. A recipient reads a plain `filename`
 * as ISO-8859-1 so a surname holding ü arrives as Ã¼. RFC 6266 answers that
 * with `filename*` which states its own encoding. Both are written. Because a)
 * a recipient that reads `filename*` prefers it. b) one that does not still
 * gets a name it can file. c) the plain parameter is ASCII so no transport can
 * mangle it.
 *
 * Node refuses a header holding a character above U+00FF. A Czech surname such
 * as Dvořák killed the response rather than mangling the name.
 */
export function dispositionParams(filename: string): string {
  const plain = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  if (plain === filename) return `filename="${plain}"`
  // `encodeURIComponent` leaves four characters RFC 5987 does not allow. An
  // apostrophe is the one a surname reaches. It also ends the encoding field.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `filename="${plain}"; filename*=UTF-8''${encoded}`
}

/**
 * The file name a `content-disposition` header states. Null where it states
 * none.
 *
 * `filename*` wins. Because a) it is the only parameter that states its
 * encoding. b) every extended character is replaced in the plain parameter
 * beside it. c) a header from anything that writes no `filename*` still answers
 * through the plain parameter.
 */
export function filenameFromDisposition(header: string): string | null {
  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header)?.[1]?.trim()
  if (extended) {
    const fields = extended.split("'")
    const value = fields.slice(2).join("'")
    if (value && /^utf-?8$/i.test(fields[0] ?? '')) {
      try {
        return decodeURIComponent(value)
      } catch {
        // A broken escape leaves the plain parameter to answer.
      }
    }
  }
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header)
  return (plain?.[1] ?? plain?.[2])?.trim() || null
}
