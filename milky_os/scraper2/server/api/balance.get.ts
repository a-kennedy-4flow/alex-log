/* The lean. Which packs sit above the field and which below.

   Every nutrient of the step is sorted into the seven bands. The bar is centred so what
   sits below the median stacks left and what sits above stacks right. The lean is the
   count above less the count below over the count held.

   A diverging stacked bar rather than a dot plot. Because a) the reader is asking about a
   whole recipe rather than one nutrient b) a share of an ordered scale centred on neutral
   is what this form is for c) the same diverging ramp already carries the bands. */

const LIMITS = [0.6, 0.85, 0.95, 1.05, 1.15, 1.4]

function bandOf(ratio: number): number {
  for (let i = 0; i < LIMITS.length; i++) if (ratio < LIMITS[i]) return i
  return LIMITS.length
}

export default defineEventHandler(async (event) => {
  const set = await dataset()
  const query = getQuery(event)
  const stage = String(query.stage || set.stages[0])
  const middles = set.medians[stage] || {}
  const counted = set.nutrients.filter((n) => middles[n.name] !== undefined)
  const slots = new Map(set.brands.map((b) => [b.name, b.slot]))

  const measured = stageOf(set, stage).map((a) => {
    const counts = [0, 0, 0, 0, 0, 0, 0]
    let held = 0
    for (const n of counted) {
      const value = a.values[n.name]
      if (value === undefined) continue
      counts[bandOf(value / middles[n.name])] += 1
      held += 1
    }
    const under = counts[0] + counts[1] + counts[2]
    const over = counts[4] + counts[5] + counts[6]
    return {
      dan: a.dan,
      brand: a.brand,
      slot: slots.get(a.brand) ?? 8,
      variant: a.variant,
      size: a.size,
      kilo_price: a.kilo_price,
      price_ratio: a.kilo_price && middles.__price__ ? a.kilo_price / middles.__price__ : null,
      counts,
      held,
      under,
      over,
      lean: held ? ((over - under) / held) * 100 : 0,
    }
  }).filter((m) => m.held).sort((a, b) => b.lean - a.lean)

  // One scale for every bar. Because a) each half of the track is half the width b) a pack
  // with four fifths of its nutrients under the median would overrun its half c) the widest
  // half in the field is what both halves are measured in.
  const widest = Math.max(
    0.01,
    ...measured.map((m) => Math.max(
      (m.counts[0] + m.counts[1] + m.counts[2] + m.counts[3] / 2) / m.held,
      (m.counts[4] + m.counts[5] + m.counts[6] + m.counts[3] / 2) / m.held,
    )),
  )

  return { stage, stages: set.stages, rows: measured, widest, nutrients: counted.length }
})
