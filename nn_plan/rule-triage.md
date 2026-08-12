# Rule triage

Every rule in Part 1 of ASD-STE100 Issue 9, classified by what it takes to
enforce it. This drives the whole plan: it decides what the network must
predict, and — more usefully — what it must not be asked to.

**Tier A — deterministic.** Lookup, counting, or pattern matching. Exact
answers. A model here would only introduce error.

**Tier B — needs the tagger.** Decidable once you know each token's part of
speech, verb form, and the sentence's type and voice. This is the CNN's target.

**Tier C — semantic or discourse.** Word sense, subject-field judgement,
cross-document consistency. Out of scope; see the note at the end.

---

## Section 1 — Words (14 rules)

| Rule | Statement (abbreviated) | Tier | Mechanism |
|---|---|---|---|
| 1.1 | Use words approved in the dictionary, technical nouns, or technical verbs | A | Set lookup. **Already implemented** in `ste/lib/ste/rules/rule1_1.ex` |
| 1.2 | Use approved words only as the specified part of speech | **B** | Compare predicted POS against `entry.pos` |
| 1.3 | Use approved words only with their approved meanings | C | Word sense disambiguation |
| 1.4 | Use only the approved forms of verbs and adjectives | A+**B** | `entry.forms` lookup (250 entries carry forms); needs POS to know which paradigm applies |
| 1.5 | You can use words in a technical noun category | C | Subject-field judgement; standard says lists are examples only |
| 1.6 | Use a non-approved word only when it is a technical noun or part of one | A+**B** | Lookup plus POS to confirm nominal use |
| 1.7 | Do not use technical nouns as verbs | **B** | POS tag on a glossary-matched token |
| 1.8 | Use technical nouns approved in your company or subject field | A | Company glossary lookup |
| 1.9 | Select a technical noun that is short and easy to understand | C | Judgement |
| 1.10 | Do not use regional, slang, or jargon words as technical nouns | C | Needs a curated blocklist; not learnable from this data |
| 1.11 | Do not use different technical nouns for the same item | C | Cross-document consistency |
| 1.12 | You can use verbs in a technical verb category | C | Subject-field judgement |
| 1.13 | Do not use technical verbs as nouns | **B** | POS tag on a glossary-matched token |
| 1.14 | Use American English spelling | A | Spelling variant table |

## Section 2 — Multi-word nouns (2 rules)

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 2.1 | Write multi-word nouns of no more than three words | **B** | Needs noun-phrase chunking to find where the compound starts and ends — counting alone cannot |
| 2.2 | When a technical noun has more than three words, write it in full, then shorten | **B**+C | Chunking finds the candidate; the shortening strategy is a judgement call |

## Section 3 — Verbs (7 rules)

The densest Tier-B section. Every rule here needs the verb-form head.

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 3.1 | Use only the verb forms given in the dictionary | A+**B** | `entry.forms` lookup, gated on the token being a verb |
| 3.2 | Use only: infinitive, imperative, simple present, simple past, future, past participle as adjective | **B** | Verb-form head, direct |
| 3.3 | Use the past participle form as an adjective | **B** | Must distinguish participial adjective from passive verb — the head's hardest class |
| 3.4 | Do not use auxiliary verbs to make complex verb constructions | **B** | Detect auxiliary chains (`must be able to be adjusted`) |
| 3.5 | Use the "-ing" form only as a technical noun or a modifier in one | **B** | Gerund vs participle vs nominal modifier |
| 3.6 | Use the active voice; passive only in descriptive writing when the agent is unknown | **B** | Voice head × sentence-type head. Passive is legal only where *both* conditions hold |
| 3.7 | Use an approved verb to describe an action, not a noun | **B** | Nominalization detection (`do an inspection of` → `inspect`) |

## Section 4 — Sentences (5 rules)

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 4.1 | Write short and clear sentences | A | Word count under 8.5–8.7 semantics |
| 4.2 | Do not omit words or use contractions | A | Contraction pattern list |
| 4.3 | Use a vertical list for complex texts | A+C | Detectable when a list exists; "should there be one" is judgement |
| 4.4 | Use connecting words and phrases between related sentences | C | Discourse relation |
| 4.5 | Use an article or demonstrative adjective before a noun | **B** | Requires NP boundary detection + POS |

