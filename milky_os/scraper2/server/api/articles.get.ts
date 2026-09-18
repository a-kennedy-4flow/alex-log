/* The register of every comparable article. */
export default defineEventHandler(async (event) => {
  const set = await dataset()
  const query = getQuery(event)
  const needle = String(query.q || '').trim().toLowerCase()
  const stage = String(query.stage || '')
  const slots = new Map(set.brands.map((b) => [b.name, b.slot]))

  const rows = set.articles
    .filter((a) => !stage || a.stage === stage)
    .filter((a) => !needle
      || a.name.toLowerCase().includes(needle)
      || a.brand.toLowerCase().includes(needle)
      || String(a.dan).includes(needle))
    .map((a) => ({
      dan: a.dan,
      brand: a.brand,
      slot: slots.get(a.brand) ?? 7,
      variant: a.variant,
      name: a.name,
      size: a.size,
      stage: a.stage,
      url: a.url,
      energy: a.values['Brennwert'] ?? null,
      protein: a.values['Eiweiß'] ?? null,
      fat: a.values['Fett'] ?? null,
      kilo_price: a.kilo_price,
      price: a.price,
      shops: a.offers.length,
      price_ratio: a.kilo_price && set.medians[a.stage]?.__price__
        ? a.kilo_price / set.medians[a.stage].__price__ : null,
    }))

  const brands = set.brands.map((b) => ({
    ...b,
    shown: rows.filter((r) => r.brand === b.name).length,
  })).filter((b) => b.shown > 0)

  return { rows, brands, stages: set.stages, gathered_on: set.gathered_on, total: set.articles.length }
})
