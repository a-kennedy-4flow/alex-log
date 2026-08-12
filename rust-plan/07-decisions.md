# Decisions

## Made in this plan

Each of these is a real fork, taken with a reason. Reversing any of them is fine; reversing them
silently is not.

| # | Decision | Instead of | Why |
| --- | --- | --- | --- |
| 1 | Hand-written constraint grammar over a closed lexicon | Statistical or neural POS tagger | Only 69 headwords need disambiguation for rule 1.2. Explainable to a writer who disputes a finding, auditable against the standard, no model artifact to version against Issue 9, compiles to WASM. See [03-ambiguity.md](03-ambiguity.md). |
| 2 | Readings lattice with quantified queries; rules never read a committed tag | One tag per token | Confidence becomes a property of the analysis instead of a guess, so a CI gate can demand `Certain` while an author sees `Probable`. |
| 3 | Disambiguation is blind to the `approved` flag, enforced by types | Using approval as evidence | Using it silently disables rule 1.2 on exactly the 69 words the rule exists for. The single most dangerous bug available in this design. |
| 4 | Rules declare `requires()` layers and `scope`; the engine schedules | Each rule parses what it needs | One traversal regardless of rule count; no two rules disagreeing about sentence boundaries; pay only for enabled rules. |
| 5 | Rules 8.4–8.7 implemented as the word-count function, not as diagnostics | A rule module per rule number | They define a quantity three other rules consume. As diagnostics they would be untestable and their bugs would surface as wrong verdicts elsewhere. |
| 6 | Runtime `mmap`ed lexicon artifact | Compile-time `phf` baked into the binary | Keeps ASD's copyrighted dictionary out of distributed binaries, and lets glossaries change without a recompile. Makes the licensing position enforceable rather than aspirational. |
| 7 | Glossary-gated rules stay silent, loudly, when no glossary is configured | Falling back to the standard's example terms | The standard says those lists are examples, not a vocabulary. As a default they pass words a project should not use and fail words it uses constantly. Reverses the Elixir prototype's default. |
| 8 | Glossary bootstrap is a first-class command, shipped with rule 1.1 | A later convenience script | Without it, a team's first run on real documents is thousands of false positives and the tool gets switched off that afternoon. |
| 9 | Extraction stays in Python with `pdftotext -bbox-layout` | Rewriting it in Rust | It works, the technique is right, and it is a one-shot human-supervised job per issue of the standard. Wrapped as `cargo xtask`. |
| 10 | Human-only rules (1.3, 6.1, 6.4, 6.5, 9.2) never emit findings | Heuristic proxies | No honest proxy exists. A checker that cries wolf gets switched off, and then the 33 enforceable rules go unenforced too. |
| 11 | Checker first; suggestions in M9, gated by rule 9.1; no rewriter | Automatic rewriting | Rule 9.1 says word-for-word replacement is often insufficient and gives no algorithm for the alternative. |
| 12 | Prose specification per rule in `docs/rules/`, carried over from the Elixir prototype | Code and tests only | The rules are one line each; their explanatory text is pages, full of edge cases. Without the prose beside it a rule module becomes regexes nobody dares change. |

## Needing your call

None of these blocks starting — M0 and M1 are unaffected — but each changes work from M1 onward.

### 1. Does Rust replace the Elixir prototype, or complement it?

Assumed: **replace**, with the Elixir version kept alive through M2 as a differential oracle for
rule 1.1 and then retired. The plan reuses its domain model, its extractor, and both JSON
artifacts.

If it stays as the reference implementation instead, the shape changes: the two need a shared
conformance corpus as a contract, and the Rust side should not diverge on the glossary default
(decision 7) without changing Elixir too.

Worth noting the prototype's design holds up well — `Rule`/`Finding`/`Text`/`Dictionary`/
`Glossary`/`Inflect` is the right decomposition, and the reason to move to Rust is the tagger,
the LSP latency target, and WASM, not a problem with the existing model.

### 2. Primary input format?

Assumed: **Markdown in M1, S1000D and DITA in M8.**

This is load-bearing rather than cosmetic. Eleven rules are conditioned on text type — section 5
on procedural content, section 6 on descriptive, section 7 on safety, plus 3.6's passive-voice
exception. Plain text cannot carry that distinction and heuristics for it will be wrong often.
Structured XML carries it natively, so the rules get *more accurate* with real input, not just
more convenient.

If the target is S1000D data modules, promoting it ahead of Markdown is probably right, and
several M4–M6 rules become easier rather than harder. If the target is plain `.txt` or Word, the
honest answer is that sections 5, 6, and 7 will be partly heuristic and should be marked as such.

### 3. Delivery surface priority?

Assumed: **library → CLI → LSP → WASM.**

The LSP is where a checker earns its keep, because STE compliance is cheap to fix while writing
and expensive to fix in review. If CI gating for an existing document set matters more, SARIF
output and the corpus tier (M7) should move ahead of M4, and the < 20 ms incremental target can
be dropped — which relaxes a real architectural constraint.

### 4. How much rule coverage is enough to ship?

Assumed: **M4 is the shippable floor** — around 20 rules, covering every high-frequency
mechanical error, with the rest arriving incrementally.

If a compliance claim is needed instead ("this document set was checked against ASD-STE100"),
that changes things: the human-only and advisory rules need to appear in a review checklist and
sign-off flow rather than being merely absent, and the corpus tier (M7) becomes mandatory
because 1.11 and 9.4 are the rules an auditor will ask about.

## Open technical questions

Not for you — for the implementation to answer, recorded so they are not rediscovered:

- **Multi-word noun boundaries.** Rule 2.1's count depends on where the noun cluster starts.
  Does a determiner count? A predicative adjective? The standard's worked examples pin some
  cases (`Horizontal cylinder pivot bearing` is four) but not all. Needs a written rule in
  `docs/rules/2.1.md` before code.
- **Proper nouns for rule 8.6.** "Proper nouns of individuals, groups, organizations, and
  geopolitical entities" count as one word. Capitalization is unreliable, especially at sentence
  start and in headings. Likely answer: a project-configured name list plus the glossary's
  category 11, and count a run of capitalized tokens as one word only when it matches.
- **Titles and labels for rule 8.6.** Needs L1 to mark them, which is fine in XML and guesswork
  in plain text.
- **Pass-B grammar formalism.** Hand-written recursive descent, or a small chart parser over a
  declarative grammar file? The declarative version is more reviewable and better fits the
  constraint-grammar file already planned for L6; recursive descent gives better error locality,
  which matters because parse failure *is* the diagnostic.
- **Sentence segmentation and rule 8.4.** A colon in a vertical list ends a sentence, elsewhere it
  does not. Segmentation therefore depends on L1, which means L1 cannot depend on L2. Confirm the
  layering has no cycle before building either.
