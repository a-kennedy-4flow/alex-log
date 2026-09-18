# dmscrape

Collects the name and the nutrition declaration of every article in a dm category.
It was built for Babymilch which is category `050502`.

Everything runs on the standard library. No key and no browser is needed.

## Terms

A **DAN** is the dm article number. It names one article across the whole site.
A **GTIN** is the barcode number printed on the pack.
A **declaration** is the nutrition table as dm publishes it.
A **basis** is a column heading of that table such as `pro 100 ml`.
A **nutrient** is one printed row of that table.
A **measurement** is what one nutrient declares under one basis.
A **repack** is one recipe the brand sells again in another pack size.
A **lactation window** is one of the ten age bands the MILQ study publishes a figure for.
A **reference article** is breast milk over one lactation window rather than a dm pack.

## Install

Nothing to install. It was built and tested on python 3.12.

```sh
./setup.sh
```

That builds `.venv` with pytest for the tests alone.

## Use

```sh
python3 -m dmscrape                                   # the whole Babymilch category into products.json
python3 -m dmscrape --csv nutrition.csv               # also one row per declared number
python3 -m dmscrape --dan 1230306 --out - --report    # one article as a readable table
python3 -m dmscrape --limit 5                         # a short run while developing
python3 -m dmscrape --category 050503 --csv other.csv # any other dm category code
python3 tools/fetch_breastmilk.py                     # the breast milk reference into breastmilk.json
python3 tools/fetch_cowmilk.py                        # the cow milk reference into cowmilk.json
python3 tools/fetch_nutrients.py                      # one encyclopedia description per name
python3 tools/fetch_requirements.py                   # the adequate intake and the absorption
python3 tools/publish.py                              # copy the built pages where the app serves them
```

The report form:

```
Bebivita Folgemilch 3 ab dem 10.Monat, 500 g  [dan 1230306]
  legal category  Folgenahrung
  net quantity    500 g
  url             https://www.dm.de/p/d/1230306/bebivita-folgemilch-3-ab-dem-10-monat
  Durchschnittliche Nährwertangaben
                                 pro 100 ml des verzehrfertigen Erzeugnisses
    Brennwert                                               285 kJ / 68 kcal
    Fett                                                               3,7 g
    davon gesättigte Fettsäuren                                        1,6 g
    Fluorid                                                        < 0,01 mg
    Folsäure                                                           10 µg
```

An article that declares two bases prints two columns.

```
Aptamil Spezialnahrung Anti-Reflux von Geburt an, 800 g  [dan 1620675]
  legal category  Diätetisches Lebensmittel
  net quantity    800 g
  url             https://www.dm.de/p/d/1620675/aptamil-spezialnahrung-anti-reflux-von-geburt-an
  Durchschnittliche Nährwertangaben
                                                                   pro 100 g                         pro 100 ml
    Brennwert                                            2.024 kJ / 484 kcal                   276 kJ / 66 kcal
    Fett                                                              24,7 g                              3,4 g
    davon gesättigte Fettsäuren                                         11 g                              1,5 g
```

## Where the data comes from

The page in the browser is a shell. Because a) the listing and the declaration arrive as
JSON after first paint b) the served HTML holds neither of them c) the scraper asks the
two services directly and parses no HTML at all.

| what | request |
| --- | --- |
| listing | `GET product-search.services.dmtech.com/de/search/crawl?allCategories.id=050502&currentPage=0&pageSize=100` |
| article | `GET products.dm.de/product/products/detail/DE/dan/{dan}` |

The listing gives the article numbers. The article gives the name the pack size the
legal category and the declaration under the `Nährwerte` heading.

## Pace

The search service answers `429` under a burst and sends no `Retry-After` header. The
client holds a gap of one second between requests. Each refusal doubles the wait with a
little jitter. A full run of the 137 Babymilch articles takes about two minutes twenty.

Raise `--gap` to be gentler. Lower `--tries` to fail sooner.

## Cache

Every response body is kept under `.cache` keyed by URL. A second run costs no requests
at all. Pass `--no-cache` to always ask the service.

## Output

`products.json` holds the whole run.

```json
{
  "count": 137,
  "products": [
    {
      "dan": 1230306,
      "gtin": 4018852021117,
      "brand": "Bebivita",
      "name": "Folgemilch 3 ab dem 10.Monat, 500 g",
      "full_name": "Bebivita Folgemilch 3 ab dem 10.Monat, 500 g",
      "legal_category": "Folgenahrung",
      "net_quantity": "500 g",
      "category": "Baby & Kind > Babynahrung & Getränke > Babymilch",
      "url": "https://www.dm.de/p/d/1230306/bebivita-folgemilch-3-ab-dem-10-monat",
      "nutrition": {
        "caption": "Durchschnittliche Nährwertangaben",
        "bases": ["pro 100 ml des verzehrfertigen Erzeugnisses"],
        "nutrients": [
          {
            "name": "Brennwert",
            "measurements": [
              {
                "basis": "pro 100 ml des verzehrfertigen Erzeugnisses",
                "text": "285 kJ / 68 kcal",
                "quantities": [
                  {"value": 285.0, "unit": "kJ", "qualifier": null},
                  {"value": 68.0, "unit": "kcal", "qualifier": null}
                ]
              }
            ]
          }
        ]
      }
    }
  ],
  "failures": []
}
```

