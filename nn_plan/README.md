# A small CNN for enforcing ASD-STE100

Plan for a compact convolutional network that helps enforce the writing rules of
**ASD-STE100 Issue 9** (`2026-08-03/asd-ste100-issue-9.pdf`, 434 pages, 53 rules
in 9 sections plus 8 general recommendations).

| Document | Contents |
|---|---|
| [rule-triage.md](rule-triage.md) | All 53 rules classified by enforcement mechanism |
| [model.md](model.md) | Network architecture, tensor shapes, parameter budget |
| [data.md](data.md) | Corpus construction, labelling, synthetic violations |
| [evaluation.md](evaluation.md) | Metrics and acceptance gates |
| [integration.md](integration.md) | How the model plugs into the existing Elixir engine |

## The scoping decision

A CNN cannot enforce STE rules, and it should not try to. The rules are already
specified precisely enough to execute — "do not use the semicolon", "maximum 20
words per sentence", "this word is not in the dictionary". Learning those from a
few thousand examples would replace an exact answer with an approximate one.

What the rules *do* need, and what the standard assumes a human supplies, is
**linguistic analysis**: is this token a noun or a verb here, is this clause
passive, is this sentence an instruction or a note. Rule 1.2 illustrates it
exactly — the standard's own example is that `Test` is an approved noun but not
an approved verb, so `Test the system for leaks` fails while `Test B is an
alternative to test A` passes. Same word, same dictionary entry; only the
syntactic role differs. No lookup table decides that. A tagger does.

So the split this plan adopts:

```
        text
          │
          ▼
   ┌─────────────┐
   │  tokenizer  │  (exists: Ste.Text)
   └──────┬──────┘
          │ tokens
          ▼
   ┌─────────────┐        ┌──────────────────────┐
   │   CNN       │◄───────│ dictionary.json      │
   │  tagger     │        │ technical_terms.json │
   └──────┬──────┘        └──────────────────────┘
          │ POS tags, verb forms, voice, sentence type
          ▼
   ┌─────────────┐
   │ rule engine │  (exists: Ste.Rule + Ste.Rules.*)
   └──────┬──────┘
          │
          ▼
      findings, each citing a rule number
```

**The network never emits a violation.** It emits tags; the deterministic engine
decides. That matters for four reasons:

1. STE is a compliance standard. A finding has to cite a rule and explain
   itself to a technical publications reviewer. "The model scored 0.83" will not
   survive that conversation.
2. Rules change between issues. Issue 9 revised GR-1 through GR-6 and added
   GR-7 and GR-8. Editing a rule module beats retraining.
3. The engine can gate on tagger confidence — a low-confidence tag produces a
   "needs review" finding rather than a false accusation.
4. Rule 1.1 already works this way in `ste/lib/ste/rules/rule1_1.ex`, with no
   model at all. The architecture is set; this extends it.

## Where the CNN earns its place

A 1-D CNN is a genuinely good fit here, not a compromise:

- **Receptive field matches the domain.** Rules 5.1 and 6.3 cap sentences at 20
  and 25 words. Four dilated conv layers reach 31 tokens — the whole legal
  sentence, in one parallel pass, with no recurrence.
- **Character convolutions handle the open vocabulary.** The dictionary is
  closed (2,182 entries) but technical nouns are deliberately open-ended — rule
  1.5 says its category lists are examples, not a complete list. A char-CNN
  reads `-ing`, `-ed`, `-tion`, `-ment` off unseen words, which is precisely
  what rules 3.3, 3.5 and 3.7 turn on.
- **POS is overwhelmingly locally determined**, so the accuracy gap to a
  transformer is small, and the model fits in ~730k parameters and runs on CPU
  inside an authoring tool.

## Scope

Of 53 rules: **20 need no model** (already decidable), **19 become enforceable
with the tagger**, **14 are semantic or discourse-level** and stay out of scope.
Per-rule breakdown in [rule-triage.md](rule-triage.md).

Out of scope is a real answer, not a gap to fill later. Rule 1.11 ("do not use
different technical nouns for the same item") is a cross-document consistency
problem; rule 1.9 ("use one which is short and easy to understand") is a
judgement call the standard leaves to the writer. Shipping those as model
guesses would be worse than not shipping them.

## Milestones

| # | Milestone | Output | Gate |
|---|---|---|---|
| 0 ✅ | Corpus extraction | Clean sentence corpus from PDF + dictionary | ≥4,000 usable sentences — **5,868, zero column bleed** |
| 1 | Tier-A rules in Elixir | ~20 rules, no model | Pass the standard's own examples |
| 2 | POS tagger v1 | Char+word CNN, UD-pretrained | ≥95% tag accuracy on gold set |
| 3 | Domain adaptation | Fine-tuned on STE corpus | ≥97% on in-domain gold set |
| 4 | Verb-form + sentence heads | Multi-task model | See [evaluation.md](evaluation.md) |
| 5 | Tier-B rules in Elixir | ~19 rules consuming tags | ≥0.95 precision per rule |
| 6 | ONNX export + Ortex serving | Model runs in the Elixir engine | <10 ms/sentence CPU |

Milestone 1 is deliberately before any model work. It ships value on its own,
and it builds the harness that later milestones are measured in.

## A note on the source material

ASD-STE100 is free to use but its redistribution terms are restrictive, and the
PDF is set `copy:no`. Derived artefacts — `priv/dictionary.json` in particular,
which is a near-complete transcription of Part 2 — should stay out of any public
repository. Worth resolving before this grows past a local experiment.
