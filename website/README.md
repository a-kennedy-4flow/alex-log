# Sanare Naturalis · drei Entwürfe

Three redesigns of www.sanare-naturalis.de. Each one covers the whole site. Each one has ten pages.

The copy is the practice's own German text taken verbatim from the live site. The photographs are the practice's own. Nothing here is filler.

## Run

    ./serve.sh
    ./teardown.sh

`serve.sh` starts four servers. Übersicht on 8080. Klar on 8081. Ruhe on 8082. Praxis on 8083. Each design gets its own port so all three run at once. `teardown.sh` stops every server it started.

Opening `index.html` in a browser works too. No server is required.

## Rebuild

    python3 _build/build.py

`_build/content.py` holds the German copy once. Three design modules render it. Editing one sentence updates all three designs.

## Entwurf 1 · Klar

Trust first. The visitor wants to know who treats them before anything else.

- Porträt and licence date sit in the first screen next to the welcome text.
- A **Beschwerdefinder** replaces the menu tree. Nineteen buttons name a complaint. Pressing one narrows twenty treatment cards.
- Long pages carry an index that follows the reader down the page.
- Serif headings over a sans body. Warm paper background. The existing teal becomes a proper scale.

Because a) a Heilpraktiker is chosen on the person rather than the method. b) a visitor arrives with a complaint rather than the name of a therapy. c) the licence and the BDH membership answer the doubt a naturopathy site raises.

## Entwurf 2 · Ruhe

The practice sold as an experience. Photography runs the full width. Type is large and quiet.

- Full screen opening image. Five numbered bands lead into the five treatment groups.
- Sections fade in as the reader scrolls. Sub-pages carry a reading progress bar.
- Wellness-Massagen get a horizontal rail of seven cards.
- The practice name is set in Cormorant Garamond rather than shown as the JPEG logo.

Because a) Wellness-Massagen and Ästhetische Medizin are bought on feeling rather than on evidence. b) the practice already owns warm treatment room photography that the current layout shrinks. c) the supplied logo is a JPEG on white so it cannot sit on a dark header.

## Entwurf 3 · Praxis

Built for the visitor who wants an appointment today.

- The booking panel sits in the first screen. It stays in view on every sub-page.
- All twenty treatments live on one searchable page. Typing "Rücken" or "Migräne" narrows the list. A row opens in place.
- Choosing a treatment fills the Anliegen field of the booking form.
- Light and dark are both supported. The choice is remembered.
- A call bar pins to the bottom on a phone.

Because a) the current site offers no route to a booking other than a plain form on the last page. b) twenty treatments spread over six pages force a visitor to guess which page holds theirs. c) most visitors to a local practice arrive on a phone.

## What all three share

Responsive down to 320 pixels. Skip link. Visible focus. Every photograph carries alt text written from the photograph itself. Text contrast reaches 4.5 to 1 at every size. Animation stops under `prefers-reduced-motion`. No tracking. No build step in the browser. Three files per design.

## Findings on the current site

These need a decision from the practice. None of them is fixed here.

1. **Aktuelles is nine years old.** Winter-Spezial and Basenfasten both name 2017 dates. Termin 2 of Basenfasten reads 23.03.2016 where the rest of the series reads 2017.
2. **The telephone number differs between pages.** The Impressum gives 0173/ 8628293. Every other page gives 0173/8626293. One digit is wrong somewhere.
3. **No e-mail address is readable.** The CMS obfuscates it into a token. The contact form is the only route.
4. **No opening hours anywhere.** All three designs say "Nach Vereinbarung" as a placeholder.
5. **No prices** beyond the two Aktuelles offers. Praxis answers the cost question in a FAQ entry instead.
6. **No privacy notice.** German law requires one for a contact form.
7. **The Impressum cites repealed law.** § 10 MDStV no longer exists. The TMG references were superseded by the DDG in 2024. A lawyer should rewrite that page.
8. **The logo is a JPEG on white.** It cannot sit on any dark background. An SVG or a transparent PNG is needed.
9. **The photographs top out at 1058 pixels wide.** A full width hero on a modern display is visibly soft. New photography would pay for itself in Ruhe.
10. **Three stock illustrations were dropped.** Two 3D renders of blood cells and viruses sat beside real treatment photography. The practice has no photograph of an infusion so that section now shows a nutrient image.
11. **Photographs were paired with the wrong treatments.** The chocolate massage photograph illustrated a consultation. The foot section showed a wall chart. Every pairing is corrected here.
12. **The footer still reads 2017.**
13. **"amerikanische Chiropraktik" appears only in the logo.** No page explains the term.

Spelling errors in the original copy are preserved rather than silently corrected. "Kanrnevalszeit". "persöhnlicher". "Stimmulation". "durcht". "Schildrüsenerkrankungen". "allgeminen". "Sperrrung". "Urhaberrechtes". Correcting them is a content decision for the practice.

## Layout

    website/
      index.html        chooser
      serve.sh          starts all three
      teardown.sh       stops all three
      assets/img/       the practice photography
      _build/           content and the three design modules
      klar/ ruhe/ praxis/   the rendered designs
