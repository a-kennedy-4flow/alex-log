# Part of speech, ambiguity, and confidence

Rule 1.2 — *use approved words only as the specified part of speech* — is the rule that
decides whether this project is hard or easy, because a naive reading of it demands a
part-of-speech tagger, and a tagger demands training data, a model artifact, and an
accuracy figure that will never be 100%.

This document argues the demand is much smaller than it looks, and sets out how to meet it
without statistics.

## How much ambiguity actually exists

Measured on the extracted dictionary (2182 entries, 876 approved):

| | Count |
| --- | --- |
| Headwords with more than one entry (homographs) | 191 |
| Headwords approved as more than one part of speech | 69 |
| **Headwords where one part of speech is approved and another is not** | **69** |

That last row is the entire problem. If a word's readings are *all* approved, rule 1.2 cannot
fire no matter which reading is correct, so no disambiguation is needed. If a word is not in
the dictionary at all, it is rule 1.1/1.6 territory and the glossary answers it. **Rule 1.2
only needs a decision for 69 words**, and they are known at build time:

```
aid  as  back  below  bottom  break  check  clear  click  close  code  coil
complete  cool  copy  curve  cycle  damage  decrease  dim  display  drop
effect  empty  end  equal  estimate  exhaust  face  fall  free  light  test ...
```

The canonical shapes:

| Word | Approved | Not approved | The trap |
| --- | --- | --- | --- |
| `test` | n | v | `Test the system for leaks.` → `Do the leak test of the system.` |
| `check` | n | v | `Check the laptop battery.` → `Do a check of the laptop battery.` |
| `dim` | adj | v | `A dim light comes on.` is STE; dimming something is not. |
| `free` | adj | v | Free as a state, not as an action. |
| `close` | v | adj | The reverse direction — the verb is fine, the adjective is not. |
| `clean` | adj **and** v | — | Both approved. 1.2 can never fire. Do not waste a decision on it. |

Sixty-nine words is not a machine-learning problem. It is a lexicon problem with a small
disambiguation layer over it.

## The pitfall that would sink a naive implementation

**Approval status must never be evidence for part of speech.**

It is very tempting to reason: `check` is approved as a noun and not as a verb, therefore in
`Check the laptop battery.` it is a noun, therefore the sentence is fine. That inference is
backwards and it silently disables rule 1.2 — precisely on the 69 words the rule exists for.

The lattice is therefore built from **all** dictionary entries for a form, approved or not,
and every disambiguation constraint is blind to the `approved` flag. Approval is consulted
only after a reading is chosen, by the rule. In the code this should be enforced by types:
the value `ste-tag` sees has no `approved` field at all.

The same trap has a subtler form. Any constraint of the shape "assume the text obeys STE"
will hide violations, because the input to a checker is by definition text that might not.
Constraints that presuppose compliance are legitimate but must be quarantined — see the
two-pass design below.

## The lattice

Instead of committing to one tag per token, carry the set of surviving readings and let rules
ask questions of the set.

```rust
pub struct Reading {
    pub lemma: Symbol,
    pub pos: Pos,
    pub infl: Inflection,   // Base | ThirdSing | Past | PastPart | Ing | Plural | Comp | Super
    pub source: Source,     // Dictionary | Morphology | Glossary | Guessed
    pub weight: u16,
}

pub struct Cell { pub span: Span, pub readings: SmallVec<[Reading; 4]> }
```

Readings come from four places, in priority order:

1. **Dictionary**, exact form match — including the 58 multi-word entries (`MAKE SURE`,
   `AFT OF`, `AS ... AS`), matched greedily before their parts, as the Elixir prototype
   already does for rule 1.1.
2. **Morphology** off a dictionary headword. The dictionary lists inflected forms explicitly
   for 256 entries, which makes most of this a table lookup rather than a guess; regular
   plurals of countable nouns are derived, as Part 2 licenses. `Ste.Inflect` is the working
   draft and needs extending from plurals to verb and adjective forms.
3. **Glossary**: a technical noun contributes a noun reading, a technical verb a verb reading,
   with the category attached so rules 1.5–1.13 can cite it.
4. **Guessed**, for words in neither: noun by default, plus a verb reading if the form has verbal
   morphology. `Guessed` readings are what rule 1.1 reports on, and they are marked so no
   other rule builds a confident finding on top of them.

Rules then query with quantifiers rather than reading a tag:

```rust
cell.any(Pos::Verb)          // some surviving reading is a verb
cell.all(Pos::Verb)          // every surviving reading is a verb
cell.approved_reading_exists(&dict)   // rule 1.2's actual question
```

Rule 1.2 becomes: *fire iff no surviving reading is approved as its part of speech.* That is
a precise statement of the rule, and the confidence follows from the lattice rather than being
invented —

| Lattice state | Verdict | Confidence |
| --- | --- | --- |
| One reading, not approved | violation | `Certain` |
| Several readings, none approved | violation | `Certain` |
| Several readings, some approved | violation only if constraints eliminated the approved ones | `Probable` |
| Some reading approved and surviving | no finding | — |

A CI gate runs `--min-confidence certain`; an author in an editor sees `Probable` too. Neither
mode requires the engine to lie about what it knows.

