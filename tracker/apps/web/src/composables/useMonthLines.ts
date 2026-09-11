// Which theme line stands for which cost centre in the open month.
//
// The board draws a line down the edge of every chip and the legend names what
// each one is. The two read this rather than each working it out. Because a) the
// order is first appearance in the month and a second pass over the rows could
// disagree with the first. b) the legend now stands outside the board so it has
// no board to ask.

import { computed } from 'vue'

import { halfDays } from '@/composables/useTimesheet'

/**
 * How many lines the theme has.
 *
 * A theme line down the edge of a Warm Grey chip tells one cost centre from
 * another. No shade is invented so no brand owner has to approve anything. A
 * line may be Bright Blue where text may not.
 *
 * Five lines separate. A sixth cost centre falls back to the plain chip and the
 * number does the work. The one cost is Vibrant Orange. It is reserved for the
 * primary action so the fifth line spends that reservation. Dropping it leaves
 * four.
 */
export const LINES = 5

/** Order of first appearance in the month. */
export const lineOf = computed(() => {
  const order = new Map<string, number>()
  for (const half of halfDays.value) {
    if (half.workdayId === null) continue
    if (!order.has(half.workdayId)) order.set(half.workdayId, order.size)
  }
  return order
})

export function lineClass(workdayId: string | null): string {
  const at = workdayId === null ? undefined : lineOf.value.get(workdayId)
  return at !== undefined && at < LINES ? `line-${at}` : ''
}

/** The cost centres the month books. The legend names the lines. */
export const monthLines = computed(() =>
  [...lineOf.value.keys()].map((id) => ({ id, line: lineClass(id) })),
)
