/* What each shop asks for the same pack. */
export default defineEventHandler(async (event) => {
  const set = await dataset()
  const query = getQuery(event)
  const stage = String(query.stage || 'alle')
  const sites = set.sites.map((s) => s.name)
  const wanted = stage === 'alle' ? set.articles : stageOf(set, stage)
  const slots = new Map(set.brands.map((b) => [b.name, b.slot]))

  const rows = wanted.map((a) => {
    const byName = new Map(a.offers.map((o) => [o.site, o]))
    const kilos = a.offers.map((o) => o.per_kilo).filter((v): v is number => v !== null)
    return {
      dan: a.dan,
      brand: a.brand,
      slot: slots.get(a.brand) ?? 7,
      variant: a.variant,
      stage: a.stage,
      size: a.size,
      url: a.url,
      kilo_price: a.kilo_price,
      spread: kilos.length > 1 ? Math.max(...kilos) - Math.min(...kilos) : null,
      price_ratio: a.kilo_price && set.medians[a.stage]?.__price__
        ? a.kilo_price / set.medians[a.stage].__price__ : null,
      offers: sites.map((site) => byName.get(site) ?? null),
    }
  }).filter((r) => r.offers.some((o) => o !== null))
    .sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1))

  return { stage, sites, rows, stages: set.stages, medians: set.medians }
})
