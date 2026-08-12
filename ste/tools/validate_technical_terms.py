#!/usr/bin/env python3
"""Check the term lists in priv/technical_terms.json against their sources.

The file holds two kinds of term list, and each is checked against a different
source:

  - `nouns` and `verbs` are transcribed by hand from the category lists of
    rule 1.5 and rule 1.12, so every term must occur in the PDF. This guards
    against typos in the transcription.
  - `project_glossary` is the company glossary that rules 1.5, 1.8, and 1.12
    require each subject field to supply. Its terms are NOT in the standard, so
    they are checked against the rule that defines them (the markdown file named
    by `project_glossary.source`) to keep the rule and the data in step.

Two conditions are reported as errors on the glossary itself:

  - A term on both the noun side and the verb side. Rule 1.7 says not to use a
    technical noun as a verb, and rule 1.13 says not to use a technical verb as
    a noun, so one term cannot be in both.
  - A term that the rule document and the glossary do not agree on.

A glossary term that is also in `nouns` or `verbs` is reported for information,
not as an error: the standard already approves the term, but it can carry a
different meaning there (`interface`, `field`, and `class`, for example).

Usage: python3 tools/validate_technical_terms.py <pdf> <technical_terms.json> [rule.md]
"""

import collections
import json
import os
import re
import subprocess
import sys

STANDARD_KINDS = ("nouns", "verbs")


def pdf_haystack(pdf):
    text = subprocess.run(
        ["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True
    ).stdout
    return re.sub(r"\s+", " ", text).lower()


def flatten(section):
    """{category: [term]} -> [(category, term)]."""
    return [(category, term) for category, terms in section.items() for term in terms]


def check_against_pdf(data, haystack):
    """Every term of the standard's own categories must occur in the PDF."""
    missing, total = [], 0
    for kind in STANDARD_KINDS:
        for category, term in flatten(data[kind]):
            total += 1
            if term.lower() not in haystack:
                missing.append(f"{kind}/{category}: {term}")
    return total, missing


def rule_term_lists(doc_text):
    """Read the category term lists out of the rule document.

    A category is a numbered heading followed by a fenced block of terms
    separated by commas, which is how rule 1.5 and rule 1.12 present theirs.
    """
    sections = {}
    for kind, heading in (
        ("nouns", "## Technical noun categories"),
        ("verbs", "## Technical verb categories"),
    ):
        if heading not in doc_text:
            sections[kind] = {}
            continue
        body = doc_text.split(heading, 1)[1].split("\n## ", 1)[0]
        found, category, fenced, buffer = {}, None, False, []
        for line in body.split("\n"):
            heading_match = re.match(r"^(\d+)\. (.+)$", line)
            if heading_match and not fenced:
                slug = re.sub(r"[^a-z0-9]+", "_", heading_match.group(2).strip().lower())
                category = f"{heading_match.group(1)}_{slug.strip('_')}"
            elif line.startswith("```"):
                if fenced and category:
                    terms = " ".join(buffer).split(",")
                    found[category] = [t.strip() for t in terms if t.strip()]
                    buffer = []
                fenced = not fenced
            elif fenced:
                buffer.append(line.strip())
        sections[kind] = found
    return sections


def check_against_rule(glossary, doc_text):
    """The glossary and the rule that defines it must hold the same terms."""
    from_rule, drift = rule_term_lists(doc_text), []
    for kind in STANDARD_KINDS:
        in_rule = {(c, t.lower()) for c, t in flatten(from_rule.get(kind, {}))}
        in_json = {(c, t.lower()) for c, t in flatten(glossary.get(kind, {}))}
        for category, term in sorted(in_rule - in_json):
            drift.append(f"{kind}/{category}: {term} — in the rule, not in the glossary")
        for category, term in sorted(in_json - in_rule):
            drift.append(f"{kind}/{category}: {term} — in the glossary, not in the rule")
    return sum(len(t) for k in STANDARD_KINDS for t in from_rule.get(k, {}).values()), drift


def check_sides(glossary):
    """Rules 1.7 and 1.13: a term cannot be both a technical noun and a verb."""
    counts = collections.Counter(
        term.lower() for kind in STANDARD_KINDS for _c, term in flatten(glossary.get(kind, {}))
    )
    return sorted(term for term, count in counts.items() if count > 1)


def approved_by_standard(data, glossary):
    """Glossary terms that the standard's own categories already list."""
    shared = {}
    for kind in STANDARD_KINDS:
        known = {term.lower() for _c, term in flatten(data[kind])}
        shared[kind] = sorted(
            {term for _c, term in flatten(glossary.get(kind, {})) if term.lower() in known}
        )
    return shared


def report(title, items):
    print(f"{title}: {len(items)}")
    for item in items:
        print("  " + item)


def main():
    if not 3 <= len(sys.argv) <= 4:
        sys.exit(__doc__.strip().splitlines()[-1])
    pdf, terms_path = sys.argv[1], sys.argv[2]

    with open(terms_path, encoding="utf-8") as fh:
        data = json.load(fh)

    total, missing = check_against_pdf(data, pdf_haystack(pdf))
    print(f"{total} terms of the standard checked against the PDF")
    report("  not found in the PDF", missing)

    glossary = data.get("project_glossary")
    if not glossary:
        return 1 if missing else 0

    doc_path = sys.argv[3] if len(sys.argv) == 4 else glossary.get("source")
    if not doc_path or not os.path.exists(doc_path):
        sys.exit(
            f"project_glossary is present but its rule document is not at {doc_path!r} — "
            "pass the path as the third argument"
        )
    with open(doc_path, encoding="utf-8") as fh:
        doc_text = fh.read()

    rule_total, drift = check_against_rule(glossary, doc_text)
    print(f"{rule_total} glossary terms checked against {doc_path}")
    report("  the rule and the glossary disagree", drift)

    both_sides = check_sides(glossary)
    report("  in the noun list and the verb list (rules 1.7, 1.13)", both_sides)

    shared = approved_by_standard(data, glossary)
    print("  already approved by rule 1.5 or rule 1.12 (for information):")
    for kind in STANDARD_KINDS:
        print(f"    {kind}: {', '.join(shared[kind]) or 'none'}")

    return 1 if missing or drift or both_sides else 0


if __name__ == "__main__":
    sys.exit(main())
