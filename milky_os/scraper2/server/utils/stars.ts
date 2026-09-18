/* Which nutrients a star draws an arm for.

   Because a) forty spokes on one circle is a smudge b) a shape only reads once the arms
   are far apart c) the whole declaration is already on the period table. */
export const SPOKES: Record<string, { label: string; names: string[] }> = {
  headline: {
    label: 'Die zwölf',
    names: ['Brennwert', 'Eiweiß', 'Fett', 'Kohlenhydrate', 'Calcium', 'Eisen', 'Zink',
            'Jod', 'Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin B 12'],
  },
  macros: {
    label: 'Makronährstoffe',
    names: ['Brennwert', 'Fett', 'davon gesättigte Fettsäuren',
            'davon einfach ungesättigte Fettsäuren', 'davon mehrfach ungesättigte Fettsäuren',
            'Kohlenhydrate', 'davon Zucker', 'Laktose', 'Eiweiß'],
  },
  minerals: {
    label: 'Mineralstoffe',
    names: ['Natrium', 'Kalium', 'Calcium', 'Magnesium', 'Phosphor', 'Eisen', 'Zink',
            'Kupfer', 'Jod', 'Selen', 'Mangan', 'Chlorid'],
  },
  vitamins: {
    label: 'Vitamine',
    names: ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Folat',
            'Vitamin B 1, Thiamin', 'Vitamin B 2, Riboflavin', 'Vitamin B 6',
            'Vitamin B 12', 'Niacin', 'Pantothensäure', 'Biotin'],
  },
}
