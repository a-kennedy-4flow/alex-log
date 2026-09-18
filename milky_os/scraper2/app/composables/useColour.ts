/* The same four colour jobs the server uses. Kept here so a component never invents a hex. */

export const SERIES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
]
export const DEEMPH = '#8b92a1'

/* The ring is what a mark needs when its fill sits under 3 to 1 against the sheet.

   Because a) the neutral band and the lightest arm of each side are near white by design
   b) a mark drawn in them vanishes on a white sheet c) a hairline in the rule colour puts
   the mark back without changing what the fill means. */
const RING = '#c9c6b4'
const BANDS = [
  { limit: 0.6, fill: '#184f95', ink: '#ffffff', ring: '#184f95' },
  { limit: 0.85, fill: '#3987e5', ink: '#16181d', ring: '#3987e5' },
  { limit: 0.95, fill: '#86b6ef', ink: '#16181d', ring: '#3987e5' },
  { limit: 1.05, fill: '#f0efec', ink: '#16181d', ring: RING },
  { limit: 1.15, fill: '#eda3a3', ink: '#16181d', ring: '#e06a6a' },
  { limit: 1.4, fill: '#e06a6a', ink: '#16181d', ring: '#e06a6a' },
  { limit: Infinity, fill: '#b83232', ink: '#ffffff', ring: '#b83232' },
]
const NONE = { fill: '#ffffff', ink: '#5c6270', ring: RING }

export function band(ratio: number | null | undefined) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return NONE
  return BANDS.find((b) => ratio < b.limit) as typeof NONE
}

/* A brand past the eighth rank carries no hue of its own.

   Because a) the palette names eight slots and a ninth hue would be indistinguishable from
   one of the eight under protanopia b) thirteen brands cannot each hold a hue c) the grey
   says the brand has no colour rather than claiming it shares one. */
export function brandFill(slot: number) {
  return slot < SERIES.length ? SERIES[slot] : DEEMPH
}

export const euro = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export const share = (ratio: number | null | undefined) =>
  ratio === null || ratio === undefined ? '—' : Math.round(ratio * 100) + ' %'

export const figure = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—'
    : value.toLocaleString('de-DE', { maximumFractionDigits: digits })