`--csv` writes the same declarations one row per number. The columns are `dan` `gtin`
`brand` `name` `legal_category` `net_quantity` `url` `basis` `nutrient` `text` `value`
`unit` `qualifier`. An energy row therefore writes two rows. Because a) a cell can hold
two numbers in two units b) a cell can carry a limit such as `< 0,01 mg` c) one row per
number keeps every column of the file a single type.

The raw cell is always kept in `text`. Nothing the publisher wrote is thrown away.

## The page

```sh
python3 tools/make_page.py
```

That reads `products.json` and writes `index.html`. Everything sits inside that one file
of about 500 kB. Because a) it opens straight from the filesystem b) no server and no CDN
is involved c) it travels as a single attachment.

Articles sit under their brand with the largest brand first. A row prints the name the
pack size the legal category and the energy. Opening a row shows the whole declaration
with one column per basis. A nutrient the publisher left out under a basis shows an em
dash.

The ready to drink articles are left out. Because a) fifteen of them say trinkfertig in
the name b) the four Kindermilch cartons never say it yet they are sold by the litre c) a
pack size given as a volume settles those. That drops 19 articles and leaves 128 under 14
brands. Pass `--ready-to-drink` to keep them.

The repacks are left out too. Because a) six recipes are listed a second time as a bigger
tin b) the published name repeats up to that pack size c) the brand would be counted
twice under one recipe. The smallest pack of a recipe stays. A pack sold by mass is never
weighed against one sold by volume so the 200 ml Kindermilch carton never displaces the
800 g tin it is named after. That drops another six and leaves 122 under 14 brands. Pass
`--repacks` to keep them.

Neither filter touches the ten breast milk articles. Because a) a reference article has no
pack size for the volume rule to read b) it has no second pack size for the repack rule to
pair it with c) it is already the per 100 ml column both rules exist to protect.

The two tins do not always declare the same numbers. Five of the six pairs disagree on at
least one nutrient so the figure on the page is the one the smaller tin declares.

The filter box narrows by brand or name or article number. It hides the brands it empties
and it retallies every count. `index.html?q=ziegenmilch` opens already filtered.

The page follows the system light or dark setting. Every text pair clears WCAG AA in
both. It prints without the toolbar.

## Breast milk

```sh
python3 tools/fetch_breastmilk.py
```

That writes `breastmilk.json`. Every builder reads it and puts those articles in front of
the dm ones. Pass `--no-reference` to any builder to leave them out.

Breast milk is what every one of these recipes is written against. It is carried here as
a brand of its own called Muttermilch.

It is not one milk. It changes for as long as it is fed. Over the first eight months the
energy falls from 65,8 to 59,7 kcal per 100 ml and the protein from 1,25 to 0,78 g. The
iron falls by two fifths. One figure would have hidden all of that.

One lactation window is therefore one article. MILQ samples ten of them from the 4th day
to the 8,5th month so the brand holds ten articles the way Aptamil holds nineteen. The
window is the article name.

### Where the numbers come from

| source | what it gives | resolved by month |
| --- | --- | --- |
| MILQ macronutrients | energy protein fat carbohydrate | yes |
| MILQ minerals | nine minerals from sodium to selenium | yes |
| MILQ fat soluble vitamins | vitamin A vitamin E vitamin D | yes |
| MILQ B vitamins | B1 B2 B3 B6 B12 pantothenate biotin choline | yes |
| Hopperton 2026 | the fatty acids folate vitamin K iodine manganese chloride | no |
| Kenney 2025 | the six core oligosaccharides and their total | two points |
| LactMed | vitamin C | no |
| EFSA 2025 | fluoride | no |
| Yoshida 2008 | molybdenum chromium | no |
| Kim 1998 | taurine | two bands |
| Ogasa 1975 | inositol | three bands |
| Sandor 1982 | carnitine | two bands |

MILQ is the backbone. Because a) it is a reference value study rather than a synthesis
b) it measured 1242 well nourished mothers at four sites over the first 8,5 months
c) it publishes a percentile per nutrient per month so the change over lactation is in
the data rather than assumed. The figure taken is always the P50 of the window.

Every citation sits in `breastmilk.json` beside the numbers it produced.

> Lewis JI, Dror DK, Hampel D, Kac G, Mølgaard C, Moore SE, et al. Reference Values for
> Macronutrients in Human Milk: the Mothers, Infants and Lactation Quality (MILQ) Study.
> Adv Nutr. 2025;16(Suppl 1):100501. doi:10.1016/j.advnut.2025.100501

