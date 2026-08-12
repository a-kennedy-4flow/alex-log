#!/usr/bin/env python3
"""Check a project glossary in priv/glossaries/ against the STE rules it must obey.

`validate_technical_terms.py` checks the default glossary against the PDF, because
that one is transcribed from rules 1.5 and 1.12. A project glossary holds terms of
a subject field that the standard never mentions, so it is checked against the
rules instead:

  Rule 1.7/1.13  A term is a technical noun or a technical verb, not both.
  Rule 1.11      One term for one thing: no term is repeated between categories.
  Rule 2.1       A multi-word noun is no more than three words.
  Rule 1.14      American English spelling.

It also reports, as warnings and not errors, every term that the dictionary
already holds. Those are the terms where the glossary overrides part 2, which
rules 1.5 and 1.6 allow for a technical noun but which a reviewer must agree to.
Each one must have an entry in the glossary's "dictionary_conflicts" list saying
why the subject field's sense is a different one.

Usage: python3 tools/validate_glossary.py <glossary.json> <dictionary.json> [technical_terms.json]
"""

import json
import re
import sys

# Rule 1.14 asks for American spelling. A suffix test is not usable here - it
# reads "raise" and "release" as British - so the check is against the words
# that actually turn up in software writing.
BRITISH = {
    "analyse": "analyze",
    "behaviour": "behavior",
    "catalogue": "catalog",
    "centre": "center",
    "colour": "color",
    "defence": "defense",
    "dialogue": "dialog",
    "initialise": "initialize",
    "licence": "license",
    "normalise": "normalize",
    "optimise": "optimize",
    "serialise": "serialize",
    "specialise": "specialize",
    "synchronise": "synchronize",
}


def terms_of(section):
    return [(category, term) for category, terms in section.items() for term in terms]


def main():
    glossary_path, dictionary_path = sys.argv[1], sys.argv[2]
    default_path = sys.argv[3] if len(sys.argv) > 3 else None

    glossary = json.load(open(glossary_path))
    nouns, verbs = terms_of(glossary["nouns"]), terms_of(glossary["verbs"])
    errors, warnings = [], []

    # Rule 1.7 and rule 1.13: a term is one part of speech, not both.
    noun_set = {t.lower() for _c, t in nouns}
    for category, term in verbs:
        if term.lower() in noun_set:
            errors.append(f"1.13 {term!r} is a technical noun and a technical verb ({category})")

    # Rule 1.11: one term for one thing.
    for kind, entries in (("noun", nouns), ("verb", verbs)):
        seen = {}
        for category, term in entries:
            key = term.lower()
            if key in seen:
                errors.append(f"1.11 {kind} {term!r} is in {seen[key]} and {category}")
            seen[key] = category

    # Rule 2.1: a multi-word noun is no more than three words.
    for category, term in nouns:
        if len(term.split()) > 3:
            errors.append(f"2.1 {term!r} is {len(term.split())} words ({category})")

    # Rule 1.14: American English spelling.
    for _category, term in nouns + verbs:
        for word in term.split():
            american = BRITISH.get(re.sub(r"(?:s|d|ing)$", "", word.lower()))
            if american:
                errors.append(f"1.14 {term!r} is British spelling, use {american!r}")

    # Terms the dictionary already decides on.
    entries = json.load(open(dictionary_path))["entries"]
    by_word = {}
    for entry in entries:
        by_word.setdefault(entry["word"].lower(), []).append(entry)

    declared = {c["term"].lower() for c in glossary.get("dictionary_conflicts", [])}
    for kind, entries_ in (("n", nouns), ("v", verbs)):
        for _category, term in entries_:
            for entry in by_word.get(term.lower(), []):
                state = "approved" if entry["approved"] else "NOT approved"
                note = f"{term!r} is in the dictionary as {entry['pos']}, {state}"
                if term.lower() not in declared:
                    errors.append(f"1.1 {note}, and dictionary_conflicts does not explain it")
                else:
                    warnings.append(note)

    # Terms the default glossary already covers.
    if default_path:
        default = json.load(open(default_path))
        covered = {
            term.lower()
            for kind in ("nouns", "verbs")
            for _c, term in terms_of(default[kind])
        }
        for _category, term in nouns + verbs:
            if term.lower() in covered:
                warnings.append(f"{term!r} is already in the default glossary of rules 1.5/1.12")

    print(f"{len(nouns)} technical nouns, {len(verbs)} technical verbs")
    print(f"{len(errors)} errors, {len(warnings)} warnings")
    for item in errors:
        print("  error:   " + item)
    for item in warnings:
        print("  warning: " + item)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
