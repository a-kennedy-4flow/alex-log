# ste — a rule-by-rule checker for ASD-STE100 Simplified Technical English

Give it a string and a rule number, and it answers `true` or `false`:

```elixir
iex> Ste.passes?("Obey the safety instructions.", "1.1")
true

iex> Ste.passes?("A value of 2 mm is acceptable.", "1.1")
false

iex> Ste.check("A value of 2 mm is acceptable.", "1.1").findings
[
  %Ste.Finding{
    rule: "1.1",
    text: "acceptable",
    offset: 19,
    message: "\"acceptable\" is in the dictionary as a word that is not approved. ...",
    suggestions: ["PERMITTED (adj)", "SATISFACTORY (adj)", "SERVICEABLE (adj)"]
  }
]
```

From the shell:

```
mix ste.check "A value of 2 mm is acceptable."
mix ste.check --noun valve --noun shroud "Remove the valve from the shroud."
```

The source is ASD-STE100 Issue 9 (2025-01-15): part 1 gives 53 writing rules in
nine sections, part 2 gives the controlled dictionary.

## Layout

```
docs/rules/         one specification per rule, written as a decision procedure
  README.md         the index: what each rule needs and whether it is decidable
  1.1.md ... 9.4.md the 53 rules
lib/ste/
  dictionary.ex     part 2, loaded from priv/dictionary.json at compile time
  glossary.ex       technical nouns (rule 1.5) and technical verbs (rule 1.12)
  text.ex           tokenizer: the element kinds of rule 8.6 and 8.7
  inflect.ex        plurals of countable nouns, the only morphology STE needs
  rule.ex           the behaviour every rule module implements
  rules/rule1_1.ex  rule 1.1
priv/
  dictionary.json   2182 entries, generated from the PDF
  technical_terms.json  the example terms of rules 1.5 and 1.12
tools/
  extract_dictionary.py       PDF -> priv/dictionary.json
  validate_technical_terms.py checks the transcription against the PDF
```

## Bootstrapping

Both data files come out of the PDF of the standard, and both steps are
repeatable:

```
python3 tools/extract_dictionary.py path/to/asd-ste100-issue-9.pdf priv/dictionary.json
python3 tools/validate_technical_terms.py path/to/asd-ste100-issue-9.pdf priv/technical_terms.json
```

The extractor reads the four-column dictionary tables through
`pdftotext -bbox-layout`, assigning each cell to a column by its x position;
character-column output bleeds between columns on the narrow pages. It keeps the
headword, the part of speech, whether the word is approved (an UPPERCASE headword
is approved, a lowercase one is not), the other approved forms, the approved
meaning, the approved alternatives, and the STE and non-STE examples.

Fidelity against the counts that part 2 states:

| | Stated | Extracted |
| --- | --- | --- |
| approved words | 875 | 876 entries |
| words that are not approved | 1274 | 1306 entries |

The approved side is within one. The other side comes out higher because a word
with two parts of speech is two entries here (`test (n)` approved and `test (v)`
not approved), which is the shape the rules need. `mix test` asserts the counts
and spot-checks the entries that the writing rules quote, so a change in the
extractor that breaks the dictionary fails the suite.

`priv/technical_terms.json` is transcribed by hand from the category lists of
rules 1.5 and 1.12, and the validator confirms that all 778 terms occur in the
PDF.

## Status

`Ste.Rules.Rule1_1` is implemented, with 76 tests passing. Every other rule has a
specification in `docs/rules/` and no code yet; the index says what each one is
waiting for (a part-of-speech tagger, a company glossary, document structure, or a
human decision).

Each rule decides one thing only. `Check the laptop battery.` passes rule 1.1,
because "check" is an approved word; it fails rule 1.2, because "check" is not
approved as a verb, and rule 3.7, because an approved verb should describe the
action. Keeping the verdicts separate is what makes them useful.

## Adding the next rule

1. Read `docs/rules/<id>.md` and its "Discrete form" block.
2. `use Ste.Rule, id: "...", statement: "..."` and implement `check/2` returning
   `[%Ste.Finding{}]`; no findings means the text passes.
3. Add the module to `@rules` in `lib/ste.ex`.
4. Write the tests from the examples table of the specification, which are the
   standard's own examples.

The next three that need no new machinery are 8.1 (no semicolon), 6.6 (at most six
sentences per paragraph), and 1.14 (American English spelling). 5.1 and 6.3
(sentence length) need the word counter of rules 8.4 to 8.7 first, for which
`Ste.Text` is the start.

## A note on the source

ASD-STE100 is published by the AeroSpace and Defence Industries Association of
Europe. `priv/dictionary.json` is a derived copy of part 2 and carries the same
restrictions as the specification itself: keep it with your licensed copy of the
standard rather than publishing it.
