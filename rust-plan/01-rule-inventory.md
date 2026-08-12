# Rule inventory

Every rule of Part 1, with the analysis it needs and how far a program can go. This table is
the input to the architecture: the analysis layers in
[02-architecture.md](02-architecture.md) exist because these rules ask for them, and the
milestone order in [06-roadmap.md](06-roadmap.md) is a topological sort of this column.

## Tiers

| Tier | Meaning | Engine behaviour |
| --- | --- | --- |
| **D** | Decidable. The rule is a property of the text that a program can settle. | Emit a finding. Default severity `error`. |
| **G** | Decidable *given a project glossary* of technical nouns and verbs. The standard delegates the vocabulary to your subject field, so without a glossary the rule has no ground truth. | Emit a finding when a glossary is configured; otherwise emit one `warning` per document that the rule is disabled, and never a per-word finding. |
| **A** | Advisory. A program can measure a proxy for the rule but the judgment is human. | Emit `info`, off by default, opt in per project. |
| **H** | Human only. No proxy is honest. | Never emit. Listed in a review checklist the tool can print. |
| **M** | Measurement semantics. Not a diagnostic — the rule *defines* a quantity other rules use. | Implement in the analysis layer, not the rule registry. |

Totals: **22 D, 11 G, 10 A, 5 H, 5 M**.

## Layers

`L1` blocks and text type · `L2` sentences · `L3` tokens · `L4` word count ·
`L5` lexicon and morphology · `L6` part-of-speech lattice · `L7` chunks, verb groups, mood,
voice · `L8` corpus. Defined in [02-architecture.md](02-architecture.md).

---

## Section 1 — Words

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 1.1 | Use words that are approved in the dictionary, technical nouns, or technical verbs | **G** | L3 L5 | Already implemented in Elixir; port directly. Multi-word dictionary entries (58 of them, up to 3 words) must be matched before their parts. |
| 1.2 | Use approved words only as the specified part of speech | **D** | L5 L6 | The flagship hard rule. 191 headwords are homographs with two or more entries. Fires when *no* reading of the token in context matches an approved part of speech. |
| 1.3 | Use approved words only with their approved meanings | **H** | — | Semantic. The dictionary's `meaning` field is prose for humans. A collocation heuristic mined from the non-STE examples could be tried later, but it will not be sound. |
| 1.4 | Use only the approved forms of verbs and adjectives | **D** | L5 L6 | The dictionary lists forms explicitly for 256 entries (`REMOVE, REMOVES, REMOVED, REMOVED`; `SLOW, SLOWER, SLOWEST`). Anything else inflected off an approved headword is a violation. |
| 1.5 | You can use words that you can include in a technical noun category | **G** | L5 | 22 categories, 615 example terms extracted. Machine role: every non-dictionary word must resolve to a glossary entry carrying a category tag. |
| 1.6 | Use a non-approved word only when it is a technical noun or part of one | **G** | L5 L7 | The enforcement arm of 1.1/1.5. "Part of one" needs the multi-word noun span from L7. |
| 1.7 | Do not use words that are technical nouns as verbs | **G** | L6 L7 | Glossary noun + verb-slot position. |
| 1.8 | Use technical nouns that are approved in your company, industry, or subject field | **G** | L5 | Reduces to glossary membership. Unregistered term ⇒ finding. |
| 1.9 | Select a technical noun that is short and easy to understand | **A** | L5 | Proxy: word count and syllable count over a project threshold. |
| 1.10 | Do not use regional, slang, or jargon words as technical nouns | **A** | L5 | Needs a project deny list. Ship a small seed list; the judgment stays human. |
| 1.11 | Do not use different technical nouns for the same item | **G** | L8 | Corpus-scoped. Decidable when the glossary declares a preferred term with deprecated aliases; otherwise only a near-duplicate report for human triage. |
| 1.12 | You can use verbs that you can include in a technical verb category | **G** | L5 | 16 categories (manufacturing a–f, computing a–c, engineering/medical/operations/navigation/automotive/energy a–f, law), 163 example terms. |
| 1.13 | Do not use technical verbs as nouns | **G** | L6 L7 | Mirror of 1.7. |
| 1.14 | Use American English spelling | **D** | L5 | A British→American mapping table. Small, closed, testable. |

## Section 2 — Multi-word nouns

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 2.1 | Write multi-word nouns of no more than three words | **D** | L4 L7 | Needs the noun-cluster span, which is the hard part: `Horizontal cylinder pivot bearing` is four, `Actuator operating rod` is three. Determiners and the head noun's own modifiers must be counted the way the standard counts them, and the word count is the L4 count (so a hyphenated unit is one word, per 8.7 — which is exactly the escape hatch 2.2 offers). |
| 2.2 | Write a >3-word technical noun in full first, then give a short form or hyphenate | **G** | L7 L8 | First-use tracking across the document; then check the short form is used consistently. |

