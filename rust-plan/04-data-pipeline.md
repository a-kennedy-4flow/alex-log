# Data pipeline

Three datasets drive the checker, and all three come out of the PDF:

| Dataset | From | Status |
| --- | --- | --- |
| Dictionary — 2182 entries | Part 2 | **Extracted.** [ste/priv/dictionary.json](../ste/priv/dictionary.json) |
| Technical noun and verb categories — 22 + 16 categories, 778 example terms | Rules 1.5, 1.12 | **Transcribed by hand and validated.** [ste/priv/technical_terms.json](../ste/priv/technical_terms.json) |
| Conformance corpus — ~3600 example sentences | Part 1 and Part 2 | **Not built.** Latent in the extraction; needs cleaning. See [05-testing.md](05-testing.md) |

## What already works, and is worth keeping

[ste/tools/extract_dictionary.py](../ste/tools/extract_dictionary.py) is a solid piece of work
and should be carried over rather than rewritten in Rust. It uses `pdftotext -bbox-layout` and
assigns each text line to a dictionary column by its x coordinate, which is the right technique
— the character-grid output of `pdftotext -layout` bleeds columns together on the narrow pages.
It handles the entry conventions of Part 2's "Guide to the dictionary" (uppercase headword =
approved, part of speech in parentheses, forms listed after the headword, alternatives in column
two, `TN`/`TV` markers on alternatives), wrapped headwords, and entries split across a page
break.

Rust would gain nothing here. Extraction is a one-shot, human-supervised data-cleaning job run
once per issue of the standard, and Python plus `pdftotext` is the right tool. Wrap it as
`cargo xtask extract-dictionary` so it stays discoverable, and pin the `poppler` version, because
a `pdftotext` upgrade changing line grouping is the most likely way this silently breaks.

`validate_technical_terms.py` — asserting every hand-transcribed term actually occurs in the PDF
— is the right instinct and should be generalized: every extracted artifact gets a validator
that can fail CI.

## What needs fixing before the data is usable

**The examples are not yet clean.** Look at the `abaft` entry:

```json
"ste_examples":     ["THE CONTROL UNIT IS The control unit is", "INSTALLED AFT OF", ...],
"non_ste_examples": ["installed abaft the flight", "compartment."]
```

Columns three and four have bled into each other and the sentences are split at PDF line
breaks. The dictionary *lookup* data — word, part of speech, approval, forms, alternatives — is
in good shape and rule 1.1 works off it today. The *examples* are not, and they are the entire
conformance corpus and the tagger's only labelled data. Cleaning them is a real task, not a
detail, and it is the first item in M0 for that reason:

1. Reconstruct sentences by joining lines and re-splitting on sentence boundaries rather than
   on PDF line breaks.
2. Separate the columns properly. The reliable signal is that STE examples in Part 2 are
   typeset in uppercase and non-STE examples in mixed case — visible in the `abaft` row above,
   where the leak is detectable precisely because `The control unit is` is mixed case inside an
   uppercase field.
3. Normalize the uppercase STE examples back to sentence case, since the checker's own rule 8.6
   treats an uppercase run as a single unchangeable word and would refuse to analyze them.
4. Report a coverage number and **fail the build on regression**. Some rows will resist
   automation; hand-correct those into an override file keyed by headword and part of speech, so
   re-extraction does not lose the corrections.

Expect this to take real time and to need eyes on a sample. It is also the highest-leverage work
in the project: without it there is no ground truth, and every later milestone's exit criterion
is a percentage of this corpus.

## Build artifacts

```
PDF ──xtask extract-dictionary──▶ dictionary.json  ─┐
PDF ──xtask extract-corpus─────▶ corpus/*.jsonl   ─┤
rules 1.5/1.12 (hand) ─────────▶ technical_terms.json ─┤
                                                     ├─▶ xtask build-lexicon ─▶ ste.lex
project glossary CSV ────────────────────────────────┘                          (rkyv archive)
```

JSON is the reviewable interchange format; it stays checked in and diffable, so a re-extraction
after a `poppler` upgrade shows up as a reviewable diff rather than a silent change in
behaviour. `ste.lex` is the runtime artifact: an `rkyv` archive with a perfect-hash index over
forms, `mmap`ed at startup so a lookup is a hash probe with no deserialization.

