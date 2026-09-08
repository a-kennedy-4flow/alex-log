# Todo — autosave the month

The month is filled over several weeks. Every edit is stored on its own. The
Save button goes. The download stays the one deliberate act.

The order below is the build order. Section 1 holds the decision that can change
the rest.

## Terms

**Draft.** A stored month that has not been downloaded. Every month is a draft
until the export writes `exportedAt`.

**Flush.** Writing a pending edit at once rather than waiting for the debounce.

**Trailing save.** One save queued behind the write in flight. A third edit
replaces it rather than queueing again.

**Mirror.** The copy of the month in localStorage kept beside the API copy. It
is what a failed write falls back to.

## 1. What must be true first

- [x] Confirm the API stores an incomplete month. The PUT at
      `apps/api/src/handlers.ts:338` validates the shape of each half day and
      nothing else. No completeness gate exists so a draft is already legal.
- [x] Decided on 2026-09-08. A download mutes the reminder for that month and
      a later edit does not unmute it. So `exportedAt` survives every PUT and
      `reminder.ts:142` stands as written. Section 3 builds it.
- [x] Decided on 2026-09-08. 3000ms. Because a) a month is filled in runs of
      several rows so a wider window collapses more of them into one write.
      b) the two flush points of section 2 cover a tab that closes inside the
      window. c) the interval is one constant to change.
- [x] A draft counts as owed. `exportedAt` is null until the download so the
      reminder chases an unsent month. That is the same decision read the other
      way round. Nothing to build.

## 2. The store

Everything in this section is `apps/web/src/composables/useTimesheet.ts`.

- [x] Split `saveSheet()`. `writeSheet` writes one month. `saveSheet` is the
      manual flush and it is the only caller that reloads the history.
- [x] Drop `loadHistory()` from the autosave path. The autosave calls
      `writeSheet` alone. `useJira` is what still calls `saveSheet`.
- [x] Add a loading guard. `loads` counts the loads in flight and the watcher
      returns while it is above zero. It is a count rather than a flag because
      two `openMonth` calls can overlap. `endLoad` waits a tick so the queued
      watcher passes the guard before it drops.
- [x] Open the month at bootstrap. Nothing did. `App.vue` renders the grid for
      the current month without ever reading it so the first edit would have
      stored an empty month over a real one. The guard does not cover that
      because the grid was never loading in the first place. Not on the list
      above and it had to be built.
- [x] Watch `halfDays` deeply together with `monthOverride`. `AUTOSAVE_MS`
      sits beside `SHEET_KEY`. The snapshot is taken when the watcher fires
      rather than when the timer does so a flush after the period moved still
      writes the month that was edited.
- [x] Serialise the writes. `inFlight` holds the write and `trailing` holds
      the one behind it. `drain` loops until the trailing slot is empty.
- [x] Flush a pending save before `year` or `month` changes. The watcher
      flushes then opens. The snapshot carries its own month so writing it
      after the period moved still lands on the month that was edited.
- [x] Flush on `visibilitychange` when the tab hides. The mirror is written
      before the PUT so the edit survives a tab that goes before the answer.
- [x] Write the mirror on every autosave even when `usingApi` is true.
      `writeSheet` writes it first and always. It is written again with the
      times the API answers with so the two agree.
- [x] Prefer the API copy over the mirror when the two disagree on load.
      `newer()` compares `updatedAt`. A 404 with a mirror present is the same
      case read the other way so the mirror is applied there too.
- [x] Expose the save state as one ref. `saveState` plus `savedAt` for the
      time the last write landed.

## 3. The sent marker

- [x] Stop nulling `exportedAt` in the PUT. It reads the stored sheet first
      and carries the marker forward.
- [x] Read the sent state as a comparison instead. `sentState` is `draft` then
      `sent` then `changed`. An `updatedAt` later than `exportedAt` is what
      makes it changed.
- [x] Add `exportedAt` to `StoredSheet` in `apps/web/src/lib/api.ts`.
- [x] Leave `reminder.ts:142` alone. A sent then changed month keeps its
      `exportedAt` so it stays muted. That is the decision of section 1.
- [x] Show the sent state in `ExportPanel.vue`. `exportPanel.sent` and
      `exportPanel.changed` carry the date. The panel reads the marker back
      from the API after the download because the export writes it there.
- [x] Leave `dynamo.ts:84` alone. It already defaults a missing `exportedAt`
      to null so an old row reads correctly.

## 4. The Save button goes

- [x] Delete the button at `PeriodBar.vue`.
- [x] Delete the `.save` rule from the same file.
- [x] Put the save state where the button stood. `.state` holds its height so
      the bar does not jump as the state changes.
- [x] Keep `setup.save` in the catalogue. `SetupForm.vue` uses the same key.
- [x] Reuse `setup.saved` for the status. `setup.saving` and
      `setup.saveFailed` and `setup.retry` are new. `setup.saveFailedHint` is
      a fourth and it is what section 5 asks for.
- [x] Add the new keys to all eight files under `apps/web/src/i18n/messages/`.
      Six in each. The four above plus `exportPanel.sent` and
      `exportPanel.changed`. The typecheck holds every locale against `en`.
- [x] Drop `await saveSheet()` from `ExportPanel.vue`. It is
      `await flushSheet()` instead. An edit still inside the interval is not
      stored yet and the API exports what is stored. Nothing is written when
      nothing is pending.
- [x] Keep the comment in `ExportPanel.vue` honest. It now says the month is
      stored as it is edited and it names the flush.

## 5. Failure

- [x] Show a failed write rather than swallowing it. `saveState` reads
      `failed` and the bar says so.
- [x] Retry a failed write once the next edit arrives. The next edit snapshots
      the whole month so the write that follows is the retry. No timer.
- [x] Offer the retry as a button too. `retrySave` sits behind it in the bar.
- [x] Say what a failure means. `setup.saveFailedHint` stands beside the
      retry.

## 6. Tests

- [x] An edit stores the month without a button press. `autosave.test.ts`.
- [x] Two edits inside the interval store one write. `autosave.test.ts`.
- [x] Opening a month stores nothing. `autosave.test.ts`.
- [x] Changing the month flushes the pending edit first. `autosave.test.ts`.
      The write lands on the month that was edited.
- [x] A write in flight queues one trailing save and no more.
      `autosave.test.ts`. Three edits behind one gated write make two PUTs.
- [x] A failed write leaves the mirror holding the edit. `autosave.test.ts`.
- [x] A failed write shows the failed state. `autosave.test.ts`. The retry
      clears it.
- [x] The PUT preserves `exportedAt`. `handlers.test.ts`.
- [x] A month edited after its download reads as sent then changed.
      `autosave.test.ts` for the screen. `handlers.test.ts` for the
      comparison.
- [x] `PeriodBar` carries no save button. `render.test.ts`.
- [x] The export runs without saving first. `autosave.test.ts`.

## 7. Before it is called done

- [x] `pnpm --filter @tracker/web typecheck`. Clean.
- [x] `pnpm -r --no-bail test`. 189 web and 119 api beside the packages.
- [x] `pnpm lint`. Clean.
- [x] Fill a month across two sessions against the dev API. Reload between
      them. Three days then a reload with the mirror cleared then two more.
      The five read back off the API. A download then an edit read as sent
      then changed. Driven by a throwaway jsdom harness against `pnpm dev:api`
      rather than by hand. It is not left in the suite because it needs a
      running server.