## Section 3 — Verbs

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 3.1 | Use only the verb forms given in the dictionary | **D** | L5 L6 | Overlaps 1.4; implement once, report under both ids. |
| 3.2 | Use only the infinitive, imperative, simple present, simple past, simple future, and past participle as adjective | **D** | L7 | Catches progressive (`is testing`) and perfect (`has removed`). Highest-value rule in the standard after 1.1 — it is mechanical, frequently broken, and the fix is obvious. |
| 3.3 | Use the past participle form as an adjective | **D** | L7 | Licenses the participle in adjective position so 3.2 does not false-positive on it. |
| 3.4 | Do not use auxiliary verbs to make complex verb constructions | **D** | L7 | Same verb-group machinery as 3.2. Permitted auxiliaries are a closed set from the dictionary. |
| 3.5 | Use the "-ing" form only as a technical noun or as a modifier in a technical noun | **G** | L6 L7 | Needs the glossary to license `operating rod`; otherwise every gerund is a violation. |
| 3.6 | Use the active voice; in descriptive writing you can use the passive only when the agent is unknown | **D** | L1 L7 | Passive detection (`be` + past participle) is decidable. The exception needs the block's text type from L1 and an agent-unknown judgment that is not. Resolution: emit `error` in procedural blocks, `info` in descriptive blocks, and say in the message that the exception may apply. |
| 3.7 | Use an approved verb for an action, not a noun or other part of speech | **A** | L7 | Nominalization detection (`do an inspection of` → `inspect`). Interacts with 1.2: `Do the leak test of the system` is *required* by 1.2 because `test` is not an approved verb. Advisory only, and the conflict needs a test — see [05-testing.md](05-testing.md). |

## Section 4 — Sentences

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 4.1 | Write short and clear sentences | **A** | L4 | Made concrete by 5.1 and 6.3; nothing to add at this level. |
| 4.2 | Do not omit words or use contractions | **D** | L3 L6 | Contractions are a closed lexical list — decidable. Omission (telegraphic style) is caught in practice by 4.5 and 3.2. |
| 4.3 | Use a vertical list for complex texts | **A** | L1 L2 L4 | Proxy: a long sentence with three or more coordinated items. |
| 4.4 | Use connecting words and phrases to connect related sentences | **A** | L2 L5 | Proxy: connective density per paragraph. Weak; keep off by default. |
| 4.5 | Use an article or demonstrative adjective before a noun or multi-word noun | **D** | L6 L7 | Common, mechanical, high value. Care needed with mass nouns, plurals, headings, and labels — headings are excluded by L1 block type. |

## Section 5 — Procedural writing

All of section 5 is conditioned on the block being **procedural**. Without L1 text typing these
rules cannot be applied correctly, which is why L1 comes before everything in the roadmap.

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 5.1 | Maximum 20 words per sentence | **D** | L1 L2 L4 | Fully decidable once L4 is right. |
| 5.2 | One instruction per sentence unless the actions are simultaneous | **D** | L7 | Coordinated imperatives. The "at the same time" exception is judgment, so the message must name it. |
| 5.3 | Write instructions in the imperative form | **D** | L7 | Sentence mood. |
| 5.4 | Start with the condition, then a comma, then the command | **D** | L7 | Leading subordinate clause plus comma. |
| 5.5 | Write notes only to give information, not instructions | **D** | L1 L7 | An imperative inside a `NOTE` block. Cheap, decidable, and genuinely useful — a good early win once L1 exists. |

## Section 6 — Descriptive writing

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 6.1 | Give information gradually | **H** | — | No honest proxy. |
| 6.2 | Use key words and phrases to give logical structure | **A** | L1 L2 | Proxy: presence of headings and topic sentences. |
| 6.3 | Maximum 25 words per sentence | **D** | L1 L2 L4 | Same engine as 5.1, different limit and text type. |
| 6.4 | Use paragraphs to show related information | **H** | — | |
| 6.5 | One topic per paragraph | **H** | — | Topic-drift scoring would need embeddings and would be wrong often enough to poison trust. Do not. |
| 6.6 | No more than six sentences per paragraph | **D** | L1 L2 | The simplest rule in the standard. Good smoke test for L1+L2. |

