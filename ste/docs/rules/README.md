# The 53 writing rules of ASD-STE100, as discrete checks

One file per rule of part 1 of ASD-STE100, Issue 9 (2025-01-15). Each file
restates the rule, then rewrites it as a decision procedure: what it takes as
input, what makes a text fail, what is out of its scope, and which examples of
the standard it must get right.

Every rule is written to answer one question with `true` or `false` for a given
string, so that a text can fail one rule and pass its neighbours. Rule 1.1 asks
only "may this word be used at all"; that `Check the laptop battery.` uses an
approved noun as a verb is rule 1.2's finding, and that it describes an action
with a noun is rule 3.7's.

## What a rule needs to decide

| Input | Meaning |
| --- | --- |
| `text` | the string alone |
| `dictionary` | part 2 of the standard, in `priv/dictionary.json` |
| `glossary` | the technical nouns and verbs of the company, industry, or subject field (`priv/technical_terms.json` holds only the examples that rules 1.5 and 1.12 print) |
| `structure` | which text is a work step, a note, a safety instruction, a vertical list item, a title, or a paragraph |
| `parser` | part of speech and clause structure |
| `document` | the other sentences of the same document |
| `judgment` | a human decision that no checker can make on its own |

## Status

`Ste.Rules.Rule1_1` is implemented. The other rules have a specification and no
code yet; the "Decidable" line of each file says what it is waiting for.