> Allen LH, Islam MM, Kac G, Michaelsen KF, Moore SE, Andersson M, et al. Reference
> Values for Minerals in Human Milk: the Mothers, Infants and Lactation Quality (MILQ)
> Study. Adv Nutr. 2025;16(Suppl 1):100431. doi:10.1016/j.advnut.2025.100431

> Kac G, Jones KS, Meadows SR, Hampel D, Islam MM, Mølgaard C, et al. Reference Values
> for Fat-Soluble Vitamins in Human Milk: The Mothers, Infants and Lactation Quality
> (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100484. doi:10.1016/j.advnut.2025.100484

> Allen LH, Shahab-Ferdows S, Moore SE, Peerson JM, Kac G, Figueiredo AC, et al.
> Reference Values for B Vitamins in Human Milk: The Mothers, Infants and Lactation
> Quality (MILQ) Study. Adv Nutr. 2025;16(Suppl 1):100500.
> doi:10.1016/j.advnut.2025.100500

> Hopperton KE, Thavarajah S, Ahuja J, Casavale K, Chakrabarti S, Gibbs K, et al.
> Literature-based human milk nutrient composition values for use in North American food
> composition databases. Am J Clin Nutr. 2026;123(5):101252.
> doi:10.1016/j.ajcnut.2026.101252

> Kenney AD, Sabag-Daigle A, Stoecklein MM, Buck RH, Reverri EJ. A review of human milk
> oligosaccharide concentrations of breast milk for infants and young children through 24
> months of age. Front Pediatr. 2025;13:1649609. doi:10.3389/fped.2025.1649609

> Vitamin C. Drugs and Lactation Database (LactMed) [Internet]. Bethesda (MD): National
> Institute of Child Health and Human Development; 2006-. Updated 2024 Jun 15.

> Ogasa K, Kuboyama M, Kiyosawa I, Suzuki T, Itoh M. The content of free and bound
> inositol in human and cow's milk. J Nutr Sci Vitaminol. 1975;21(2):129-135.
> doi:10.3177/jnsv.21.129

> Sandor A, Pecsuvac K, Kerner J, Alkonyi I. On carnitine content of the human breast
> milk. Pediatr Res. 1982;16(2):89-91. doi:10.1203/00006450-198202000-00001

> EFSA Scientific Committee. Updated consumer risk assessment of fluoride in food and
> drinking water including the contribution from other sources of oral exposure.
> EFSA J. 2025;23(7):e9478. doi:10.2903/j.efsa.2025.9478

> Yoshida M, Takada A, Hirose J, Endo M, Fukuwatari T, Shibata K. Molybdenum and chromium
> concentrations in breast milk from Japanese women.
> Biosci Biotechnol Biochem. 2008;72(8):2247-2250. doi:10.1271/bbb.80283

> Kim ES, Kim JS, Cho KH, Lee KH, Tamari Y. Quantitation of taurine and selenium levels in
> human milk and estimated intake of taurine by breast-fed infants during the early periods
> of lactation. Adv Exp Med Biol. 1998;442:477-486. doi:10.1007/978-1-4899-0117-0_57

> Frisbie SH, Mitchell EJ, Roudeau S, Domart F, Carmona A, Ortega R. Manganese levels in
> infant formula and young child nutritional beverages in the United States and France.
> PLoS One. 2019;14(11):e0223636. doi:10.1371/journal.pone.0223636

The minerals paper carries a corrigendum at doi:10.1016/j.advnut.2025.100578. It reprints
the two copper figures. No published concentration changed so the table stands.

The supplementary tables are read from Europe PMC rather than from PMC itself. Because
a) the monthly percentiles are only in the supplementary document b) PMC gates every
binary download behind a proof of work script a plain client cannot answer c) the Europe
PMC archive endpoint serves the same file untouched.

### Turning a published figure into a declared one

Four things happen to a number on the way in.

MILQ publishes per litre so a tenth of it is the per 100 ml column dm declares. Hopperton
publishes per 100 g and human milk runs 1,031 g per millilitre so 100 ml weighs 103,1 g.
Vitamin A arrives as retinol in mg per litre and vitamin D as antirachitic activity in
international units. Salt is sodium times 2,5 which is how a label derives it.

The energy is measured in kilocalories. The kilojoule beside it is that same figure at
4,184 kJ per kcal rather than a second measurement.

Carbohydrate was measured by near infrared spectroscopy and the paper names lactose the
principal carbohydrate of human milk. Kohlenhydrate and davon Zucker and Laktose
therefore carry one figure. The oligosaccharides sit outside it and are declared on their
own rows.

### The age step

Muttermilch is its own age step placed ahead of Pre. Because a) breast milk is not sold
for an age step b) reading it into the Pre step would move the median every other Pre
article is measured against c) its own step is the rung the formula steps climb from.

Picking that step on the dot plot draws the lactation curve rather than one mark. Picking
it on the heatmap draws every nutrient across the ten windows.

