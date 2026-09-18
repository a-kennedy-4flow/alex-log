/* One age step drawn as stars against the breast milk of the same age.

   An arm is how many times the milk of that age a pack declares, so the reference is a
   circle at one and every shape is read against it. */
export default defineEventHandler(async (event) => {
  const set = await dataset()
  const asked = getQuery(event)
  const paired = set.against || []
  if (!paired.length) throw createError({ statusCode: 404, statusMessage: 'no pairing' })

  const step = paired.find((p) => p.stage === asked.stage) || paired[0]
  const key = typeof asked.spokes === 'string' && SPOKES[asked.spokes] ? asked.spokes : 'headline'
  const held = new Map(step.nutrients.map((n) => [n.name, n]))
  const axes = SPOKES[key].names.map((name) => held.get(name)).filter(Boolean)

  const slotOf = new Map(set.brands.map((b) => [b.name, b.slot]))
  const arms = (values: Record<string, number>) =>
    axes.map((n) => {
      const v = values[n!.name]
      return v === undefined || !n!.milk.median ? null : v / n!.milk.median
    })

  /* The reference is breast milk up to 8,5 months and cow milk from the twelfth on. */
  const wanted = new Set(step.windows)
  const windows = set.articles
    .filter((a) => a.stage === step.reference && wanted.has(a.variant))
    .map((a) => ({ dan: a.dan, variant: a.variant, arms: arms(a.values) }))

  const packs = set.articles
    .filter((a) => a.stage === step.stage)
    .sort((a, b) => (a.brand + a.variant).localeCompare(b.brand + b.variant, 'de'))
    .map((a) => ({
      dan: a.dan, brand: a.brand, variant: a.variant || a.name, size: a.size,
      slot: slotOf.get(a.brand) ?? 99, arms: arms(a.values),
    }))

  const brands: { name: string; slot: number; packs: number }[] = []
  for (const pack of packs) {
    const found = brands.find((b) => b.name === pack.brand)
    if (found) found.packs += 1
    else brands.push({ name: pack.brand, slot: pack.slot, packs: 1 })
  }

  return {
    stage: step.stage,
    reference: step.reference,
    noneOfIt: step.none_of_it || [],
    stages: paired.map((p) => p.stage),
    spokes: key,
    groups: Object.entries(SPOKES).map(([k, one]) => ({ key: k, label: one.label })),
    months: { from: step.from, to: step.to },
    axes: axes.map((n) => ({
      name: n!.name, unit: n!.unit,
      milk: n!.milk.median,
      /* the milk of this age is not one number so the band is its own spread */
      low: n!.milk.low / n!.milk.median, high: n!.milk.high / n!.milk.median,
    })),
    windows,
    packs,
    brands,
  }
})
