# Todo — the F design and the board view

F is the design. The month gains a second view drawn as a calendar. A switch
picks between them.

## Terms

**Sheet.** The one white surface F puts every section on. It replaces the card
per section that `MonthPage.vue` builds today.

**Board.** The month drawn as seven columns with one cell a day.

**Chip.** A booked cost centre drawn as a filled pill inside a board cell.

## 1. Palette and shell

- [x] Replace the palette in `apps/web/src/styles/tokens.css` with the theme
      values. Smart Blue `#00263C`. Warm Grey `#EEE6E0`. Vibrant Orange
      `#FF4D06`. Bright Blue `#007EFF`. Bold Pink `#FFA0F5`. Grey `#757575`.
      The live navy `#0b2545` is not a theme colour. Nor is the live orange
      `#e8620c`.
- [x] Set `--font` to Arial. The deck allows Arial alone. Segoe UI goes.
- [x] Collapse `--radius` and `--radius-lg` to one value of 14px. F applies one
      radius to every box.
- [x] Set the body background to Warm Grey.
- [x] Set `.btn-primary` to Smart Blue text on Vibrant Orange. Because a) white
      on that orange reaches 3.3 to 1. b) body text needs 4.5 to 1. c) Smart
      Blue on that orange reaches 4.7 to 1.
- [x] Drop `--shadow` from `.card`. F carries no shadow.
- [x] Settled. Bright Blue draws lines and never carries text. It reaches 3.87
      to 1 on white. Every column header is Grey at 4.61 to 1 with the 2px
      Bright Blue rule kept beneath it.
- [x] Hold Grey text to a white background. It falls to 3.74 on Warm Grey and
      4.32 on the non-working tint. F now sets Smart Blue on both.

## 2. The sheet

- [x] Wrap `MonthPage.vue` in a sheet element. One white surface with the shared
      radius and `overflow: hidden`.
- [x] Drop `class="card"` from `PeriodBar` `MonthGrid` `SummaryPanel`
      `ExportPanel` `RecentCostCentres`. Each becomes a band of the sheet.
- [x] Divide the bands with a 1px Warm Grey rule.
- [x] Move `ExportPanel` to the last band. Fill it Smart Blue so it closes the
      sheet.
- [x] Replace the gradient square `.mark` in `App.vue` with the two circle SVG.
- [x] Lift the header into a white bar sitting on the Warm Grey canvas.
- [x] Add the title row. `h1` with the month then a pill for the location then a
      pill for the contract percentage.
- [x] Add the stat strip to `PeriodBar`. Working days then target then booked.
      Booked turns Vibrant Orange when it misses. `PeriodBar` already computes
      `delta` so the values are there.
- [x] Raise the `MonthProgress` figure to 44px.

## 3. The switch

- [x] Add `apps/web/src/composables/useView.ts`. One ref holding `grid` or
      `board`. Persist it through a watch on localStorage. That matches how
      `profile` persists in `useTimesheet.ts`.
- [x] Put two segmented buttons in the sheet head.
- [x] Keep both views on the `/` route. Because a) both edit one month. b) only
      the middle band changes. c) a second route duplicates the page
      composition. A `view` search parameter can follow later if a linkable view
      is wanted.
- [x] Add the switch labels to all eight files under `i18n/messages/`.

## 4. The board

- [x] Add `apps/web/src/components/MonthCalendar.vue`.
- [x] Read `calendar` `rowsByDate` `halfDays` from `useTimesheet`. Add no state.
- [x] Reuse `dayIsSplit` `dayValueFor` `dayOptionsFor` from `@tracker/core`.
      Because two views that compute a day apart will disagree on the total.
- [x] Lead the board with blank cells so day one lands in its weekday column.
- [x] Draw a non-working day at reduced strength.
- [x] Done another way. There is no name to give. The workbook holiday sheet
      names one column per location and lists dates under it. So `holidayName`
      is gone. `CalendarDay` carries `holiday` as a boolean instead. A cell can
      then tell a bank holiday from a weekend. The board prints the translated
      `grid.holiday`. A real name needs a source the backoffice upload has not
      got.
- [x] Draw each booked half day as a chip carrying the workday id and the day
      value.
- [x] Give a free working day the dashed add control. That is where the missing
      day is found.
- [x] Build the cell popover. Decision 1 took option A. See
      `mockups/d1-popover.html`. It carries every field a grid row carries.
- [x] Flip the popover to the other side of the cell near the sheet edge.
- [x] Hold focus inside the popover while it is open. Return it to the cell on
      close. Close on Escape. A popover is the one option of the three that
      needs this.