Deliberately **not** baked into the binary with `phf` in `build.rs`, for the licensing reason
below and because project glossaries change without a recompile. The genuinely static tiny sets
— unit symbols, contractions, Latin abbreviations, the British→American spelling map — do go
through `phf`, since they are the checker's own data rather than ASD's.

Layout inside `ste.lex`:

```
forms:       phf<&str, FormId>          every spelling: headwords, listed forms, derived plurals
entries:     [Entry]                    word, pos, approved, forms, meaning, alternatives
phrases:     trie over multi-word entries (58 of them, up to 3 words, plus AS ... AS)
glossary:    phf<&str, TermId> → { category, preferred, aliases }
spelling:    phf<&str, &str>            British → American
```

## Glossary: the part the standard leaves to you

Rules 1.5, 1.6, 1.8, and 1.12 all point outward: technical nouns and verbs live in "your
company, industry, or subject field" glossary, and the standard says plainly that it cannot
enumerate them. Eleven rules depend on that file existing.

The category lists in rules 1.5 and 1.12 are **examples, not a vocabulary** — the standard says
so — which makes the Elixir prototype's decision to enable them as a default glossary a trap
worth reversing. As a default they let through words a given project should not use and reject
words it uses constantly. Ship them as a labelled seed for bootstrap, with
`include_standard_examples = false`.

Which makes **glossary bootstrap** a feature rather than a script:

```
ste bootstrap-glossary docs/**/*.xml --out glossary/candidates.csv
```

Run the lexical layers over an existing corpus, collect every word with no dictionary entry,
and emit a candidate list with frequency, an example context per term, and a guessed category
from the 22 noun and 16 verb categories. A human then confirms the category, sets the preferred
term, and lists deprecated aliases. That last column is what makes rule 1.11 — *do not use
different technical nouns for the same item* — decidable rather than a fuzzy-match report.

This inverts the adoption story in a way worth being explicit about. Without bootstrap, a team's
first run on a real document set produces thousands of rule 1.1 findings, nearly all of them
false, and they stop using the tool that afternoon. With it, the first run produces a work
item — classify these 400 terms — whose output makes eleven rules light up at once.

Glossary format, CSV so it can live in a spreadsheet where terminologists actually work:

```csv
term,kind,category,preferred,aliases,notes
landing gear,noun,2,landing gear,"undercarriage;gear",
ream,verb,1a,ream,,
```

## Licensing

Worth settling before any of this is published or shared, because it constrains the artifact
layout above.

The PDF is copyright ASD, and is encrypted with copy permission denied. Part 2's dictionary and
the rule text are ASD's content, not facts in the public domain. ASD grants irrevocable free
use, reproduction, and publication rights, but to an enumerated list of organizations: ASD
national association members and their member companies; AIA and AIAC members; other ICCAIA
members; **customers of companies in those categories**; ministries of defence of those
countries; A4A; airworthiness authorities; and universities and research institutes for
educational purposes.

Two practical consequences:

1. **Do not vendor `dictionary.json` into a public repository, and do not link it into a
   distributed binary.** Ship the extractor and let each user build the artifact from their own
   licensed copy of the PDF. This is why `ste.lex` is a runtime `mmap` rather than compile-time
   `phf` — the architecture makes the licensing position enforceable instead of aspirational.
   The checker must run, and say so clearly, when no dictionary artifact is present: the
   punctuation, counting, and structural rules need none.
2. **Confirm which category covers this use.** ASD member companies and their customers are
   covered; whether a given company qualifies, and under which category, is a question for
   whoever owns the relationship — worth a short email rather than an assumption, especially
   before anything is shared outside the company or open-sourced. Nothing about writing the
   checker is in question; only distribution of ASD's extracted content is.

Also: `Ste`, `ASD-STE100`, and `Simplified Technical English` are EU registered trademarks
(No. 017966390). A tool that is not certified by ASD should avoid implying endorsement in its
name and README, which is a reason to pick a project name that is not `ste`.
