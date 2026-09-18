# scraper2

The Vue 3 front end for the dm Babymilch data. Every route is rendered on the server.

This directory holds no scraping code. It reads one file that `../scraper` writes.

## Terms

A **plane** is the page background. A **sheet** is a white panel on it. A **band** is the
yellow fill a heading or a toolbar carries. A **rule** is a line that carries no text.
An **offer** is one price one shop publishes for one article. An **age step** is Pre 1 2
3 4 Kindermilch or Spezialnahrung as the pack name declares it. A **share** is a value
divided by the median of its own age step.

## Run it

```sh
cd ../scraper
python3 -m dmscrape                    # products.json
python3 tools/fetch_prices.py          # prices.json
python3 tools/export_dataset.py        # scraper2/server/assets/dataset.json

cd ../scraper2
pnpm install
./node_modules/.bin/nuxt build
node .output/server/index.mjs          # http://localhost:3000
```

`./node_modules/.bin/nuxt dev` serves the same pages with reload.

Invoke the binary rather than `pnpm build`. Because a) pnpm 11 refuses to run the esbuild
install script without an approval it only takes interactively b) `nuxt build` re-runs
`pnpm install` before it starts c) that install exits non zero and takes the build with it.

## Why the server renders

Every figure is a published number that never changes between two readers. The served
HTML therefore carries the whole table and every mark of every chart. A reader with no
JavaScript still gets the page. The controls are the only part that needs the browser.

The app never reads `products.json`. That file is 2,6 MB of declaration text. The exporter
writes 278 kB holding only the comparable figures. Each endpoint then answers with the
part one page draws rather than the whole set.

| endpoint | what it answers |
| --- | --- |
| `/api/overview` | the counts the brands the age steps the extreme prices |
| `/api/compare` | one age step and one nutrient on one scale |
| `/api/matrix` | every nutrient of one age step as a share of that step median |
| `/api/prices` | what each shop asks for the same pack |
| `/api/articles` | the register with a search and an age step filter |
| `/api/article/{dan}` | one pack against the median of its own step |

## The pages

| route | what it is |
| --- | --- |
| `/` | the counts the age steps the brands the five cheapest and the five dearest |
| `/compare` | a dot plot of one nutrient across one age step |
| `/matrix` | the whole nutrient table of one age step as colour |
| `/balance` | the lean of each pack against the field of its own age step |
| `/stars` | every pack of one age step over the others against the milk of that age |
| `/prices` | the three shops against each other per kilogram |
| `/register` | every article under its brand with its price |
| `/article/{dan}` | one pack against the median of its step |
| `/layouts` | three layouts of the register beside each other |
| `/about` | where the numbers come from |

## The stars

`/stars` draws every pack of one age step over the others as a star. An arm is how many
times the breast milk of the same age the pack declares. The axis counts doublings from an
eighth to thirty two times and the dashed ring is one times the milk.

Everything is on at once. A brand key turns a whole brand off and on again so two brands
can be read against each other without leaving the screen. Hovering a shape raises it and
fades the rest. `Alle an` and `Alle aus` do the obvious thing.

The spokes are a choice of twelve headline nutrients or the macronutrients or the minerals
or the vitamins. Because a) forty spokes on one circle is a smudge b) a shape only reads
once the arms are far apart c) the whole declaration is on `/pages/views/periods.html`.

### Why the milk carries no colour

The reference is drawn as a hatched band from the lowest to the highest lactation window
of that age. It carries a texture rather than a ninth hue. Because a) the palette names
eight slots and the readme already says a ninth would be indistinguishable from one of
them b) the navy measures 1,56 to 1 against the purple of the seventh slot which is the
collision that warning predicts c) a hatch is a channel no hue uses so it cannot collide
with any of them.

Every pair was measured with `contrast.py` rather than recalled.

| pair | ratio |
| --- | --- |
| the navy against the purple slot | 1,56 |
| the navy against the blue slot | 3,02 |
| the quiet ink of the hatch on the sheet | 5,84 |

One of the eight slots goes unused on this page. Muttermilch holds the fourth slot across
the whole app and is drawn here as a hatch, so seven brands of the step carry a hue and
five carry the grey. The slot does not move because a brand that changed colour from page
to page would be worse than a brand with no colour at all.

## The theme

White sheets on a light yellow plane. A navy masthead. No rounded corner anywhere.