- [x] Give the open cell a marked state so the board says which day is being
      edited.
- [x] Give each cost centre a 4px theme line down a Warm Grey chip. Decision 2
      took option B. See `mockups/d2-edge.html`. No shade is invented so no
      brand owner has to approve anything.
- [x] Order the lines Smart Blue then Bright Blue then Grey then Vibrant Orange
      then Bold Pink. Bright Blue is allowed here because a line carries no
      text.
- [x] Handle the sixth cost centre. Five lines separate and a sixth has none.
      Fall back to the plain Warm Grey chip and let the number do the work.
- [x] Note the one cost. Vibrant Orange is reserved for the primary action so
      the fifth line spends that reservation. Dropping it leaves four.
- [x] Add the inverse of `trackerRow` to core. `ValidationIssue.rows` carries
      tracker rows. The board needs a date with a half to highlight a cell.
- [x] Give the board table semantics or explicit roles. A grid of divs loses the
      weekday header for a screen reader.
- [x] Add keyboard movement across the cells. The grid gets this free from the
      table with its form controls.

## 5. Tour and tests

- [x] Add board steps to `STEPS` in `useTour.ts`. A step whose `data-tour`
      anchor is missing is filtered out so the tour would silently shorten in
      board view.
- [x] Carry the `data-tour` anchors the board keeps.
- [x] Update `apps/web/src/__tests__/render.test.ts`. It pins the page title.
- [x] Test that both views report one booked total for the same month.
- [x] Test that the chosen view survives a reload.
- [x] Add colour compliance. A check that fails when a hex outside the theme
      appears anywhere under `apps/web`. It fails again when a pair named in
      section 1 drops below its ratio. Because a) the palette is the first rule
      a stylesheet drifts from. b) every ratio in section 1 was worked out once
      and nothing holds it. c) a check runs on each commit where a review does
      not. Two known offenders exist today. `tokens.css` carries `#0b2545` and
      `#e8620c`. `public/logo.svg` carries the theme orange `#FF4D06` so the
      header mark and the primary button do not match.
- [x] Run `pnpm -r test` then `pnpm typecheck`.

## Decisions taken

1. **How a board cell is edited. Option A. A popover on the cell.** Built at
   `mockups/d1-popover.html`. Because a) every field a grid row carries fits
   inside it. b) the month stays whole behind it. c) neither of the others
   holds the whole row without taking width from the board. It costs a focus
   trap with an edge flip. Both are in section 4.
2. **How one cost centre is told from another. Option B. A theme line down the
   chip edge.** Built at `mockups/d2-edge.html`. Because a) no shade is
   invented so nothing waits on a brand owner. b) a line may be Bright Blue
   where text may not. c) five lines separate where five fills needed two
   mixed tints. It costs the Vibrant Orange reservation on the fifth line.
3. **Bright Blue draws lines and never carries text.** It reaches 3.87 to 1 on
   white. Grey carries the small headings at 4.61 to 1. Grey sits on white
   alone because it falls to 3.74 on Warm Grey.

## What else the list needed

1. **Eight shades of a theme colour.** The deck gives six colours and none of
   them can tint a non-working day or sit on the Smart Blue band. Each shade is
   declared in `tokens.css` with the job it takes and the ratio it clears. The
   colour check holds the list so a ninth cannot arrive unnoticed. The eighth is
   `--past-target`. It washes a working day the target does not ask for. Bright
   Blue rather than Warm Grey because a) the Warm Grey tint already means a non
   working day. b) the two states sit in one column. c) Smart Blue reaches 14.33
   to 1 on the wash.
2. **The three state colours are gone.** Red and amber and green are not theme
   colours. Severity is now carried by a Vibrant Orange badge or a Vibrant
   Orange rule. Because a) that orange reaches 3.32 to 1 on white. b) body text
   needs 4.5 to 1. c) a fill carries no text so it spends nothing.
3. **`useRowEdit.ts`.** The rules for writing one half day moved out of
   `MonthGrid.vue`. Both views call them. Because a) the day value depends on
   what the other half holds. b) a rule copied into a second view is a rule that
   drifts.
4. **A transparent border on every form control.** F draws a flat control. A
   state still has to colour its edge without the box changing size.
5. **The other four pages.** `.card` is gone from `tokens.css` so quick fill and
   settings and the backoffice upload and the wizard all moved onto the sheet.
6. **`public/logo.svg`.** The favicon is now the two circle mark the header
   carries.
