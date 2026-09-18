/* Every nutrient of one age step as a share of that step median. */
export default defineEventHandler(async (event) => {
  const set = await dataset()
  const query = getQuery(event)
  const stage = String(query.stage || set.stages[0])
  const step = stageOf(set, stage)
  const middles = set.medians[stage] || {}
  const columns = set.nutrients.filter((n) => middles[n.name] !== undefined)
  const slots = new Map(set.brands.map((b) => [b.name, b.slot]))

  return {
    stage,
    columns,
    median_price: middles.__price__ ?? null,
    rows: step.map((a) => ({
      dan: a.dan,
      brand: a.brand,
      slot: slots.get(a.brand) ?? 7,
      variant: a.variant,
      size: a.size,
      kilo_price: a.kilo_price,
      price_ratio: a.kilo_price && middles.__price__ ? a.kilo_price / middles.__price__ : null,
      cells: columns.map((n) => ({
        nutrient: n.name,
        ratio: share(set, a, n.name),
        text: a.texts[n.name] ?? null,
      })),
    })),
    stages: set.stages,
  }
})
