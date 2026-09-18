/* Every colour the app draws.

   Terms. A **job** is what a colour encodes. Four jobs are used. Identity takes the
   categorical slots. Polarity takes the diverging bands. State takes the de-emphasis
   grey. Nothing else carries colour.

   The hexes are the documented palette. Because a) an eyeballed hex fails the colour
   vision checks that the documented set already passed b) the eight slots clear every
   gate against a white sheet in their documented order c) a ninth hue would be
   indistinguishable from one of the eight under protanopia. */

export const SERIES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
] as const
export const DEEMPH = '#8b92a1'

/* Six bands against a median with a neutral grey between them. Both arms were validated
   as ordinal ramps against a white sheet. */
export const DIVERGING = [
  { limit: 0.6, fill: '#184f95', ink: '#ffffff', label: 'under 60%' },
  { limit: 0.85, fill: '#3987e5', ink: '#16181d', label: '60 to 85%' },
  { limit: 0.95, fill: '#86b6ef', ink: '#16181d', label: '85 to 95%' },
  { limit: 1.05, fill: '#f0efec', ink: '#16181d', label: '95 to 105%' },
  { limit: 1.15, fill: '#eda3a3', ink: '#16181d', label: '105 to 115%' },
  { limit: 1.4, fill: '#e06a6a', ink: '#16181d', label: '115 to 140%' },
  { limit: Infinity, fill: '#b83232', ink: '#ffffff', label: 'over 140%' },
] as const

export function band(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio)) {
    return { fill: '#ffffff', ink: '#5c6270', label: 'not declared' }
  }
  return DIVERGING.find((b) => ratio < b.limit) ?? DIVERGING[DIVERGING.length - 1]
}

/** A brand past the eighth rank carries the de-emphasis grey rather than a ninth hue. */
export function brandFill(slot: number): string {
  return slot < SERIES.length ? SERIES[slot] : DEEMPH
}

/** Three sites so the all pairs check holds on a scatter. */
export function siteFill(index: number): string {
  return SERIES[index % 3]
}
