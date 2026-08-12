# Integration with the existing engine

There is already a working STE engine in [ste/](../ste/) — Elixir, with
`Ste.Rule` as the behaviour, `Ste.Text` tokenizing, `Ste.Dictionary` and
`Ste.Glossary` doing lookups, and rule 1.1 fully implemented in
[rule1_1.ex](../ste/lib/ste/rules/rule1_1.ex). The plan extends it rather than
replacing it.

## Where the model goes

Train in PyTorch, export to ONNX, run inside Elixir via
[Ortex](https://github.com/elixir-nx/ortex). The rule engine stays one process
in one language, and the model becomes a dependency of it rather than a service
beside it.

```
Ste.Text.tokenize/1          existing
        │  [%Token{}]
        ▼
Ste.Tagger.tag/2             NEW — Ortex, ~730k params, CPU
        │  [%Token{pos:, verb_form:, confidence:}]
        │  %Sentence{type:, voice:}
        ▼
Ste.Rule.evaluate/3          existing
        │
        ▼
[%Ste.Finding{}]             existing
```

The alternative — a Python service over HTTP — was rejected: it puts a network
hop and a second runtime in the path of a function that has to run on every
keystroke in an authoring tool, and it splits the rule logic across two
languages. ONNX inference for a model this size is well under the 10 ms budget
on CPU.

## What changes in the existing code

**`Ste.Text.Token`** gains three optional fields — `pos`, `verb_form`,
`confidence`. Optional so that Tier-A rules keep working with no tagger loaded,
which keeps milestone 1 shippable on its own and keeps the test suite fast.

**`Ste.Rule.check/2`** already takes `opts`. The tagged tokens go in there; no
signature change. Rule 1.1 continues to ignore them.

**New: `Ste.Tagger`** wraps Ortex. Loads the ONNX model, builds the 24-dim
lexicon feature vector per token from `Ste.Dictionary` and `Ste.Glossary`,
batches sentences, returns tagged tokens. The lexicon features are computed in
Elixir at inference time from the same JSON the rules use — so the model and the
rules can never disagree about whether a word is in the dictionary.

**New: `Ste.Rules.Rule1_2`** and the rest of Tier B, each following the existing
pattern:

```elixir
defmodule Ste.Rules.Rule1_2 do
  use Ste.Rule,
    id: "1.2",
    statement: "Use approved words from the dictionary only as the specified part of speech."

  def check(text, opts) do
    text
    |> Ste.Tagger.tag(opts)
    |> Enum.filter(&(&1.kind == :word))
    |> Enum.flat_map(&check_token(&1, opts))
  end

  defp check_token(%{confidence: c} = token, _opts) when c < 0.8,
    do: [review_finding(token)]        # uncertainty reads as uncertainty

  defp check_token(token, _opts) do
    case Ste.Dictionary.lookup(token.text) do
      {:ok, %{approved: true, pos: pos}} when pos != token.pos -> [finding(token, pos)]
      _ -> []
    end
  end
end
```

That confidence clause is the shape of the whole design: the model contributes
evidence, the rule decides, and low confidence produces a review flag rather
than an accusation.

## Build pipeline

```
nn_plan/                    this plan
ste/tools/
  extract_dictionary.py     FIXED — per-word column grouping (milestone 0)
  validate_glossary.py      NEW — checks a project glossary against the rules
  extract_examples.py       TODO — rule-tagged acceptance pairs from Part 1
  corrupt.py                TODO — synthetic violations, engine-verified
  train.py                  TODO — PyTorch, multi-task
  export_onnx.py            TODO
ste/priv/
  dictionary.json           existing (2,182 entries, 5,868 example sentences)
  technical_terms.json      existing (rules 1.5 and 1.12 category lists)
  glossaries/
    java_python.json        NEW — 124 technical nouns, 26 technical verbs
  tagger.onnx               TODO — ~3 MB fp32, under 1 MB quantized
```

Python stays in `tools/` — a build-time dependency that produces `tagger.onnx`,
not a runtime one. Anyone running the engine needs Elixir and the checked-in
model file; only someone retraining needs PyTorch.

## Documentation debt

`rule1_1.ex` says *"The specification is `docs/rules/1.1.md`"* but
[ste/docs/rules/](../ste/docs/rules/) is empty. Each rule module's written
specification should land with the rule. For Tier B these matter more than for
Tier A — the spec is where the tag-to-finding logic gets justified against the
standard's text, and it is what makes a false positive diagnosable later.

## Sequencing against the milestones

| Milestone | Integration work |
|---|---|
| 0 ✅ | Fix `extract_dictionary.py`; add `extract_examples.py` |
| 1 | ~19 more Tier-A rule modules; no model, no `Ste.Tagger` |
| 2–4 | Python only; the Elixir engine is untouched |
| 5 | `Ste.Tagger` + Tier-B rule modules |
| 6 | ONNX export, Ortex wiring, latency measurement |

Milestone 1 ships a working Tier-A-only checker with no ML in it at all. If the
model work stalls, that is still a useful tool — and it is also the harness that
verifies the synthetic training data in milestone 4, so it is on the critical
path regardless.
