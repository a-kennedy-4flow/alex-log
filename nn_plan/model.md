# Model architecture

One shared convolutional encoder, three prediction heads. Roughly **730k
parameters**, ~2.9 MB at fp32 and under 1 MB quantized — small enough to run on
CPU inside an authoring tool.

## What it predicts

The heads are chosen to cover exactly the 19 Tier-B rules in
[rule-triage.md](rule-triage.md), and nothing more.

| Head | Type | Classes | Serves rules |
|---|---|---|---|
| **POS** | per token | 14 | 1.2, 1.4, 1.6, 1.7, 1.13, 2.1, 2.2, 3.7, 4.5, 9.3 |
| **Verb form** | per token | 10 | 3.1–3.6, 5.2, 5.3, 7.2 |
| **Sentence** | per sentence | 4 tasks | 3.6, 5.1 vs 6.3, 5.4, 5.5, 7.2 |

**POS tag set** (14): `n adj v adv prep conj pron art num punc tech-n tech-v abbr other`

The last four matter and are not standard. `tech-n` and `tech-v` distinguish
open-vocabulary technical terms from dictionary words, which is the distinction
rules 1.7 and 1.13 are entirely about. `abbr` and `num` mark the tokens rule 8.6
excludes from vocabulary checks.

**Verb-form tag set** (10): `not-verb infinitive imperative simple-present
simple-past future past-participle-adj passive-verb gerund-noun auxiliary`

This set is derived directly from rule 3.2's permitted list, plus the three
things the rules forbid: `passive-verb` (3.6), `gerund-noun` used wrongly (3.5),
and `auxiliary` chains (3.4). Splitting `past-participle-adj` from
`passive-verb` is the whole content of rule 3.3, and it is the hardest
distinction in the tag set.

**Sentence tasks** (4 independent outputs):
`procedural | descriptive` · `instruction | note | safety` · `active | passive` ·
`warning | caution | none`

## Token representation

Three sources concatenated, 168 dimensions per token.

```
token "adjusted"
  │
  ├─ word embedding ────────────── 48d   vocab 6,000
  │
  ├─ char CNN ──────────────────── 96d   widths 3/4/5 × 32 filters, max-pooled
  │                                       captures -ed, -ing, -tion, -ment
  │
  └─ lexicon features ──────────── 24d   read from dictionary.json at runtime
                                          ────
                                          168d
```

### The lexicon features do most of the work

24 dimensions, zero learned parameters, straight out of the two JSON files that
already exist in `ste/priv/`:

| Dims | Feature |
|---|---|
| 8 | Multi-hot of dictionary POS tags for this word (`v adj n adv prep conj pron art` — the exact 8 tags present across all 2,182 entries) |
| 1 | `approved` flag |
| 2 | Appears in `technical_terms.json` as noun / as verb |
| 1 | Appears in the subject-field glossary in use (`priv/glossaries/`) |
| 5 | Form slot from `entry.forms`: base / -s / -ed / -ing / irregular |
| 3 | Shape: initial capital / all caps / contains digit |
| 4 | Is hyphenated / is in a known multi-word entry / sentence-initial / follows an article |

This is why the model can be tiny. The entire STE dictionary is handed to the
network as a prior; the convolutions only have to *disambiguate* — pick between
the POS tags a word could legally carry — rather than learn the lexicon from
~5,000 sentences, which would not work.

It also means an unseen technical noun is not a blind spot. The char-CNN reads
its morphology and the lexicon features report "not in dictionary, in glossary
as a noun", which is exactly the evidence rule 1.6 needs.

## Encoder: stacked dilated convolutions

Four residual blocks, kernel width 3, dilations 1 / 2 / 4 / 8, 128 channels,
GLU activation, layer norm.

```
input   168d ──┐
               ▼
      ┌────────────────────┐
      │ conv k=3 d=1 → GLU │  RF ±1     local morphology, articles
      └────────┬───────────┘
               ▼  + residual, layer norm
      ┌────────────────────┐
      │ conv k=3 d=2 → GLU │  RF ±3     noun compounds (rule 2.1)
      └────────┬───────────┘
               ▼
      ┌────────────────────┐
      │ conv k=3 d=4 → GLU │  RF ±7     verb groups, auxiliary chains (3.4)
      └────────┬───────────┘
               ▼
      ┌────────────────────┐
      │ conv k=3 d=8 → GLU │  RF ±15    clause structure, voice (3.6)
      └────────┬───────────┘
               ▼
          128d per token
```

**Receptive field: 31 tokens.** Rules 5.1 and 6.3 cap sentences at 20 and 25
words, so the top layer sees the entire legal sentence from any position. This
is the specific reason a CNN is sufficient here rather than a compromise: the
domain has a hard, short, standard-mandated context bound. Dilation gets that
reach in 4 layers instead of the 15 a plain stack would need.

GLU over ReLU because gating helps the auxiliary-chain and voice distinctions,
where the network needs to suppress rather than accumulate evidence.

## Heads

**POS and verb-form heads** are linear projections from 128d per token, trained
with cross-entropy. No CRF layer initially — the lexicon features already
constrain the output space heavily. Add a CRF only if the error analysis shows
illegal tag sequences, which it may for the auxiliary chains.

**Sentence head** is Kim-style: max-over-time pool the 128 channels across the
sentence, one hidden layer to 64, then four independent softmaxes. Max pooling
rather than mean because the signals are presence-detectors — one passive
construction makes the sentence passive.

## Parameter budget

| Component | Parameters |
|---|---|
| Word embedding (6,000 × 48) | 288,000 |
| Char embedding (96 × 16) + char convs | 7,800 |
| Conv block 1 (168 → 256, k=3) | 129,000 |
| Conv blocks 2–4 (128 → 256, k=3) | 295,000 |
| Layer norms, biases | ~2,000 |
| POS head (128 → 14) | 1,800 |
| Verb-form head (128 → 10) | 1,300 |
| Sentence head (128 → 64 → 10) | 8,800 |
| **Total** | **~734,000** |

The word embedding is 39% of the model and the first thing to cut if size
matters. Dropping to vocab 4,000 × 32 saves 160k parameters; the char-CNN and
lexicon features should absorb most of the loss, but measure it.

## Training

Multi-task, all three heads jointly, weighted `1.0 · POS + 1.0 · verb-form +
0.5 · sentence`. The sentence head has far fewer labels and will overfit if
weighted equally.

- Adam, lr 1e-3, cosine decay, batch 32 sentences, bucketed by length
- Dropout 0.3 on the token representation, 0.1 between conv blocks
- Word dropout: replace 10% of tokens with `UNK` during training, forcing the
  model to rely on char and lexicon features — this is what makes it robust to
  unseen technical nouns at inference
- Early stopping on the held-out gold set, not on the synthetic data

Expected: ~20 minutes on a laptop CPU, a couple of minutes on any GPU. Small
enough that hyperparameter search is cheap; do it properly rather than guessing.

## Deliberately not in this design

- **No transformer, no attention.** The 31-token receptive field already covers
  the maximum legal sentence. Self-attention would add parameters to model
  dependencies the standard forbids from existing.
- **No sequence-to-sequence rewriting.** Suggesting a corrected sentence
  (rule 9.1) is a generation task. The dictionary's `alternatives` field already
  supplies word-level suggestions deterministically, which `rule1_1.ex` uses
  today.
- **No end-to-end violation classifier.** Reasons in the [README](README.md).
