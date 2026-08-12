# Evaluation

## Precision over recall, deliberately

The two failure modes are not symmetric.

A **false positive** tells a technical author that compliant text breaks a rule.
They check the standard, find the tool wrong, and trust it less. A few of those
and the tool gets switched off — at which point its recall is zero regardless of
what the benchmark said.

A **false negative** lets a violation through. The text is no worse than it
would have been without the tool, and a human reviewer is still in the loop,
because STE compliance was always a review process.

So: **≥0.95 precision per rule is the ship gate. Recall is reported, not
gated.** A rule that fires rarely but is right when it fires is useful. A rule
at 0.70 precision is worse than nothing and should be disabled rather than
shipped with a caveat.

This also decides what to do with low-confidence tags. Below threshold, the
engine emits **"needs review"** citing the rule, not a violation. Uncertainty
should read as uncertainty.

## Three levels

### 1. Tagger accuracy — is the model any good?

On the 250-sentence gold test set, measured once.

| Metric | Target | Notes |
|---|---|---|
| POS accuracy, all tokens | ≥97% | Post domain-adaptation |
| POS accuracy, out-of-dictionary tokens | ≥90% | The real test — char-CNN and lexicon features carrying unseen technical nouns |
| Verb-form accuracy | ≥95% | |
| `past-participle-adj` vs `passive-verb` F1 | ≥0.90 | Rule 3.3 is exactly this distinction; report it separately or it hides in the average |
| Sentence type (procedural/descriptive) | ≥95% | Selects the 20- vs 25-word cap |
| Voice (active/passive) | ≥95% | Rule 3.6 |

Report **out-of-dictionary POS accuracy separately and prominently.** Overall
accuracy is inflated by the 2,182 words whose POS the lexicon features already
supply. The interesting question is what happens on a technical noun the model
has never seen, since rule 1.5 guarantees those exist.

### 2. Per-rule precision and recall — is the *system* any good?

The tagger is a component; the finding is the product. For each of the 19
Tier-B rules, measured on the held-out acceptance pairs from Part 1:

```
                    precision   recall    n
Rule 1.2    POS misuse           1.00      0.83     6
Rule 3.6    passive voice        0.95      0.71    14
Rule 3.7    nominalization       0.92 ✗    0.60    10
                                 ^^^^ below 0.95 gate — disable or fix
```

With roughly a dozen examples per rule, **report counts, not just
percentages** — `5/6` is honest, `83.3%` implies a precision the sample size
does not support. Wilson confidence intervals on each, so a rule at `1.00 (n=4)`
is not mistaken for a solved problem.

### 3. Acceptance — does it agree with the standard?

The binary version, on all ~280 Part 1 pairs:

- Every `Non-STE:` example must produce **at least one finding**, and it must
  cite the rule the example illustrates.
- Every `STE:` example must produce **no findings at all**.

The second is the harder and more important half. The `STE:` examples are the
standard's own certified-compliant text. A false positive there is unambiguous
evidence of a bug, with no interpretation needed.

**Gate: ≥90% of `STE:` examples clean.** Every failure gets read individually,
not just counted — each one is either a tagger error, a rule-logic error, or a
misreading of the standard, and the three need different fixes.

## Baselines

Report these alongside the model, or there is no way to know whether the CNN
earned its ~730k parameters:

| Baseline | Why |
|---|---|
| **Most-frequent-tag from the dictionary** | Assign each word its `entry.pos`, no context. This is the number to beat. If the CNN only matches it, the lexicon features are doing all the work and the convolutions are decoration. |
| **Tier-A rules alone** | The 20 deterministic rules from milestone 1. Establishes what the model adds over no model at all. |
| **Off-the-shelf tagger** (spaCy `en_core_web_sm`) | ~13 MB, general-domain. If it matches the custom model after tag-set mapping, the honest answer is to use it and skip milestones 2–4 entirely. |

That last baseline is a genuine kill criterion and should be run **early — at
milestone 2, before investing in domain adaptation.** The custom model's case
rests on the `tech-n` / `tech-v` distinction and imperative-heavy text, neither
of which spaCy handles well. Check that assumption rather than assuming it.

## Error analysis

Per milestone, not just at the end. Three fixed questions:

1. **Which rule produces the most false positives?** Fix or disable it. One
   noisy rule discredits the whole tool.
2. **Do errors concentrate in out-of-dictionary tokens?** If yes, the char-CNN
   is underpowered — widen the filters before adding conv layers.
3. **Is the model getting the tag right but the rule getting the finding
   wrong?** Common and easy to misdiagnose. Rule logic bugs look like model
   errors from the outside. Log the tag and the finding together so they can be
   separated.

## Guarding against the two ways this goes wrong quietly

**Casing leakage.** Covered in [data.md](data.md): dictionary STE examples are
uppercase, non-STE lowercase. Verify the corpus is lowercased by training a
deliberately crippled model — logistic regression on casing features alone. It
should score near chance. If it scores well, the leak is still there.

**Synthetic template memorisation.** The corruption generators are templated, so
a model can learn the templates rather than the linguistics. The acceptance set
guards this — it is human-written and never trained on. Watch for the
signature: high synthetic-validation accuracy alongside poor acceptance results.

## Reporting

One table per milestone in this folder, appended not overwritten, each with the
commit hash and the corpus version. The gold test set is touched **once**, at
the end. Everything during development runs against the 250-sentence dev split.

Given ~280 acceptance examples across 19 rules, the difference between 94% and
96% is a couple of sentences. Treat these numbers as coarse signals about
whether an approach works, not as a leaderboard.
