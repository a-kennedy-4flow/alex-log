# Roadmap

Ten milestones, ordered by dependency and by how soon each one produces something a writer
would actually run. Rule counts refer to the tiers in
[01-rule-inventory.md](01-rule-inventory.md).

Two ordering principles:

- **Every milestone ends with a usable tool**, not a layer. M1 is a working sentence-length and
  paragraph-length checker; it is genuinely useful to a documentation team on its own, and it
  requires no dictionary, no glossary, and no tagger.
- **Cheap rules first, but only where they are honest.** Rules 8.1, 6.6, 5.1, and 6.3 are worth
  far more per line of code than 1.2 is, and shipping them early buys the credibility that makes
  the glossary work in M2 politically possible.

---

## M0 — Skeleton and data

Workspace, CI, `ste-core` types, and the data pipeline. One rule end to end as the walking
skeleton: **8.1** (no semicolon), which needs nothing but a codepoint scan and proves the whole
path from source bytes to a formatted finding with a correct span.

The substantial work here is not Rust: it is cleaning the example corpus
([04-data-pipeline.md](04-data-pipeline.md)). Do it now, because every later exit criterion is a
percentage of it.

- `cargo xtask extract-dictionary` wrapping the existing Python extractor, `poppler` pinned
- `cargo xtask extract-corpus` producing `tests/corpus/*.jsonl` with column separation, sentence
  reassembly, and uppercase normalization
- `cargo xtask build-lexicon` producing the `rkyv` archive
- `Span`, `SourceMap`, `Finding`, `Severity`, `Confidence`, `RuleId`, `Fix`
- `ste-fmt`: human and JSON output; determinism test
- `ste` CLI: `ste check FILE`

**Exit:** rule 8.1 correct on the corpus. ≥90% of dictionary examples parsed into clean
sentence pairs, with a reviewed sample of 200 confirming the separation. Corpus harness runs in
CI and reports the five metrics from [05-testing.md](05-testing.md), all near zero.

## M1 — Structure and counting

L1 blocks, L2 sentences, L3 tokens, L4 word count. Markdown input first. This is where rules
8.4–8.7 get implemented as *measurement*, and the first genuinely valuable checks fall out.

Rules: **5.1, 6.3, 6.6** (D) — plus 8.4–8.7 as semantics, 4.1 and 4.3 as advisory.

The Elixir `Ste.Text` module is a working draft of L3 and ports directly; the missing token
kinds are titles/labels and proper nouns, both of which need L1.

- L1: paragraphs, headings, vertical lists, tables, steps, NOTE/WARNING/CAUTION, text type
- L2: segmentation with the abbreviation and vertical-list-colon cases
- L3: the eight token kinds of rule 8.6
- L4: the counting function, with its own test suite independent of any rule
- Engine: layer scheduling, `requires()`, scope dispatch, `rayon` over documents
- `ste.toml` configuration

**Exit:** word count matches every worked example in the standard. Sentence and paragraph limits
correct on the corpus. **Run over Part 1 of the PDF itself and triage every finding** — the
standard claims Part 1 complies with STE, so each finding is a bug or an interesting exception.

## M2 — Lexicon, glossary, and the vocabulary rules

L5. The dictionary and morphology, the glossary, and the bootstrap command that makes adoption
survivable.

Rules: **1.1** (G, ported from Elixir), **1.14, 4.2, GR-4, GR-6, GR-7, GR-8** (D), **1.5, 1.6,
1.8** (G).

- `ste-lex`: `mmap`ed lexicon, phrase trie for the 58 multi-word entries, interning
- Morphology: extend `Ste.Inflect` from plurals to verb and adjective forms, driven by the
  dictionary's explicit form lists where they exist
- Glossary loading, categories, preferred terms, aliases
- `ste bootstrap-glossary` — see [04-data-pipeline.md](04-data-pipeline.md)
- Graceful degradation with no dictionary artifact present, and with no glossary configured
- Differential test against the Elixir prototype on 1.1 while it is still available

**Exit:** 1.1 findings identical to the Elixir prototype across the corpus. Bootstrap produces a
usable candidate glossary from a real document set. Glossary-gated rules stay silent and say why
when no glossary is configured.

## M3 — The lattice

L6. The readings lattice, the constraint grammar, and the confidence model — the design in
[03-ambiguity.md](03-ambiguity.md).

Rules: **1.2, 1.4, 3.1** (D).

- `Reading`, `Cell`, quantified queries (`any`, `all`, `approved_reading_exists`)
- Constraint grammar as a compiled data file, with the never-remove-the-last-reading safeguard
- Pass A only at this stage; pass B arrives with M4's grammar
- Tagger evaluation against the ~2176 labelled dictionary examples
- The type-level guarantee that `ste-tag` cannot see the `approved` flag

**Exit:** tagger accuracy ≥95% on the labelled examples, and ≥99% restricted to the 69
mixed-approval headwords that rule 1.2 actually depends on. 1.2 recall and precision reported
separately for `Certain` and `Probable`.

## M4 — Verb groups and mood