| Rule | Statement | Needs | Decidable | Code |
| --- | --- | --- | --- | --- |
| [1.1](1.1.md) | Use words that are approved in the dictionary, technical nouns, or technical verbs | dictionary, glossary | yes | `Ste.Rules.Rule1_1` |
| [1.2](1.2.md) | Use approved words only as the specified part of speech | dictionary, parser | with a tagger | - |
| [1.3](1.3.md) | Use approved words only with their approved meanings | dictionary, judgment | partly | - |
| [1.4](1.4.md) | Use only the approved forms of verbs and adjectives | dictionary | yes | - |
| [1.5](1.5.md) | You can use words that you can include in a technical noun category | glossary | yes, given a glossary | - |
| [1.6](1.6.md) | Use a word that is not approved only when it is a technical noun or part of one | dictionary, glossary | yes, given a glossary | - |
| [1.7](1.7.md) | Do not use words that are technical nouns as verbs | glossary, parser | with a tagger | - |
| [1.8](1.8.md) | Use technical nouns that are approved in your company, industry, or subject field | glossary | yes, given a glossary with synonyms | - |
| [1.9](1.9.md) | When you must select a technical noun, use one which is short and easy to understand | glossary, judgment | length only | - |
| [1.10](1.10.md) | Do not use regional, slang, or jargon words as technical nouns | glossary | yes, given a deny list | - |
| [1.11](1.11.md) | Do not use different technical nouns for the same item | glossary, document | yes, given synonym groups | - |
| [1.12](1.12.md) | You can use verbs that you can include in a technical verb category | glossary | yes, given a glossary | - |
| [1.13](1.13.md) | Do not use technical verbs as nouns | glossary, parser | with a tagger | - |
| [1.14](1.14.md) | Use American English spelling | text | yes | - |
| [2.1](2.1.md) | Write multi-word nouns of no more than three words | parser, glossary | with a chunker | - |
| [2.2](2.2.md) | When a technical noun has more than three words, write it in full, then shorten it | glossary, document | yes, given a glossary | - |
| [3.1](3.1.md) | Use only the verb forms that are given in the dictionary | dictionary, parser | mostly | - |
| [3.2](3.2.md) | Use only the approved verb forms and tenses | parser | yes for the named tenses | - |
| [3.3](3.3.md) | Use the past participle form as an adjective | dictionary, parser | with a tagger | - |
| [3.4](3.4.md) | Do not use auxiliary verbs to make complex verb constructions | parser | yes for the named patterns | - |
| [3.5](3.5.md) | Use the "-ing" form only as a technical noun or as a modifier in one | dictionary, glossary | yes | - |
| [3.6](3.6.md) | Use the active voice; passive only in descriptive writing when the agent is unknown | parser, structure, judgment | detection yes, exception no | - |
| [3.7](3.7.md) | Use an approved verb to describe an action, not a noun | dictionary, parser | heuristic | - |
| [4.1](4.1.md) | Write short and clear sentences | judgment | no, see 5.1 and 6.3 | - |
| [4.2](4.2.md) | Do not omit words or use contractions | text, parser | contractions yes | - |
| [4.3](4.3.md) | Use a vertical list for complex text | structure | formatting yes | - |
| [4.4](4.4.md) | Use connecting words and phrases between related sentences | text, judgment | reporting only | - |
| [4.5](4.5.md) | Use an article or a demonstrative adjective before a noun | parser, judgment | heuristic | - |
| [5.1](5.1.md) | Write sentences of a maximum of 20 words in procedures | text, structure | yes | - |
| [5.2](5.2.md) | Write only one instruction in each sentence | parser, judgment | detection yes | - |
| [5.3](5.3.md) | Write instructions in the imperative form | parser, structure | yes | - |
| [5.4](5.4.md) | Put a condition first and divide it from the command with a comma | parser | yes | - |
| [5.5](5.5.md) | Write notes only to give information, not instructions | structure, parser | yes | - |
| [6.1](6.1.md) | Give information gradually | judgment | no | - |
| [6.2](6.2.md) | Use key words and key phrases to give a logical structure | text | reporting only | - |
| [6.3](6.3.md) | Write sentences of a maximum of 25 words in descriptions | text, structure | yes | - |
| [6.4](6.4.md) | Use paragraphs to show related information | structure, judgment | no | - |
| [6.5](6.5.md) | Make sure that each paragraph has only one topic | judgment | no | - |
| [6.6](6.6.md) | Make sure that no paragraph has more than six sentences | text, structure | yes | - |
| [7.1](7.1.md) | Use a word that identifies the level of risk | structure, judgment | presence yes, level no | - |
| [7.2](7.2.md) | Start a safety instruction with a command or a condition | structure, parser | yes | - |
| [7.3](7.3.md) | Give an explanation to show the risk or possible result | structure | heuristic | - |
| [8.1](8.1.md) | You can use all standard punctuation but not the semicolon | text | yes | - |
| [8.2](8.2.md) | Use hyphens to connect words that are directly related | parser, judgment | patterns only | - |
| [8.3](8.3.md) | Use parentheses only for the seven listed purposes | text, judgment | heuristic | - |
| [8.4](8.4.md) | In a vertical list, a colon ends a sentence | structure | yes (counter rule) | - |
| [8.5](8.5.md) | Text in parentheses counts as one word | text | yes (counter rule) | - |
| [8.6](8.6.md) | Numbers, units, abbreviations, identifiers, quoted text, titles, and proper nouns count as one word | text | yes (counter rule) | `Ste.Text` |
| [8.7](8.7.md) | Hyphenated words count as one word | text | yes (counter rule) | `Ste.Text` |
| [9.1](9.1.md) | Use a different sentence construction when a word-for-word replacement is not sufficient | judgment | no, it is a repair rule | - |
| [9.2](9.2.md) | Use each approved word correctly | dictionary, judgment | partly, see 1.2 and 1.3 | - |
| [9.3](9.3.md) | When you use two words together, do not make phrasal verbs | dictionary, parser | yes, given a phrasal list | - |
| [9.4](9.4.md) | When you select terminology or wording, always use a consistent style | document | yes, given synonym groups | - |
| [GR](general-recommendations.md) | The eight general recommendations of section 9 | - | advice, not rules | - |

## The three counter rules

Rules 8.4 through 8.7 do not judge a text on their own: they define how to count
words for rules 5.1, 6.3, and 2.1. They are written up as specifications of the
counter, and `Ste.Text` already implements the tokenizing part of 8.6 and 8.7.
