# Training data

The model design is the easy part. This is where the project succeeds or fails.

## What already exists

Measured against `ste/priv/dictionary.json` and the extracted PDF text:

| Asset | Count | Use |
|---|---|---|
| Dictionary entries with gold POS | 2,182 | Lexicon features + weak POS supervision |
| — approved / not approved | 876 / 1,306 | The 1,306 are a **corruption table** (see below) |
| — entries carrying explicit verb/adjective forms | 250 | Verb-form supervision |
| STE example sentences (dictionary) | ~3,100 | Positive training corpus |
| Non-STE example sentences (dictionary) | ~1,760 | Negative training corpus |
| Minimal pairs (same word, both versions) | 1,377 | The highest-value signal in the whole dataset |
| `Non-STE:` / `STE:` pairs in Part 1 body | ~280 | **Held-out acceptance set — never train on these** |

Gold POS distribution across the 2,182 entries: `v` 864, `adj` 520, `n` 452,
`adv` 213, `prep` 76, `conj` 27, `pron` 27, `art` 3.

That skew is itself informative. The dictionary is verb- and adjective-heavy
because those are the words STE most needs to constrain, but it means the
corpus under-represents nouns relative to running text. Class weighting in the
POS loss, or the tagger will over-predict `v`.

---

## Milestone 0: fix the extraction — done

`priv/dictionary.json` was not a usable corpus. Two defects, both now fixed in
[extract_dictionary.py](../ste/tools/extract_dictionary.py).

**1. Column bleed — 441 of 2,182 entries (20%).** Part 2 is a four-column table
and the extraction merged the STE and non-STE columns:

```json
"word": "abaft",
"ste_examples":     ["THE CONTROL UNIT IS The control unit is",  ← both columns
                     "INSTALLED AFT OF", "THE FLIGHT", "COMPARTMENT."],
"non_ste_examples": ["installed abaft the flight", "compartment."]  ← lost its opener
```

The extractor was already `-bbox-layout` based, so the cause was not the
coordinates. It was two things:

- A whole `<line>` element was assigned to one column, but pdftotext puts both
  columns of a row in one line when they share a baseline. Fixed by grouping a
  line's **words** by column, since each word carries its own x position.
- The column anchor was read from the header label, and the label is indented
  a few points relative to the cells below it — "Non-STE example" starts at
  x=439, its cells at x=433. With a 6pt tolerance the cell text fell one column
  short and the two columns interleaved: `WHEN THE RELIEF When VALVE OPENS, THE
  cracks PRESSURE`. The outdent varies per page because the table is laid out to
  fit its contents, so the tolerance is now 12pt.

A gutter-calibration pass was tried first — histogram the word positions per
layout, put the boundary in the widest empty band — and abandoned: cell
positions vary page to page, so no per-layout boundary is correct. Splitting
lines at wide whitespace gaps was also tried and abandoned: cross-column gaps
(p50 8.3pt) overlap intra-column ones (p99 7.9pt), so no threshold separates
them.

**2. Line-wrapping.** 14,401 example items with a **median of 3 words**; only
33% ended in sentence punctuation. The narrow columns wrap every few words.
Fixed by rejoining a cell's fragments in reading order — after the page-break
merge, so a cell split across pages becomes one sentence — then reading
sentences off the result.

**Result:**

| | before | after |
|---|---|---|
| Entries with column bleed | 441 | **0** |
| Example items | 14,401 fragments | **5,868 sentences** |
| Median words per item | 3 | **7** |
| Ending in `.` `!` `?` | 33% | **85%** |

Entry counts are unchanged (2,182 / 876 approved / 1,306 not approved), so no
entry was lost to the fix. The extractor now reports
`entries_with_suspected_column_bleed` in its output so a regression is visible.

The remaining 15% that do not end in sentence punctuation are examples the
standard itself prints as fragments (list items, sentence openers).

### ⚠ Label leakage: casing

The dictionary renders STE examples in **UPPERCASE** and non-STE examples in
lowercase. That is a typographic convention of the printed table, not a property
of the language. A model trained on it would learn "uppercase = compliant" and
score ~100% on validation while being useless.

`dictionary.json` now carries this as a `casing_warning` field so a consumer
cannot miss it.

**Lowercase everything before training.** Casing survives only as the shape
features in the lexicon vector (initial-capital, all-caps), computed from the
*original document* under review, never from this corpus. Rule 8.6 also tells
the engine to skip uppercase text as non-vocabulary, so the two must not be
confused.

Worth stating plainly because it is the single most likely way this project
produces an impressive number that means nothing.

---

## Milestone 2–3: labelling the POS head

Three stages, cheapest first.