## Section 5 — Procedural writing (5 rules)

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 5.1 | Maximum 20 words per sentence | A | Count. Selecting the 20-word limit over 6.3's 25 needs the sentence-type head |
| 5.2 | One instruction per sentence unless actions are simultaneous | **B** | Count imperative verbs; the "simultaneous" exception needs `while`/`at the same time` cues |
| 5.3 | Write instructions in the imperative form | **B** | Verb-form head |
| 5.4 | Start with a descriptive statement when there is a prior condition, then a comma | **B** | Clause-order + comma structure |
| 5.5 | Write notes only to give information, not instructions | **B** | Sentence-type head: no imperatives inside a note block |

## Section 6 — Descriptive writing (6 rules)

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 6.1 | Give information gradually | C | Discourse |
| 6.2 | Use key words and phrases to give logical structure | C | Discourse |
| 6.3 | Maximum 25 words per sentence | A | Count |
| 6.4 | Use paragraphs to show related information | C | Discourse |
| 6.5 | Each paragraph has only one topic | C | Topic modelling; well beyond a small CNN |
| 6.6 | No paragraph has more than six sentences | A | Count |

## Section 7 — Safety instructions (3 rules)

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 7.1 | Use an applicable word (`warning`, `caution`) to identify the risk level | A | Keyword lookup |
| 7.2 | Start a safety instruction with a clear command or condition | **B** | First-clause type from the verb-form head |
| 7.3 | Give an explanation to show the risk or possible result | C | Requires understanding whether an explanation was actually given |

## Section 8 — Punctuation and word count (7 rules)

Entirely Tier A, and the foundation everything else counts on — rules 4.1, 5.1
and 6.3 are meaningless until 8.4 through 8.7 define what a word is.

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 8.1 | All standard punctuation except the semicolon | A | Character scan |
| 8.2 | Use hyphens to connect directly related words | A | Pattern |
| 8.3 | Parentheses for references and identifiers | A | Pattern |
| 8.4 | A colon in a vertical list counts as a period | A | Counting semantics |
| 8.5 | Parenthesized text counts as one word | A | Counting semantics |
| 8.6 | Numbers, numbers with units, abbreviations count as one word | A | Counting semantics; `rule1_1.ex` already skips these as non-vocabulary |
| 8.7 | Hyphenated words count as one word | A | Counting semantics; `Text.hyphen_parts/1` exists |

## Section 9 — Writing practices (4 rules + 8 general recommendations)

| Rule | Statement | Tier | Mechanism |
|---|---|---|---|
| 9.1 | Use a different sentence construction when word-for-word replacement is insufficient | C | Generative rewriting |
| 9.2 | Use each approved word correctly | C | Overlaps 1.3 |
| 9.3 | When you use two words together, do not make phrasal verbs | **B** | Verb + particle detection |
| 9.4 | Use a consistent style | C | Cross-document |
| GR-1…GR-8 | `that`, `with`, pronouns, `this`, false friends, Latin abbreviations, inclusive language, possessive form | mostly A | GR-6 and GR-8 are pattern matches; GR-3 and GR-4 need coreference (C) |

---

## Totals

| Tier | Count | Status |
|---|---|---|
| A — deterministic | 20 | 1 of 20 implemented (rule 1.1) |
| **B — needs the tagger** | **19** | **The model's target** |
| C — out of scope | 14 | Deliberately excluded |

## Why Tier C stays out

These aren't a backlog. Each fails for a specific reason:

- **1.3, 9.2** need word sense disambiguation against dictionary glosses. That
  is a retrieval problem, not a convolution problem — and the dictionary's
  `meaning` field is often empty for non-approved entries.
- **1.5, 1.9, 1.10, 1.12** ask whether a term is appropriate to a subject field.
  The standard explicitly delegates this to a company glossary. Guessing would
  contradict the rule it implements.
- **1.11, 9.4** are consistency checks across a whole document set — tractable,
  but as an indexing problem, not a per-sentence classifier.
- **6.1, 6.2, 6.4, 6.5, 7.3** are discourse-level and need far more context than
  a 31-token receptive field.
- **9.1** requires generating a rewritten sentence.

The right disposition for most of Tier C is a flag for human review, not a
finding. A few (1.11, 9.4) could be exact checks later with a document-level
index — worth doing, but a different piece of work.