What the step ladder shows once the milk is the first rung.

| nutrient | Muttermilch | Pre | Kindermilch |
| --- | --- | --- | --- |
| Brennwert | 60,1 kcal | 66 kcal | 63 kcal |
| Eiweiß | 0,81 g | 1,3 g | 1,1 g |
| Calcium | 28,4 mg | 58 mg | 126 mg |
| Zink | 0,11 mg | 0,48 mg | 0,75 mg |
| Eisen | 0,023 mg | 0,53 mg | 1,2 mg |

Energy is the one figure a recipe matches. Iron is the one it does not. The Pre step
declares twenty three times the iron of the milk it is written against and Kindermilch
declares fifty two times. Because a) the iron of human milk is bound to lactoferrin and
largely absorbed b) the iron of a powder is not c) the regulated minimum is set against
that difference rather than against the declared figure.

### Every figure names its source

Opening any article on the page shows the declaration and a source list under it. Because
a) half the articles now rest on papers rather than on a pack b) a reader cannot weigh a
figure they cannot trace c) the two kinds must be told apart at a glance.

A reference article gains a `Src` column. Every row carries the number of the paper it came
from and the number links to the full citation under the table. A figure whose study
published a spread or a caveat carries it on hover.

A dm article names dm. It prints one sentence under the declaration with the article page
it was collected from and the day it was collected and the promise that nothing was
corrected.

The app does the same on `/article/{dan}`. The nutrient table gains a Quelle column and the
page ends with a Quellen block that is either the numbered papers or the dm sentence.

| what | where the figure comes from |
| --- | --- |
| a dm pack | the declaration dm publishes on its own article page |
| a Muttermilch window | one of twelve papers named per row |

The site footer used to say every figure was a dm figure. That stopped being true when
breast milk arrived so it now names both kinds.

### What the reference cannot do

A figure is declared on a window only where the source covers that window. The fatty
acids stop after the seventh month because Hopperton reads milk from 21 days to 7 months.
Vitamin D starts at the second month because MILQ censored the two early visits. The
oligosaccharides hold two windows because the review publishes colostrum and 6 months and
12 months. Nothing was stretched to fill a gap.

Four nutrients rest on older work. Inositol comes from 1975 and carnitine from 1982 and
taurine from 1998 and molybdenum and chromium from 2008. These are the best figures found
and the record says so on each one.

Vitamin C is the middle of the 50 to 90 mg per litre LactMed calls the average. A figure
whose source published a spread carries that spread beside it so the reader sees what was
chosen. Molybdenum and chromium are medians of 79 samples that run from under 0,1 to 25,9
and to 18,7 nanograms per millilitre.

Manganese is the weakest figure here. Hopperton reads 1,96 microgram per litre from one
study and a 2019 survey reports 3 to 6 for the same thing. It is also the widest bar on
the gap page and one of the two dm figures behind it is the published error named under
Limits. Both readings sit in the record.

Four rows a pack declares are not here at all and each absence is the right one.
Ballaststoffe because human milk carries no fibre in the labelling sense. Folsäure because
human milk carries natural folate which is declared as Folat gesamt. Galactooligosaccharide
and Fructooligosaccharide because they are added to a powder and human milk carries its own
oligosaccharides instead.

The parts do not sum the way a label does. The fat fractions come from Hopperton and the
total fat from MILQ so the three fractions add to 3,38 g against a declared 3,20 g. A
label is one laboratory on one sample. This is twelve studies laid side by side.

Taking a brand slot costs the eighth dm brand its hue on the app. Muttermilch holds ten
articles so it ranks fourth and the brand it displaces falls back to the de-emphasis grey.

## What each nutrient is

```sh
python3 tools/fetch_nutrients.py   # one encyclopedia description per name into nutrients.json
python3 tools/make_profiles.py     # profiles/index.html and one page per name
```

Sixty nine names appear on a pack or in the reference. Each one gets a page. Because a) a
reader who does not know what Pantothensäure is cannot weigh the figure beside it b) every
caveat this project has found belongs next to the number it applies to rather than in a
readme c) a name that was folded away still has to lead somewhere.

A profile holds four things.

| block | what it carries |
| --- | --- |
| What it is | the opening sentences of the encyclopedia article quoted whole |
| In breast milk | the figure for each of the ten lactation windows with the study under it |
| In the packs | what each age step declares and how many times the milk it is |
| What to watch | every caveat that figure carries |

The description is quoted rather than rewritten. Because a) Wikipedia text carries
CC BY-SA 4.0 which asks for attribution and share alike b) a paraphrase would drop the
attribution and keep the meaning c) a quote with the article and the revision beside it is
checkable. The quote is the first three sentences because the opening of an encyclopedia
article is the definition and a cut inside a sentence misquotes it.

Two names have no article of their own. The sialyllactoses stand under the human milk
oligosaccharide article because Wikipedia carries no page for them.

### What a baby needs and how much of it is absorbed

