export default defineEventHandler(async () => {
  const set = await dataset()
  const priced = set.articles.filter((a) => a.kilo_price !== null)
  const kilos = priced.map((a) => a.kilo_price as number).sort((a, b) => a - b)
  const middle = kilos.length ? kilos[Math.floor(kilos.length / 2)] : null
  return {
    gathered_on: set.gathered_on,
    articles: set.articles.length,
    brands: set.brands,
    stages: set.stages.map((stage) => ({
      name: stage,
      articles: set.articles.filter((a) => a.stage === stage).length,
      median_price: set.medians[stage]?.__price__ || null,
    })),
    nutrients: set.nutrients.length,
    sites: set.sites,
    priced: priced.length,
    median_kilo: middle,
    cheapest: priced.slice().sort((a, b) => (a.kilo_price! - b.kilo_price!)).slice(0, 5)
      .map((a) => ({ dan: a.dan, brand: a.brand, variant: a.variant, stage: a.stage, kilo_price: a.kilo_price })),
    dearest: priced.slice().sort((a, b) => (b.kilo_price! - a.kilo_price!)).slice(0, 5)
      .map((a) => ({ dan: a.dan, brand: a.brand, variant: a.variant, stage: a.stage, kilo_price: a.kilo_price })),
  }
})
