# Codifying ASD-STE100 in Rust — plan

A plan for turning the writing rules of **ASD-STE100 Simplified Technical English,
Issue 9 (2025-01-15)** into an executable checker written in Rust.

Source standard: [asd-ste100-issue-9.pdf](../2026-08-03/asd-ste100-issue-9.pdf) — 434 pages,
Part 1 (53 writing rules in 9 sections, plus 8 general recommendations) and
Part 2 (a controlled dictionary of 2182 entries).

Prior art in this repo: [ste/](../ste/) — an Elixir prototype with the domain model
worked out (`Rule`, `Finding`, `Text`, `Dictionary`, `Glossary`, `Inflect`) and one rule
implemented (1.1). Its dictionary extractor and JSON artifacts are reusable as-is.

## Documents

| File | Contents |
| --- | --- |
| [01-rule-inventory.md](01-rule-inventory.md) | All 53 rules + 8 GRs, each classified by what analysis it needs and whether a program can decide it |
| [02-architecture.md](02-architecture.md) | Crate layout, the layered analysis pipeline, core types |
| [03-ambiguity.md](03-ambiguity.md) | The part-of-speech problem and the lattice answer to it — the main technical risk |
| [04-data-pipeline.md](04-data-pipeline.md) | Dictionary and glossary extraction, build artifacts, licensing |
| [05-testing.md](05-testing.md) | The conformance corpus hiding inside the PDF, and how to use it |
| [06-roadmap.md](06-roadmap.md) | Ten milestones in dependency order, with exit criteria |
| [07-decisions.md](07-decisions.md) | Choices made here, and the four that need your call |

## The thesis

STE is a *controlled* natural language, and that is the whole reason this is tractable.
General-purpose grammar checking needs statistical NLP because English is open-ended.
STE is not: it has 876 approved words, each with a declared part of speech and a declared
set of inflected forms; it permits six verb forms and tenses; it bans complex verb
constructions, the passive voice outside a narrow exception, and the semicolon. The
compliant language is small enough to describe with a hand-written grammar and a closed
lexicon.

So the plan takes the opposite approach from a spellchecker-with-statistics:

1. **Model the licensed language exactly.** A closed lexicon with real morphology, and a
   grammar of the verb groups and clause shapes STE permits.
2. **Treat non-compliance as parse failure with a diagnosis.** A checker only ever runs on
   text that might break the rules, so it can never assume a valid parse. Where the input
   leaves the licensed language, the specific way it left is the finding.
3. **Never commit to a reading you cannot justify.** Where a word is ambiguous, carry all
   its readings and let rules ask *"does any reading satisfy me?"* or *"does every reading
   violate me?"*. Confidence then falls out of the analysis instead of being invented.

## What is honestly achievable

Of the 53 rules, on the classification in [01-rule-inventory.md](01-rule-inventory.md):

- **22 are fully machine-decidable** — punctuation, word and sentence counts, spelling,
  contractions, verb forms and tenses, mood, voice, part of speech, dictionary membership.
- **11 more are decidable once the project supplies a glossary** of technical nouns and
  technical verbs with category tags. The standard says outright that it cannot list these
  ("there are too many, and each subject field uses different technical nouns"), so the
  glossary is not a shortcut around the standard — it is where the standard tells you the
  answer lives.
- **10 are advisory**: a program can measure a proxy and warn, but the judgment is human
  (is this multi-word noun "short and easy to understand"?).
- **5 are not decidable by a program at all** and should not pretend to be — approved
  *meaning* (1.3), gradual information (6.1), one topic per paragraph (6.5). For these the
  tool's job is to be quiet, and at most to surface the rule text for a human reviewer.
- **5 are not checks at all.** Rules 8.4–8.7 define the word-count function that three other
  rules consume, and 9.1 defines when an automatic fix is illegitimate. They belong in the
  analysis layers and the suggestion gate, not the rule registry.

Refusing to guess on the human-only group is a design goal, not a gap. A controlled-language
checker that cries wolf gets switched off, and then none of the other 33 rules get enforced
either.

## Scope assumed

A **checker and authoring aid**: given text plus a project glossary, report where the text
leaves STE, with a span, the rule, and a suggested replacement where one is safe. Delivered
as a library first, then a CLI, then an LSP server so writers see findings as they type.

An automatic *rewriter* is deliberately out of the first plan. Rule 9.1 is the reason: the
standard says a word-for-word replacement is often insufficient and the sentence must be
restructured, and it gives no algorithm for that. The suggestion engine in M9 offers a fix
only where the dictionary licenses a same-part-of-speech substitution, and stays silent
otherwise. See [07-decisions.md](07-decisions.md) if you want that scope widened.