```sh
python3 tools/fetch_requirements.py   # the adequate intake and the absorption into requirements.json
```

A concentration on its own says nothing about whether a child is fed. Because a) a
nutrient only counts once it crosses the gut b) breast milk and a powder are absorbed at
very different rates c) a figure many times another is not many times better.

Every MILQ paper prints what breast milk delivers a day beside the adequate intake the
IOM sets. That gives a requirement for 24 nutrients from the series already cited. The
intake paper measured what a baby actually drinks so a figure a day becomes a figure per
100 ml: 818 g a day at 1 to 3,5 months which is 793 ml.

| what the profile shows | where it comes from |
| --- | --- |
| the adequate intake a day | the IOM column of each MILQ intake table |
| what breast milk delivers a day | the MILQ column beside it |
| what a feed therefore needs per 100 ml | the first divided by the measured volume |
| what each age step delivers as a share of that | the step median against that figure |

The iron page is the case that makes the point. A Pre pack carries 19,8 times the iron of
the milk and 1.560% of the adequate intake. Both numbers look damning until the third one
arrives. Because a) 47% of the iron in human milk is absorbed against 4,1% from a powder
b) a breastfed infant takes in 0,27 mg a day and absorbs 0,128 c) a formula fed infant
takes in 11,19 mg and absorbs 0,457. Formula carries 41 times the iron and delivers 3,6
times the absorbed iron.

> Stoffel NU, Cepeda-López AC, Zeder C, Herter-Aeberli I, Zimmermann MB. Measurement of
> iron absorption and iron gains from birth to 6 months in breastfed and formula-fed
> infants using iron isotope dilution. Sci Adv. 2024;10(28):eado4262.
> doi:10.1126/sciadv.ado4262

> Saarinen UM, Siimes MA, Dallman PR. Iron absorption in infants: high bioavailability of
> breast milk iron. J Pediatr. 1977;91(1):36-39. doi:10.1016/s0022-3476(77)80439-3

> Krebs NF, Reidinger CJ, Miller LV, Hambidge KM. Zinc homeostasis in breast-fed infants.
> Pediatr Res. 1996;39(4 Pt 1):661-665. doi:10.1203/00006450-199604000-00017

> Shertukde SP, Cahoon DS, Prado B, Cara KC, Chung M. Calcium Intake and Metabolism in
> Infants and Young Children: A Systematic Review of Balance Studies.
> Adv Nutr. 2022;13(5):1529-1553. doi:10.1093/advances/nmac003

### A milk under the intake is a question about the intake

An adequate intake for the first six months is worked out from what breast milk was
assumed to hold times an assumed 0,78 litres a day. Measuring breast milk against it is
therefore circular. Where the milk comes in under the figure that is evidence the assumed
composition is out of date and not evidence the milk is short. The milk of a healthy
mother is what adequate means at this age.

MILQ says so itself.

> Depending on the vitamin in question, the studies used for setting the AIs included as
> few as 5 women (riboflavin) and ≤111 women (vitamin B12) and were conducted between 1951
> and 1997. Thus, the current AIs are based on data from outdated studies with few
> participants, indicating the need for revision.

So riboflavin at 29% of its adequate intake and zinc at 55% are not deficiencies. They are
readings on a fifty year old assumption. The pages say that rather than the opposite.

Two requirements are different and the pages hold them apart. Because a) neither is
calculated from milk b) each is set from something that happens in the child c) for these
two the milk really does fall short and the remedy is not a powder.

| nutrient | set from | what closes the gap |
| --- | --- | --- |
| Vitamin D | the serum 25(OH)D a child has to hold | a supplement for the child |
| Vitamin K | the bleeding it prevents | an injection after birth |

> The primary source of vitamin D is cutaneous synthesis upon exposure to ultraviolet B
> (UVB) light; dietary intake is a secondary source. Human milk alone does not provide
> sufficient vitamin D to meet infant needs.

> Vitamin K was not included in the analyses because milk concentration is very low, and
> the recommendation is to provide an intramuscular injection to infants after birth.

Only three nutrients carry an absorption figure. The rest say plainly that no measurement
is carried and that the concentration is what is in the milk rather than what reaches the
child.

### What the caveats say

Each one is worked out from the data rather than written by hand.

| caveat | when it appears |
| --- | --- |
| this row gathers more than one name | the name is one the fold keeps |
| counted under another name | the name is one the fold absorbs |
| no chart draws this | under half the field prints it and no fold explains it |
| breast milk carries no figure | no source measures it in human milk |
| no figure for N windows | the study behind it does not reach them |
| the study published a spread | the source gave a range and one number was taken from it |
| does not change with the month | the source publishes one figure for mature milk |
| a published error | a pack declares over twenty times the median of its own step |
| a concentration is not what reaches the child | an absorption figure is carried for it |
| the intake is the thing in question | breast milk delivers under 90% of an intake calculated from milk |
| the milk really does fall short | the requirement is set from an outcome rather than from milk |