**Stage 1 — pretrain on Universal Dependencies English EWT.** ~250k tokens,
freely licensed, gets a general tagger to ~95%. Map UD's 17 UPOS tags onto the
14-tag set from [model.md](model.md); `tech-n`, `tech-v` and `abbr` have no UD
equivalent and stay unpopulated at this stage.

**Stage 2 — project labels onto the STE corpus.** For each dictionary example
sentence, the *headword's* POS is known exactly — it is `entry.pos`. Every other
token gets the Stage-1 model's prediction, kept only above a confidence
threshold. This yields ~3,100 sentences with one gold anchor each and mostly
correct surroundings, for free.

The anchor matters more than it sounds: the headword is precisely the word the
example was written to illustrate, so it is the word whose POS the rules will be
tested on.

**Stage 3 — hand-correct a gold set.** ~500 sentences, fully corrected by hand.
Roughly a day of work, and it is the only honest measurement in the project.
Split: 250 development, 250 final test, never trained on.

Technical manuals are imperative-heavy in a way UD's news and web text is not —
`Remove the bolt` looks like a declarative with an elided subject to a
newswire-trained tagger. Stage 3 is what corrects that, and skipping it means
never finding out that rule 5.3 (imperative form) is systematically wrong.

---

## Milestone 4: the verb-form and sentence heads

No existing corpus labels "past participle used as an adjective" versus "passive
verb". This needs generating.

### The dictionary is a ready-made corruption table

The most useful property of the dataset: **1,306 non-approved entries each point
at their approved alternatives.** `abandon → GO, STOP`. `abate → DECREASE`.
`abaft → AFT OF`.

Run it backwards. Take an STE-conformant sentence, find an approved word, and
substitute a non-approved word that lists it as an alternative. The result is a
known violation of rule 1.1 or 1.3, labelled with certainty, generated in bulk
from data that already exists. No annotation, no guessing.

### Rule-targeted corruptions

Same principle applied to the verb rules. Each transform produces a labelled
violation of one specific rule:

| Transform | Example | Violates |
|---|---|---|
| Passivize | `Remove the bolt` → `The bolt is removed` | 3.6 |
| Nominalize | `Inspect the valve` → `Do an inspection of the valve` | 3.7 |
| Add auxiliary chain | `Adjust the link` → `The link must be able to be adjusted` | 3.4 |
| Imperative → declarative | `Open the valve` → `You should open the valve` | 5.3 |
| Gerund as subject | `Install the seal` → `Installing the seal is required` | 3.5 |
| Substitute non-approved word | dictionary alternatives, reversed | 1.1, 1.3 |
| Extend sentence past the cap | conjoin two sentences | 5.1, 6.3 |
| Insert semicolon | | 8.1 |

The last two are Tier-A rules and need no model — generate them anyway, as
regression tests for the deterministic engine.

**Every synthetic example must be verified by the Tier-A engine before use.**
Milestone 1 exists partly to make this possible: if the corruption was supposed
to introduce a rule-8.1 violation and the engine does not find one, the
generator is broken. Labels that check themselves.

**Cap synthetic data at roughly 50% of each training batch.** Corruptions are
templated, and a model trained mostly on them learns to detect the templates.
The real dictionary examples must stay the majority signal.

---

## The acceptance set

The ~280 `Non-STE:` / `STE:` pairs in the Part 1 body text are different in kind
from everything above. They are the standard's own illustration of what each
rule means, attached to the rule they illustrate:

```
Rule 1.2   Non-STE:  Test the system for leaks.
               STE:  Do the leak test of the system.

Rule 3.7   Non-STE:  Oil the steel surfaces.
               STE:  Apply oil to the steel surfaces.
```

Extract them with their rule number from the surrounding heading, and **never
train on them**. They are the acceptance test in [evaluation.md](evaluation.md):
if the system cannot reproduce the standard's own judgement on the standard's
own examples, it does not work, whatever the validation accuracy says.

~280 examples across 19 in-scope rules is thin — a dozen or so per rule. Report
per-rule results as counts, not percentages, so `4/5` is not dressed up as 80%.

## Summary of corpus sizes

| Split | Size | Source |
|---|---|---|
| POS pretrain | ~250k tokens | UD English EWT |
| Domain train | ~3,100 sentences | Dictionary STE examples, label-projected |
| Synthetic | ≤ 50% of batches | Rule-targeted corruptions, engine-verified |
| Gold dev | 250 sentences | Hand-corrected |
| Gold test | 250 sentences | Hand-corrected, touched once |
| Acceptance | ~280 pairs | Part 1 body, rule-tagged, never trained on |

Under 5,000 real sentences is small, and that constraint drove the architecture:
the lexicon features hand the network the entire dictionary so it only has to
disambiguate. If the gold-set numbers come in below target, the fix is more
hand-labelled data, not a bigger model.