One rule sets every corner to zero rather than a reset on each component. Because a) a
hard edge is the whole point of the theme b) a component added later would otherwise
arrive rounded c) one line cannot drift from another.

| role | value | contrast |
| --- | --- | --- |
| plane | `#fdfaec` | ink 16,97 to 1 |
| sheet | `#ffffff` | ink 17,86 to 1 |
| band | `#fbf4d4` | ink 16,06 to 1 |
| accent | `#002878` | 12,74 to 1 on the plane |
| quiet ink | `#5c6270` | 5,84 to 1 on the plane |

Every pair was measured with `contrast.py` rather than recalled.

The theme is light only. That is what it costs. The old single file pages followed the
system dark setting. A dark surface is not white and light yellow so the setting is gone.
Every token sits in one block so a second block would restore it.

## The colour

Colour does one of three jobs here. Nothing else carries colour.

**Polarity.** The share of the step median takes a diverging ramp. Three blue bands sit
below the median and three red bands above it with a neutral grey between them. Both arms
were validated as ordinal ramps against a white sheet. The light end of each clears the 2
to 1 a mark needs. This is the default on every chart because it is the difference the
reader came for.

**Identity.** The brand takes the eight categorical slots in their documented order. The
set passes the lightness band the chroma minimum the colour vision separation and the
normal vision separation against a white sheet. Three slots sit under 3 to 1 so every
chart carries a table twin and every mark carries a label. A brand past the eighth rank
takes the de-emphasis grey. Because a) a ninth hue would be indistinguishable from one of
the eight under protanopia b) thirteen brands cannot each hold a hue c) the grey says the
brand has no colour rather than claiming it shares one.

The brand chip is always drawn beside the written brand name. It is a second cue rather
than the identity channel so it is not held to the scatter gate. The dot plot is the one
place colour would have been the only cue. There the brand carries no hue at all and the
reader raises one brand against a grey field instead. Five of the twenty eight pairs of
the eight slots fail the all pairs separation on a white sheet so an arbitrary pair the
reader picked could collapse.

**Price.** The price per kilogram takes the same diverging ramp against the median price
of its own age step. A second sequential hue was not invented. Because a) the documented
palette names one sequential ramp b) an eyeballed second ramp would not have been
validated c) a price read against its own step is the more useful question anyway.

**The ring.** The neutral band and the lightest step of each arm sit near white by design.
A mark drawn in them would vanish on a white sheet. Each band therefore names a ring in a
darker step of its own arm. The neutral takes the rule colour. A backing circle in the
sheet colour sits behind every mark so two marks never merge.

### What colour never carries

The age step. Seven steps cannot be drawn from one hue here. The blue ramp holds at most
five steps above its light end before two neighbours fall inside a lightness gap of 0,06.
Closer steps collapse under protanopia. The step is therefore always in the axis the
title or the filter. This was measured with the ordinal validator rather than assumed.

## The layouts

Three options of the same register sit under `/layouts`. Each reads the same endpoint and
sits in the same shell. Each ends with what it costs.

| option | what it is | what it costs |
| --- | --- | --- |
| `ledger` | one table over the full width | the filter scrolls away after twenty rows |
| `rail` | a left column holds the filter and the brand index | 260 px of width on every screen so two columns leave the table |
| `cards` | one card per article in a grid | a third of the rows fit on a screen |

## The lean

`/balance` answers which brands are generous across the whole table rather than on one
nutrient. Every nutrient of the step falls into one of the seven bands. The bar is centred
so what sits below the median stacks left and what sits above stacks right. The neutral
band straddles the centre so half of it leads each side. The number is the lean in points
which is the count above less the count below over the count held.

Every bar is measured in one scale. Because a) each half of the track is half its width
b) a pack with four fifths of its nutrients under the median would overrun its half c) the
widest half in the field is what both halves are measured in.

It costs this. A band counts a nutrient rather than weighing it so vitamin K counts as
much as protein. The bands are coarse so five points and twenty four points land in the
same block. A nutrient the pack never declares is not counted as low.

None is chosen. The losing options stay so the decision stays readable.

## Limits

Only dm publishes an article number this app can ask for. A price from the other two
shops rests on a barcode match or on a match of maker age step and pack size. A match
made on the name alone is drawn at a lower opacity and named in the article page.

A shop that does not stock a pack shows an em dash rather than a zero.