The last one finds both dm errors on its own. Aptamil FMS Muttermilchsupplement declares
4 mg of manganese against a Spezialnahrung median of 0,022 mg which is 182 times it. It is
named on the manganese page and passed through untouched.

## Cow milk

```sh
python3 tools/fetch_cowmilk.py
```

That writes `cowmilk.json`. Whole milk is what a child moves on to after the last
Kindermilch so it is the reference the twelve month steps are read against. It is one
article rather than ten. Because a) a cow is not a mother b) the record is one composition
c) it does not change with the age of the child.

The record is the unfortified whole milk of FoodData Central. Because a) German Vollmilch
carries no added vitamin A or D b) the fortified record would credit it with both c) an
open record with an identifier can be checked.

> Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D. FoodData Central SR
> Legacy, FDC ID 172217. Washington (DC): US Department of Agriculture, Agricultural
> Research Service; 2019.

### It is not a milk for an infant

That is the first thing its article page says and it carries the position paper under it.

> Unmodified cow's milk should not be fed as the main milk drink to infants before the age
> of 12 months and intake should be limited to <500 mL/day in toddlers.

> Domellöf M, Braegger C, Campoy C, Colomb V, Decsi T, Fewtrell M, et al. Iron requirements
> of infants and toddlers. A position paper by the ESPGHAN Committee on Nutrition.
> J Pediatr Gastroenterol Nutr. 2014;58(1):119-129. doi:10.1097/mpg.0000000000000206

### What the pairing now reaches

A step pairs with whichever reference covers the months it is sold for. Breast milk covers
the lactation windows the study reached and cow milk covers from the twelfth month on.

| step | months | reference |
| --- | --- | --- |
| Pre and 1 and Spezialnahrung | 0 to 6 | Muttermilch over seven windows |
| 2 | 6 to 10 | Muttermilch over three windows |
| 3 | 10 to 12 | neither |
| 4 and Kindermilch | 12 on | Kuhmilch |

Stage 3 still reaches neither. Because a) the study stops at 8,5 months b) cow milk starts
at twelve c) nothing was stretched over the two months between.

What the new pair finds is the claim a Kindermilch is sold on. It carries 38,7 times the
iron of whole milk and 22,3 times the vitamin D and a third of the protein. The energy is
the same to within a percent and the sugar is half again as much.

Cow milk declares no vitamin C and no fibre at all, so a ratio against it would be
infinite. Those are named under the chart rather than divided by.

### What it costs

A United States record stands for a German shelf. German Vollmilch is sold at 3,5% fat
against the 3,25% of the record and neither is fortified.

The record works its carbohydrate out by difference and measures its sugars, so the sugars
come out above the total. Both are passed through as published and the row says so.

The record carries no iodine and no chloride and no biotin so those rows are missing rather
than zero.

## Comparing like with like

```sh
python3 tools/make_chart.py
```

That writes `compare.html`. An **age step** is Pre 1 2 3 4 Kindermilch or Spezialnahrung
as the pack name declares it. Muttermilch is the eighth step and it is read off the brand
rather than off a name. Pick a step and a nutrient and every powder article of that step
lands on one scale. Pick the Muttermilch step and the ten lactation windows land on it
instead so the scale carries the change over lactation.

Three things make the comparison fair. Because a) only the per 100 ml column counts so a
powder is never measured against a prepared bottle b) one unit is chosen per nutrient so
a brand printing DHA in grams lands beside one printing milligrams c) an article that
never declares the nutrient is named under the chart instead of drawn as a zero.

The repacks are left out here as well so one recipe holds one dot.

The form is a dot plot and not a bar chart. Because a) the declared values inside a step
sit in a narrow regulated band so Pre energy runs 65 to 67 kcal across twenty six
articles b) twenty six bars drawn from zero would look identical c) a dot carries position so the
scale can span the step while the subtitle states where it starts.

Clicking a row pins it. The pinned rows keep the colour and the rest fall back so two
packs read against the field. The address bar carries the state so a comparison travels:
`compare.html?stage=Pre&nutrient=Eisen&pick=1452404,1610288`.

Switch View to Table for the same figures with the declared text beside each one.

The mark colour clears the contrast and colour vision checks in both light and dark. One
series carries one hue so no legend is needed and the title names what is plotted.

### What the comparison cannot do

Nutrients match on the declared name. Two pairs of names are folded first because each
pair is one substance.

| printed as | folded onto | why |
| --- | --- | --- |
| `davon Milchzucker` 39 packs | `Laktose` | Milchzucker is milk sugar. No pack prints both so neither can be a fraction of the other. 83 and 39 make exactly the 122 that print either. |
| `Folsäure` 93 packs | `Folat` | Folic acid is a folate. Thirteen packs print both so the total is taken where they do. |

