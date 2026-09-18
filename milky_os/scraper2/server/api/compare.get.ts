/* One age step and one nutrient on one scale. */
export default defineEventHandler(async (event) => {
  const set = await dataset()
  const query = getQuery(event)
  const stage = String(query.stage || set.stages[0])
  const nutrient = String(query.nutrient || set.nutrients[0].name)
  const unit = set.nutrients.find((n) => n.name === nutrient)?.unit || ''
  const slots = new Map(set.brands.map((b) => [b.name, b.slot]))

  const step = stageOf(set, stage)
  const rows = step
    .filter((a) => a.values[nutrient] !== undefined)
    .map((a) => ({
      dan: a.dan,
      brand: a.brand,
      slot: slots.get(a.brand) ?? 7,
      variant: a.variant,
      size: a.size,
      url: a.url,
      value: a.values[nutrient],
      text: a.texts[nutrient],
      ratio: share(set, a, nutrient),
      kilo_price: a.kilo_price,
      price_ratio: a.kilo_price && set.medians[stage]?.__price__
        ? a.kilo_price / set.medians[stage].__price__ : null,
    }))
    .sort((a, b) => b.value - a.value)

  return {
    stage, nutrient, unit,
    median: set.medians[stage]?.[nutrient] ?? null,
    median_price: set.medians[stage]?.__price__ ?? null,
    rows,
    silent: step.filter((a) => a.values[nutrient] === undefined)
      .map((a) => ({ dan: a.dan, brand: a.brand, variant: a.variant })),
    stages: set.stages,
    nutrients: set.nutrients,
  }
})
