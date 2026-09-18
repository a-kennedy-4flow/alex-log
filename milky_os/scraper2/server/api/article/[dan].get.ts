/* One pack against the median of its own age step. */
export default defineEventHandler(async (event) => {
  const set = await dataset()
  const dan = Number(getRouterParam(event, 'dan'))
  const article = set.articles.find((a) => a.dan === dan)
  if (!article) throw createError({ statusCode: 404, statusMessage: 'no such article' })
  const middles = set.medians[article.stage] || {}
  return {
    article: {
      dan: article.dan, brand: article.brand, variant: article.variant, name: article.name,
      size: article.size, stage: article.stage, url: article.url,
      kilo_price: article.kilo_price, price: article.price, offers: article.offers,
    },
    median_price: middles.__price__ ?? null,
    rows: set.nutrients
      .filter((n) => article.values[n.name] !== undefined && middles[n.name] !== undefined)
      .map((n) => ({
        nutrient: n.name,
        unit: n.unit,
        value: article.values[n.name],
        text: article.texts[n.name],
        median: middles[n.name],
        ratio: article.values[n.name] / middles[n.name],
        source: article.cites?.[n.name] ?? null,
      })),
    silent: set.nutrients
      .filter((n) => article.values[n.name] === undefined && middles[n.name] !== undefined)
      .map((n) => n.name),
    peers: stageOf(set, article.stage).length,
    /* A figure nobody can trace back is a figure nobody can check. A dm pack cites the
       page it was collected from and a reference window cites the paper behind each row. */
    origin: article.cites && Object.keys(article.cites).length
      ? { kind: 'science', gathered_on: set.gathered_on }
      : { kind: 'dm', url: article.url, gathered_on: set.gathered_on },
    /* A reference can carry a caution that has nothing to do with any one figure. */
    warning: (() => {
      const one = (set.warnings || {})[article.stage]
      if (!one) return null
      return { ...one, cite: set.sources?.[one.source] || null }
    })(),
    cited: [...new Set(Object.values(article.cites || {}))].map((key) => ({
      key,
      ...(set.sources?.[key] || {}),
    })),
  }
})