Without the fold each name is counted apart and each falls under the half of a step a
nutrient needs to be drawn. Lactose was drawn off 17 of the 26 Pre packs rather than all
26. Folate was drawn off `Folsäure` alone which human milk never carries so breast milk
read as declaring no folate at all. It carries 7,69 µg against 13,6 in the Pre step.

Every other name was checked for the same fault. Nothing else folds onto anything.

Three Spezialnahrung articles declare only per 100 g. They are left out and counted in
the header.

The age step is read off the pack name. Spezialnahrung is held apart from the ordinary
steps because a medical food is not a like for like match.

Breast milk never joins a formula step so no dot plot of a step holds it. The four options
under `views/` that pair a step with the milk of the same age are where the two meet.

## Every nutrient at once

```sh
python3 tools/make_views.py
```

That writes `views/index.html` and the sixteen option pages beside it. Seven hold one age
step and show every nutrient of it. Six hold a step beside the breast milk of the same
age. Three hold every step so Muttermilch and Pre 1 2 3 4 and Kindermilch read against
each other.

Most of them draw a value as its share of a median. Because a) the nutrients run from
0,001 mg to 500 kcal so one raw axis is unreadable b) two axes on one plot would invent a
relation that is not in the data c) the median is a figure the reader can name.

One age step at a time.

| option | what it answers | what it costs |
| --- | --- | --- |
| `panels.html` small multiples | where a pack sits on each nutrient in the declared unit | every panel holds its own scale so a dot in one says nothing about a dot in the next |
| `indexed.html` one shared axis | which nutrients the brands differ on | the axis carries a share so the declared figure only appears on hover or in the table |
| `heatmap.html` the whole matrix | which article is unlike the field and where | colour carries the value so the cell holds no number |
| `profiles.html` one line per article | what shape a recipe has | twenty six lines cross so one line only reads once it is held |
| `spread.html` what is settled | which nutrients the recipe settles and which the brands are free on | one published error stretches a whole bar |
| `card.html` one pack | what actually makes one pack different | one pack at a time against the median of its own step |
| `balance.html` the lean | which brands are generous across the whole table | a band counts a nutrient rather than weighing it |

Against the breast milk of the same age. A step is paired with the lactation windows a
baby of that age would be drinking. Because a) every pack declares the month it is sold
from b) every lactation window declares both of its ends c) a step and a window that
cover the same month are the only like for like the two kinds of milk allow.

| option | what it answers | what it costs |
| --- | --- | --- |
| `gap.html` how far the step sits | which nutrients a step copies from the milk and which it departs from | a ratio hides the declared figure so a microgram reads as loudly as protein |
| `beside.html` the milk beside the step | what the two actually declare rather than how many times one is the other | every panel holds its own scale so a gap in one says nothing about a gap in the next |
| `lifetime.html` the first year | what a child drinks through the first year either way | one nutrient at a time and a step is drawn as one block so the recipe appears to change on a birthday |
| `closest.html` which pack sits nearest | which tin on the shelf is nearest the milk across the whole table | one number flattens forty nutrients and weighs vitamin K as much as fat |
| `periods.html` the period table | what the milk holds at each period of lactation and what the packs of that age hold beside it | a step is one median so the spread inside it is gone |
| `stars.html` the star wall | what shape each recipe of a step has against the milk and how two of them differ | twelve spokes out of forty so the shape is a choice |

Four steps pair and three do not. Pre and stage 1 and Spezialnahrung pair with the seven
windows up to the sixth month. Stage 2 pairs with the three windows from the sixth. Stage
3 and stage 4 and Kindermilch pair with nothing because the study stops at 8,5 months.
Nothing was stretched to cover them.

What the pairing finds. A Pre recipe carries 1,08 times the energy of the milk it
imitates and 20 times the iron. Vitamin K runs 26 times and vitamin D 20 times. Inositol
runs the other way at 0,38 times. Because a) the iron and the zinc of human milk are
bound to proteins that carry them across the gut b) the same dose in a powder is not
c) the regulated minimum is set against that difference rather than against the declared
figure.

Across the age steps. Spezialnahrung is left out of these three. Because a) it is a
medical food b) it is not the next milk of a growing child c) holding it beside stage 2
would read as a step in the same ladder.

| option | what it answers | what it costs |
| --- | --- | --- |
| `ladder.html` the step ladder | how the recipe of a nutrient changes as the child grows | the line carries the median so a step of four articles is drawn as loudly as a step of twenty seven |
| `steps.html` the step matrix | which nutrients are raised and which are cut as the steps go up | a ratio of two medians says nothing about the spread inside either step |
| `pairs.html` two nutrients | whether two nutrients move together and whether the steps sit apart | two nutrients out of forty three at a time |

What the step matrix shows in one screen. Iron is raised 89% by stage 2 and 126% by
Kindermilch. Calcium is raised 117% by Kindermilch. Lactose is cut by a third at stage 4.
Energy barely moves at all.

Every option is emitted from one builder against one dataset. Because a) four hand copied
shells drift within a day b) a drifted shell ruins the comparison it was built for c) an
option may then differ only in the function that draws the marks.