## Disambiguation: constraint grammar, not statistics

Reduce the lattice with hand-written **removal constraints** in the Constraint Grammar
tradition — ordered rules that delete readings in a context, iterated to a fixed point:

```
REMOVE Noun IF (-1 Determiner) (0 Verb) (1 Determiner) ;   # "Check the battery" → verb
REMOVE Verb IF (-1 Determiner) ;                           # "the check" → noun
REMOVE Verb IF (-1 Preposition) ;                          # "after the test" → noun
SELECT Imperative IF (0 SentenceInitial) (0 Verb) (1 NounPhrase) ;
```

Why this and not a tagger:

- **No training data needed.** With 69 words to separate and a closed lexicon, hand-written
  constraints reach very high accuracy on the cases that matter, and the residue is
  representable as `Probable` rather than as silent error.
- **Explainable.** A writer who disputes a finding can be shown the constraint that fired.
  With a neural tagger the answer is "the model said so", which in a standards-compliance
  context is not an answer.
- **Auditable against the standard.** Each constraint traces to explanatory text in Part 1.
- **Degrades safely.** The universal CG safeguard — *never remove the last reading* — means the
  worst case is an unreduced lattice and a `Probable` finding, never a wrong `Certain` one.
- **Small.** No model artifact to version against Issue 9, and it compiles to WASM.

Constraints are data, not code: a `.cg` file compiled at build time into a matcher. That keeps
them reviewable by a linguist who does not read Rust, and testable one at a time.

## Two passes, because the input may be non-compliant

**Pass A — dialect-neutral.** Constraints true of English generally: determiner–noun agreement,
prepositional complements, verb-group internal structure. Safe on any input, compliant or not.

**Pass B — STE grammar.** Attempt to parse the sentence against a small hand-written grammar of
the clause shapes STE licenses: imperative with optional leading condition (5.3, 5.4), the six
permitted verb forms and tenses (3.2), no auxiliary stacking (3.4), active voice (3.6),
multi-word nouns of at most three words (2.1).

- If pass B parses, its tags are `Certain`, and the parse hands L7 its verb groups, mood, voice,
  and noun clusters for free.
- If pass B fails, **the failure is the finding**. A parse that dies on `has` followed by a past
  participle is rule 3.4; one that dies on `is` plus past participle in a procedural block is
  3.6; one that finds no imperative head in a step is 5.3. Diagnosing at the failure locus is
  both more precise and cheaper than writing a separate detector per rule.
- Pass B never *removes* readings that pass A kept. It only adds confidence and structure, so a
  failed parse cannot manufacture a violation on its own.

This is the design's main bet, and it is worth stating as such: it wins if the licensed
language really is small enough to parse with a hand-written grammar. The rule inventory says it
is — six verb forms, no passives, no subordination beyond a leading condition, 20-word
sentences — and this is exactly the property that makes a *controlled* language different from
English. If the bet fails, the fallback is pass A plus per-rule detectors, which is more code
and more `Probable` findings but not a redesign: rules query the lattice either way.

## Evaluating the tagger for free

The dictionary extraction yields **2176 entries with STE examples**. Each example was written to
illustrate one headword whose part of speech the entry declares. That is a gold-labelled token
per example — roughly two thousand labelled data points, at no annotation cost, drawn from the
standard's own prose.

Use it as the disambiguator's test set: for each entry, run the tagger over the example and
assert the headword's surviving readings include the declared part of speech, and for
unambiguous headwords that they include nothing else. Track that percentage as the tagger's
headline metric across milestones. It is not a perfect evaluation — the examples are short and
stylistically uniform, which flatters any tagger — but it is honest ground truth from the
authority itself, and it costs nothing.

Note the extraction caveat in [04-data-pipeline.md](04-data-pipeline.md): the current Elixir
extractor bleeds the STE and non-STE columns together on some rows, so these examples need
cleaning before they can serve as ground truth.

## Cases known to be hard

| Case | Why | Handling |
| --- | --- | --- |
| `operating rod`, `landing gear` | An `-ing` form as a modifier inside a multi-word noun is licensed by 3.5, but only when the whole is a technical noun | Needs the glossary and the L7 noun cluster together. A gerund outside a glossary term is a 3.5 violation. |
| `the light comes on` | `light` is in the dictionary as an approved adjective and a non-approved verb, but **not as a noun** — as a component it is a technical noun (category 6) | Shows why the glossary must be consulted before concluding a dictionary word is misused. A dictionary hit does not close the lexical question. |
| `Do the leak test of the system` | Required by 1.2, discouraged by 3.7 (use a verb, not a noun, for an action) | Genuine tension in the standard. 3.7 stays advisory and must not fire where 1.2 forces the construction. Needs an explicit interaction test. |
| Sentence-initial capitalized word | Ambiguous between imperative verb, proper noun, and heading | Resolved by L1 block type before tagging, not by heuristics on the token. |
| `AS ... AS` | A discontinuous multi-word entry | Special-cased in the lexicon matcher; there is exactly one of these. |
| Quoted text, placards, uppercase runs | Rule 8.6 makes these one word and unchangeable, so they are not vocabulary | Excluded at L3, as the Elixir tokenizer already does. |
