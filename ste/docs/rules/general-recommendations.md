# The general recommendations of section 9 (GR-1 to GR-8)

The standard is explicit: "The general recommendations (GR) in this section are not
STE rules. They can help you prevent typical errors that writers make." None of
them gives a pass or fail verdict. They belong in a checker as reports, or in a
review checklist.

## GR-1 — The conjunction "that"

Use the conjunction "that" as much as possible to connect new information in a
subordinate clause to a main clause, after verbs such as "make sure", "show", and
"recommend". Native English speakers frequently omit it in speech and in writing,
but it shows the reader where the main clause ends and the subordinate clause
starts, and it helps translation, because many languages cannot omit the
equivalent word.

**Checkable as:** a report of a missing "that" after the verbs of the list.

## GR-2 — The preposition "with"

"With" has three approved meanings: association or relationship, help or sharing,
and a means or instrument. `Install the panel with the green fasteners` can mean
three different things (the panel that has green fasteners, the panel together with
the fasteners, or use the fasteners to install the panel). Usually the context is
enough; when you use "with", read the sentence again and make sure that it is not
ambiguous and that the meaning has not changed.

| Do not write | Write |
| --- | --- |
| `Lift the aircraft at the maximum takeoff weight with passengers.` | `Lift the aircraft at the maximum takeoff weight (passenger weight included).` |
| `Make sure that the lever does not touch the stop (1) with hydraulic pressure supplied.` | `When you supply hydraulic pressure, make sure that the lever does not touch the stop (1).` (condition first, rule 5.4) |
| `Use tool TS9867 to seal the opening.` | `Seal the opening with tool TS9867.` (the primary action verb is "seal", not "use") |

**Checkable as:** a report on sentences where "with" is followed by a noun that
could attach to more than one earlier noun.

## GR-3 — How to use pronouns

Pronouns refer to a person, a location, or an item that is already in the text. In
STE the approved pronouns are the ones in the dictionary; do not use a pronoun that
is not there (for example "she" or "he"). If a pronoun can refer to more than one
noun, replace it with the noun that it refers to.

| Do not write | Write |
| --- | --- |
| `If you engage the pins incorrectly with the seats, they can become damaged.` | `... the pins can become damaged.` or `... the seats can become damaged.` or `... the pins and seats can become damaged.` |

**Checkable as:** a report of a pronoun with more than one candidate noun before
it, plus a finding for a pronoun that the dictionary does not approve, which
rule 1.1 already gives.

## GR-4 — The pronoun "this"

When you use "this", make sure that the reader knows which item it refers to. If it
can refer to more than one item, give the context again.

| Do not write | Write |
| --- | --- |
| `Make sure that the cover is not locked (this can cause damage to the probe).` | `Make sure that the cover is not locked. If the cover is locked, this can cause damage to the probe.` or `If the cover is locked, damage to the probe can occur.` |
| `Do not use crocus cloth on aluminum parts. If you do this, you can cause corrosion on aluminum parts. Crocus cloth contains ferrous oxide.` | `Do not use crocus cloth on aluminum parts. Crocus cloth contains ferrous oxide, which can cause corrosion on aluminum parts.` |

**Checkable as:** a report of "this" used as a pronoun with no noun after it, when
the sentence before it has more than one candidate.

## GR-5 — False friends

A false friend is a word that looks the same as a word of a person's native
language but means something else in English ("disposition" and the Italian
"disposizione" or the Spanish "disposición"). Make sure that the word you use has
the correct meaning in English.

| Do not write | Write |
| --- | --- |
| `Obey the dispositions of the manufacturer when you use this adhesive.` | `When you use this adhesive, obey the manufacturer's instructions.` |

**Checkable as:** a list-based report, per source language.

## GR-6 — Latin abbreviations

STE recommends that you do not use Latin abbreviations ("e.g." for "for example",
"i.e." for "that is", "etc." for "and so on") because they confuse readers who do
not know them. Use English words, or omit them where they are not necessary.

| Do not write | Write |
| --- | --- |
| `Discard the standard parts (e.g., washers, screws, bolts, and nuts) each time you remove them.` | `Discard the standard parts (for example, washers, bolts, and nuts) each time you remove them.` |
| `These wires can have insulation of different colors (blue, green, red, etc.).` | `These wires can have insulation of different colors. They can be blue, green, red, or other colors.` or `These wires can have insulation of different colors.` |

**Checkable as:** an exact list: `e.g.`, `i.e.`, `etc.`, `viz.`, `cf.`, `et al.`

## GR-7 — Inclusive language

STE gives no examples of inclusive language, but it complies fully with
gender-neutral language requirements. Gender-specific pronouns such as "he" and
"she" are not permitted in STE. "Man" and "woman" are also not permitted, unless
the applicable context needs them, for example in a medical text. STE uses neutral
terms and constructions to prevent gender bias in technical documentation.

**Checkable as:** a word list, with the context exception recorded per project. The
standard points at the EIGE Toolkit on Gender-sensitive Communication (2019) and the
UN Disability-inclusive communications guidelines (2019).

## GR-8 — Possessive form

The possessive form, the Saxon genitive, adds an apostrophe and "s": "refer to the
manufacturer's instructions". It **is** permitted in STE. Use it correctly, and if
you are not sure that your sentence is correct, do not use it: other languages have
no equivalent form or form it differently, so it is not always easy for non-native
readers to understand. Refer to technical publication specifications, style guides,
or other official directives.

**Checkable as:** a report of `'s` on a noun, at a low severity. Not a finding, and
never an automatic rewrite.

## Notes

- GR-1, GR-4, and GR-6 have the clearest mechanical signal. GR-3 and GR-7 overlap
  with rule 1.1, because "he" and "she" are not approved words in the dictionary,
  so the vocabulary check already reports them.
- Keep GR reports in their own severity class. A text that obeys all 53 rules and
  no general recommendation is still STE.