A nutrient is drawn for a step only when at least half the articles of that step declare
it. Every option carries its own table twin under View so no figure is locked behind a
hover.

The indexed options hold the axis at 200% of the median. Because a) 93,5% of every
declared value sits between 50 and 150% b) two published figures reach 9.444% and 18.182%
c) an axis drawn to the second of those would flatten every other mark into one line.

The two figures are Aptamil Spezialnahrung declaring 4 mg of manganese against a step
median of 0,022 mg and an Aptamil Folgemilch 2 declaring 17 µg of vitamin B12 against a
median of 0,18 µg. Both are repeated exactly as dm publishes them.

### The star wall

```
/pages/views/stars.html
```

One small star per pack of an age step and one per lactation window of the matching age.
An arm is how many times the breast milk of that age the pack declares. The dashed ring is
one times the milk so a shape outside it declares more and inside it less. The axis counts
doublings from an eighth to thirty two times.

Every plot of a step is on the screen at once. Clicking one holds it and every held plot is
drawn over the others in the large chart. Clicking again lets it go. The address bar carries
the held set so a comparison travels.

The spokes are a choice. Twelve headline nutrients by default and the macronutrients or the
minerals or the vitamins on the control. Because a) forty spokes on a 150 px star is a
smudge b) a shape only reads once the arms are far enough apart c) the whole declaration is
already on the period table.

Colour carries no identity on the wall. Because a) twenty six packs cannot each hold a hue
b) the eight slot palette the app uses would leave eighteen of them grey anyway c) a held
plot is named in the list beside the chart and hovering that name raises its line. This is
the same choice the dot plot makes.

### The colour

The heatmap and the step matrix and the lean and the pack card carry the only new
colour. It is a diverging ramp of three blue steps for
below the median and three red steps for above it with a neutral grey between them. Each
arm was checked as an ordinal ramp with the data visualisation validator in both modes.
The first light ends failed the 2 to 1 floor against white so both arms were re-stepped.
The series blue measures 4,42 to 1 on white and the de-emphasis grey 3,12 so both clear
the 3 to 1 floor a mark needs.

The step matrix prints the share inside the cell so every band carries its own ink. Each
of the fourteen pairs was measured and the worst is 4,8 to 1 which clears the 4,5 to 1 a
small number needs.

The four options against breast milk carry no ramp at all. The first build drew the ratio
bar in the diverging ramp on the tinted track. Measured there the light step of each arm
reached 1,87 and the neutral 1,02 against a 3 to 1 floor a mark needs. Moving the bar to
the white sheet only lifted those to 2,11 and 1,15. Because a) the light end of a
diverging arm is near the background by design b) a tint of the same hue takes what
little is left c) the axis on these options already counts doublings away from the milk so
the direction is in the position rather than in the fill. The milk carries the navy accent
and the step carries the series blue and both were measured on the sheet at 13,34 and 4,42.

The two blues measure 3,02 to 1 apart in light and 1,69 in dark. That is what it costs.
Colour is never the only cue between them. The milk rail is always the upper one and it is
always labelled and the two carry different shapes on the first year plot where the milk is
a line and a step is a block. Every option carries its table twin under View.

## What one run collected

| figure | value |
| --- | --- |
| articles | 137 |
| articles without a declaration | 0 |
| failures | 0 |
| nutrient rows | 5488 |
| measurements | 5986 |
| CSV rows | 6135 |
| brands | 14 |
| units seen | `g` `mg` `µg` `kJ` `kcal` |

What the breast milk build collected.

| figure | value |
| --- | --- |
| sources | 9 |
| lactation windows | 10 |
| distinct nutrients | 49 |
| measurements | 404 |
| nutrients whose figure changes with the window | 36 |
| dm nutrients with no source found | `Fluorid` `Chrom` `Molybdän` |
| nutrients dm never declares | `3-Fucosyllactose (3-FL)` `Lacto-N-Neotetraose (LNnT)` |

## Reading the numbers

German decimals use a comma. Thousands use a full stop. `2.131 kJ` is two thousand one
hundred and thirty one. The parser reads both and gives back a float.

A limit such as `< 0,01 mg` keeps its sign in `qualifier` and its number in `value`.
The Greek letter mu is folded onto the micro sign so every microgram unit reads `µg`.

## Limits

The scraper repeats what dm publishes and corrects nothing. Article 1552420 declares its
energy as `0 kJ / 0 kcal` under the first of its two bases. That is the source and it is
passed through untouched.

A basis can carry an asterisk such as `pro 100 g*`. The footnote behind it sits in a text
block the scraper does not read.

A row can print fewer cells than the header has columns. Then the nutrient carries a
measurement only for the bases it names.

## Tests

```sh
.venv/bin/python -m pytest -q
```

Two hundred and fifty five tests run offline. Two trimmed article payloads sit in `tests/fixtures`. The
client tests drive a fake clock so nothing ever waits.