## Section 7 — Safety instructions

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 7.1 | Use a word such as "warning" or "caution" to identify the level of risk | **D** | L1 | A safety block must open with a configured signal word. |
| 7.2 | Start a safety instruction with a clear command or condition | **D** | L1 L7 | Mood of the first clause. |
| 7.3 | Give an explanation to show the risk or possible result | **A** | L1 L2 | Structural proxy: the block has a second part beyond the command. Whether it explains the risk is human. |

## Section 8 — Punctuation and word count

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 8.1 | All standard punctuation except the semicolon | **D** | L3 | One codepoint scan. **Build this first** as the end-to-end walking skeleton. |
| 8.2 | Use hyphens to connect directly related words | **A** | L7 | Judgment. |
| 8.3 | Permitted uses of parentheses (7 listed) | **A** | L3 L7 | Classifying paren contents into the seven licensed uses is partly decidable (references, letters/numbers, abbreviations, singular/plural); "to explain words" is not. |
| 8.4 | In a vertical list, a colon counts as a period | **M** | L2 | Sentence segmentation rule. |
| 8.5 | Parenthesized text counts as one word | **M** | L4 | |
| 8.6 | Numbers, numbers with units, abbreviations, alphanumeric identifiers, quoted text, titles/headings/placards/labels, and proper nouns each count as one word | **M** | L3 L4 | The token classifier. The Elixir `Ste.Text` module is a working draft of this and already implements most of it; the missing kinds are titles/labels (needs L1) and proper nouns (needs a name list or capitalization heuristic). |
| 8.7 | Hyphenated words count as one word | **M** | L3 L4 | |

**8.4 through 8.7 are not checks.** They define the word-count function that 2.1, 5.1, and 6.3
consume. Getting them wrong silently mis-scores three real rules, so they get their own test
suite independent of any diagnostic.

## Section 9 — Writing practices

| Rule | Statement | Tier | Needs | Notes |
| --- | --- | --- | --- | --- |
| 9.1 | Use a different sentence construction when word-for-word replacement is not sufficient | **M** | L5 L6 | Governs the **suggestion engine**, not a check. It states the conditions under which an auto-fix is *illegitimate*: the alternative has a different part of speech, or changes the meaning, or produces a meaningless result. Encode as the gate on emitting a `Fix`. |
| 9.2 | Use each approved word correctly | **H** | — | The standard's own explanation is a catalogue of individual word traps. Some could become specific pattern rules later, each one hand-written and separately justified. |
| 9.3 | When you use two words together, do not make phrasal verbs | **D** | L6 L7 | Verb + particle where the pair is not one of the dictionary's approved multi-word entries. Tractable and high value. |
| 9.4 | Use a consistent style for terminology and wording | **G** | L8 | Corpus-scoped: same concept, same wording; consistent date, number, and unit formats. |

## General recommendations

Advisory by nature — the standard calls them recommendations, so none should ever be `error`.

| GR | Subject | Tier | Notes |
| --- | --- | --- | --- |
| GR-1 | The conjunction "that" | **A** | Recommends keeping it rather than dropping it. |
| GR-2 | The preposition "with" | **A** | |
| GR-3 | How to use pronouns | **A** | |
| GR-4 | The pronoun "this" | **D** | Bare `this` with no following noun. Decidable, same machinery as 4.5. |
| GR-5 | False friends | **A** | Lexical warn list. |
| GR-6 | Latin abbreviations | **D** | Closed list: `e.g.`, `i.e.`, `etc.`, `viz.`, `et al.`. |
| GR-7 | Inclusive language | **D** | Project-configurable deny list with suggested replacements. |
| GR-8 | Possessive form | **D** | Detect `'s` and `'` possessives. |

## What this table implies

- **The glossary is not optional.** 11 rules are dark without it and 1.1 produces a false
  positive on every legitimate technical noun. A glossary bootstrap mode is therefore a
  first-class feature, not tooling: run over an existing corpus, collect every unknown word
  with its frequency and contexts, and emit a candidate glossary for a human to classify
  into the 22 noun and 16 verb categories. Do this in M2, before the rules that need it.
- **L7 is the centre of gravity.** 19 rules need chunks, verb groups, mood, or voice. It is
  one body of work serving most of sections 3, 5, and 7, and it should be built as a single
  deliberate shallow grammar rather than accreted rule by rule.
- **Text type gates 11 rules.** Sections 5, 6, and 7 apply to procedural, descriptive, and
  safety content respectively, and 3.6's exception depends on it. Plain text cannot carry
  that distinction, so the input format question in [07-decisions.md](07-decisions.md) is
  load-bearing rather than cosmetic.
