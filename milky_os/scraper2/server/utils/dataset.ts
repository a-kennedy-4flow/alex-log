/* Reads the exported dataset once per process.

   Because a) the file is written by the Python exporter and never changes while the server
   runs b) every route needs the same figures c) one parse keeps a server render inside a
   few milliseconds. */

export interface Offer {
  site: string
  title: string
  price: number
  currency: string
  grams: number | null
  per_kilo: number | null
  url: string
  matched: string
  score: number
}

export interface Article {
  dan: number
  brand: string
  variant: string
  name: string
  size: string
  url: string
  stage: string
  values: Record<string, number>
  texts: Record<string, string>
  cites?: Record<string, string>
  offers: Offer[]
  kilo_price: number | null
  price: number | null
}

export interface Nutrient { name: string; unit: string }
export interface Brand { name: string; articles: number; slot: number }

export interface Dataset {
  gathered_on: string
  stages: string[]
  nutrients: Nutrient[]
  brands: Brand[]
  articles: Article[]
  medians: Record<string, Record<string, number>>
  skipped: { brand: string; name: string; dan: number }[]
  sites: { name: string; offers: number }[]
  sources?: Record<string, Source>
  warnings?: Record<string, { from_month: number; says: string; source: string }>
  against?: Pair[]
  windows?: Window[]
}

/** One formula step beside the lactation windows a baby of that age would drink. */
export interface Pair {
  stage: string
  reference: string
  none_of_it?: string[]
  from: number
  to: number | null
  windows: string[]
  articles: number
  nutrients: {
    name: string
    unit: string
    milk: { median: number; low: number; high: number; count: number }
    field: { median: number; low: number; high: number; count: number }
  }[]
}

/** One lactation window with the months it covers. */
export interface Window {
  dan: number
  variant: string
  from: number
  to: number
}

/** One published study behind one figure. */
export interface Source {
  citation: string
  doi?: string
  url?: string
  pmcid?: string
  table?: string
  measured?: string
  period?: string
  quote?: string
  note?: string
  corrigendum?: string
  by_month?: boolean
}

let held: Dataset | null = null

export async function dataset(): Promise<Dataset> {
  if (held) return held
  const raw = await useStorage('assets:server').getItem('dataset.json')
  held = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Dataset
  return held
}

export function stageOf(set: Dataset, stage: string): Article[] {
  return set.articles.filter((a) => a.stage === stage)
}

/** Share of the step median one article declares for one nutrient. */
export function share(set: Dataset, article: Article, nutrient: string): number | null {
  const middle = set.medians[article.stage]?.[nutrient]
  const value = article.values[nutrient]
  if (!middle || value === undefined) return null
  return value / middle
}