L7, first half, and the pass-B STE grammar. The largest single block of value in the project:
seven rules from one body of work, all of them mechanical and frequently broken.

Rules: **3.2, 3.3, 3.4, 5.3, 5.5, 9.3** (D), **3.6** (D, with the text-type-conditioned
severity), **3.5** (G).

- Verb-group parser: auxiliaries, participles, the six licensed forms and tenses
- Mood: imperative, declarative
- Voice: passive detection
- Pass-B grammar over licensed clause shapes, with parse failure diagnosed at its locus
- Phrasal-verb detection against the dictionary's approved multi-word entries
- The interaction tests from [05-testing.md](05-testing.md)

**Exit:** ≥90% recall on corpus cases for sections 3 and 5. Zero findings on the STE positive
cases for these rules. Pass-B parse rate reported on the positive corpus — this number is the
verification of the design bet in [03-ambiguity.md](03-ambiguity.md), and if it is low, say so
and fall back to per-rule detectors.

## M5 — Noun phrases

L7, second half. Multi-word noun spans, which 2.1 needs and which are harder than verb groups
because the boundary is genuinely ambiguous.

Rules: **2.1, 4.5, 5.2, 5.4** (D), **1.7, 1.13** (G), **3.7, 1.9** (A).

**Exit:** 2.1 correct on the standard's own worked examples (`Horizontal cylinder pivot bearing`
is four words, `Actuator operating rod` is three). 4.5 precision ≥95% on positive cases — this
rule fires often and a false positive rate here is what a writer will judge the tool by.

## M6 — Safety and structure

Rules: **7.1, 7.2** (D), **7.3, 4.4, 6.2, 8.2, 8.3, 1.10, GR-1, GR-2, GR-3, GR-5** (A),
**2.2** (G, needs first-use tracking).

Plus the review checklist output for the five human-only rules (1.3, 6.1, 6.4, 6.5, 9.2): print
the rule text against the blocks it applies to, and make no claim.

**Exit:** every rule in the standard is either implemented, advisory, or explicitly listed as
human-only, with nothing silently unaccounted for.

## M7 — Corpus tier

L8. Cross-document consistency, as a map-reduce over per-document term indexes so a large
document set never needs to be resident at once.

Rules: **1.11, 9.4** (G), and 2.2 completed across documents.

- Per-document term index and merge
- Terminology consistency report: one concept, several terms
- Format consistency: dates, numbers, units

**Exit:** run over a multi-document set and produce a terminology report a terminologist agrees
with.

## M8 — Integrations

- `ste-lsp`: diagnostics, code actions for safe fixes, incremental re-check on the L1 block
- `ste-wasm`: browser and editor embedding
- SARIF output and a CI action with `--min-confidence` and per-rule severity gating
- Input formats beyond Markdown: **S1000D** and DITA (see [07-decisions.md](07-decisions.md)) —
  and note that structured XML input is what finally makes text typing reliable rather than
  heuristic, so several M1–M6 rules get *more accurate* here, not just more convenient

**Exit:** incremental re-check < 20 ms on a 500-page document. Spans land on the right word in
the original XML.

## M9 — Suggestions, bounded by rule 9.1

Auto-fix, and — more importantly — knowing when not to.

Rule 9.1 states the conditions under which a word-for-word replacement is illegitimate: the
alternative has a different part of speech, or changes the meaning, or yields a meaningless
result. Encode that as the gate:

- `Applicability::Safe` — the dictionary offers an alternative with the same part of speech and
  the substitution is local. Offer as a code action.
- `Applicability::NeedsReview` — an alternative exists but the part of speech differs, so the
  sentence needs restructuring. Show the alternative and the standard's example; never apply
  automatically.
- Nothing — no alternative, or the standard's own guidance says restructure. Explain, suggest
  nothing.

**Exit:** for every dictionary entry with a same-part-of-speech alternative, applying the safe
fix to the non-STE example produces text with no findings. That is a strong end-to-end check:
it exercises extraction, lexicon, tagger, rules, and fixes in one assertion, and it is the
closest thing available to "the checker understands the standard".

---

## Sequencing notes

**The critical path runs M0 → M1 → M2 → M3 → M4.** Everything after M4 is parallelizable; M5,
M6, and M8 can proceed independently once L7's first half exists.

**M2 is the political milestone, not the technical one.** It is where a real team first points
the tool at real documents, and without glossary bootstrap that encounter produces thousands of
false positives and ends the project. Ship bootstrap *with* 1.1, not after it.

**If time runs short, stop after M4 and ship.** M0–M4 covers 8.1, 5.1, 6.3, 6.6, 1.1, 1.14,
4.2, 1.2, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.3, 5.5, 9.3, and four GRs — around 20 rules,
including every high-frequency mechanical error the standard exists to prevent. That is a
defensible product. M5–M9 improve it; they do not make it.

**Do not start M3 before M1's word count is trustworthy.** The tagger is the interesting part
and will pull attention early. Counting is boring, three rules depend on it, and a quiet error
there discredits the findings that a writer *can* check by hand — which is exactly the kind of
error that loses their trust in the ones they cannot.
