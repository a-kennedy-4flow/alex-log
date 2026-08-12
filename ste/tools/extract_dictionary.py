#!/usr/bin/env python3
"""Bootstrap step: turn part 2 of the ASD-STE100 PDF into priv/dictionary.json.

Part 2 is a four-column table: word (part of speech) | approved meaning or
ALTERNATIVES | STE example | non-STE example. `pdftotext -bbox-layout` gives
the coordinates of every word, so each table cell is recovered as a block and
assigned to a column by its x position. This is more reliable than the
character columns of `pdftotext -layout`, which bleed into each other on the
pages where the columns are narrow.

Per part 2, "Guide to the dictionary":
  - An UPPERCASE headword is approved in STE, a lowercase headword is not.
  - The part of speech is in parentheses: n, v, adj, adv, pron, art, prep, conj.
  - A verb entry also lists its approved forms, an adjective entry its
    comparative and superlative forms.
  - For a word that is not approved, column 2 lists the approved alternatives.
    An alternative can also be a technical noun (TN) or a technical verb (TV).

Usage: python3 tools/extract_dictionary.py <pdf> <out.json>
"""

import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

POS = r"n|v|adj|adv|pron|art|prep|conj"

# "ABOUT (prep)", "make sure (v)", "case (in case of) (conj)". Anything else in
# parentheses before the part of speech is a usage hint, not part of the word.
HEADWORD = re.compile(
    rf"^(?P<word>[A-Za-z][A-Za-z0-9'’.\-/ ]*?)\s*(?:\([^()]*\)\s*)?\((?P<pos>{POS})\)"
)
# What follows the headword in column 1 are its other approved forms:
# "ABSORB (v), ABSORBS, ABSORBED, ABSORBED", "SLOW (adj) (SLOWER, SLOWEST)".
FORM = re.compile(r"^[A-Z][A-Z'’\-]*$")
# An alternative in column 2: "PRIMARY (adj)", "MAKE SURE (v)", "DEFECT (TN)".
ALTERNATIVE = re.compile(rf"^(?P<word>[A-Z][A-Z0-9'’.\-/ ]*?)\s*\((?P<pos>{POS}|TN|TV)\)")

PAGE_MARK = re.compile(r"Page 2-1-[A-Z]+\d+")
NOISE = re.compile(
    r"^(Word|\(part of speech\)|Approved meaning/|ALTERNATIVES|STE EXAMPLE|Non-STE example"
    r"|Issue 9|\d{4}-\d{2}-\d{2}|ASD.?STE100 Simplified Technical English"
    r"|Page 2-1-[A-Z]+\d+|ASD-STE100 Simplified|Technical English|Blank Page"
    r"|.*Part 2 - Dictionary.*)$"
)
# A cell wraps every few words, so its lines are rejoined before the sentences
# are read off. Only ".", "!" and "?" end a sentence here: a colon introduces a
# vertical list that belongs to the sentence before it, and rule 8.4 is about
# how to count such a list, not about where the example ends.
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
# "0.05", "e.g.", "U.S." must not be split at their periods.
ABBREVIATION_END = re.compile(r"(?:\b[A-Za-z]|\b(?:e\.g|i\.e|etc|no|approx)\.|\d)\.$")
COLUMN_LABELS = ("Word", "Approved meaning/", "STE EXAMPLE", "Non-STE example")
# How far left of its header label a cell can start and still belong to that
# column. The table is laid out to fit its contents, so a cell is outdented from
# the label above it by a few points, and by a different few on each page.
COLUMN_TOLERANCE = 12
# A headword too long for column 1 wraps: "anticlockwise" / "(adv)".
BARE_WORD = re.compile(r"^[A-Za-z][A-Za-z0-9'’.\-/ ]*$")
WRAPPED_POS = re.compile(rf"^(?:\([^()]*\)\s*)?\((?P<pos>{POS})\)")


def bbox_pages(pdf):
    out = subprocess.run(
        ["pdftotext", "-bbox-layout", pdf, "-"], capture_output=True, text=True, check=True
    ).stdout
    root = ET.fromstring(out)
    return [el for el in root.iter() if local(el.tag) == "page"]


def local(tag):
    return tag.rsplit("}", 1)[-1]


def lines_of(page):
    """Every line of a page as (x, y, text).

    Lines are used instead of blocks because pdftotext sometimes puts the STE
    example and the non-STE example of a row in one block. The lines inside such
    a block still have the x position of their own column.
    """
    for line in page.iter():
        if local(line.tag) != "line":
            continue
        text = " ".join((w.text or "") for w in line if local(w.tag) == "word")
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            yield float(line.get("xMin")), float(line.get("yMin")), text


def words_of(line):
    """The words of a line as (x, text)."""
    for word in line:
        if local(word.tag) != "word":
            continue
        text = (word.text or "").strip()
        if text:
            yield float(word.get("xMin")), text


def cells_of(page, starts):
    """Every line of a page split by column, as (column, x, y, text).

    A line is not safe to assign to one column. Where two columns of a row have
    text on the same baseline, pdftotext can put both in one line element, so
    the STE example and the non-STE example arrive as one string:

        "THE CONTROL UNIT IS The control unit is"
         ^ column 2, x=310             ^ column 3, x=439

    Each word carries its own x position, so the words that belong to each
    column are recovered by grouping the words of a line by column.

    The whole line is tested against NOISE before it is split, because a running
    header spans the columns and only reads as noise while it is still intact.
    """
    for line in page.iter():
        if local(line.tag) != "line":
            continue
        words = list(words_of(line))
        if not words:
            continue
        if NOISE.match(re.sub(r"\s+", " ", " ".join(t for _x, t in words)).strip()):
            continue

        y, cells = float(line.get("yMin")), {}
        for x, text in words:
            cell = cells.setdefault(column_of(x, starts), [x, []])
            cell[1].append(text)

        for column in sorted(cells):
            x, texts = cells[column]
            text = " ".join(texts)
            if not NOISE.match(text):
                yield column, x, y, text


def column_starts(page):
    """The x position of each of the four columns, read from the page header."""
    starts = {}
    for x, _y, text in lines_of(page):
        for i, label in enumerate(COLUMN_LABELS):
            if text.startswith(label):
                starts.setdefault(i, x)
    return [starts[i] for i in range(4)] if len(starts) == 4 else None


def column_of(x, starts):
    """The column a word belongs to: the last one that starts at or before it.

    The tolerance absorbs the few points by which a cell can be outdented
    relative to the header label that anchors its column, which varies from page
    to page because the table is laid out to fit its contents. Without it the
    left edge of a column reads as the end of the column before, and the two
    interleave: "WHEN THE RELIEF When VALVE OPENS, THE cracks PRESSURE".
    """
    column = 0
    for i, start in enumerate(starts):
        if x >= start - COLUMN_TOLERANCE:
            column = i
    return column


def trim_case(word):
    """"ELECTRONICALLY Related to or operated" -> "ELECTRONICALLY".

    On the pages where column 1 is narrow, pdftotext puts the headword and the
    start of column 2 on one line. A headword is either fully uppercase or fully
    lowercase, so the first token that changes case class starts column 2.
    """
    tokens = word.split()
    keep = []
    for token in tokens:
        if keep and any(c.isalpha() for c in token) and token.isupper() != tokens[0].isupper():
            break
        keep.append(token)
    return " ".join(keep)


def parse_headword(text):
    """"ABSORB (v), ABSORBS, ABSORBED" -> ("ABSORB", "v", ["ABSORBS", "ABSORBED"])."""
    match = HEADWORD.match(text)
    if not match:
        return None
    word, pos = trim_case(match.group("word").strip()), match.group("pos")
    forms = []
    for token in re.split(r"[,\s]+", text[match.end() :]):
        token = token.strip(" (),")
        if FORM.match(token) and token != word and token not in forms:
            forms.append(token)
    return word, pos, forms


def parse_alternatives(cells):
    alts, seen = [], set()
    for cell in cells:
        match = ALTERNATIVE.match(cell)
        if match:
            key = (match.group("word").strip(), match.group("pos"))
            if key not in seen:
                seen.add(key)
                alts.append({"word": key[0], "pos": key[1]})
    return alts


def join_cell(fragments):
    """Rejoin the wrapped lines of one cell into whole sentences.

    The example columns are narrow, so a sentence arrives a few words at a time
    ("IF THERE IS A FIRE,", "IMMEDIATELY GO TO", "A SAFE AREA."). The fragments
    of a cell are put back together in reading order and then read as sentences,
    so that a consumer gets "IF THERE IS A FIRE, IMMEDIATELY GO TO A SAFE AREA."
    and not seven pieces of one.
    """
    text = ""
    for fragment in fragments:
        fragment = fragment.strip()
        if not fragment:
            continue
        # A word broken over two lines keeps its hyphen at the break
        # ("UNSATISFAC-" / "TORY"), so the pieces join without a space.
        if text.endswith("-"):
            text += fragment
        elif text:
            text += " " + fragment
        else:
            text = fragment

    sentences, current = [], ""
    for piece in SENTENCE_END.split(re.sub(r"\s+", " ", text).strip()):
        current = f"{current} {piece}".strip() if current else piece
        # "A VALUE OF 0.05 mm." splits at the wrong period unless a period that
        # closes a number or an abbreviation is held open until the next piece.
        if not ABBREVIATION_END.search(current):
            sentences.append(current)
            current = ""
    if current:
        sentences.append(current)
    return sentences


def new_entry(word, pos, forms, entries):
    entry = {
        "word": word,
        "pos": pos,
        # An UPPERCASE headword is approved, a lowercase headword is not.
        "approved": word.upper() == word and word.lower() != word,
        "forms": forms,
        "meaning": "",
        "alternatives": [],
        "column2": [],
        "ste_examples": [],
        "non_ste_examples": [],
    }
    entries.append(entry)
    return entry


def add_forms(entry, text):
    for token in re.split(r"[,\s]+", text):
        token = token.strip(" (),")
        if FORM.match(token) and token != entry["word"] and token not in entry["forms"]:
            entry["forms"].append(token)


def collect_page(page, starts, entries, current):
    """Add one dictionary page to `entries`; return the entry left open at its end."""
    cells = sorted(cells_of(page, starts), key=lambda cell: (round(cell[2], 1), cell[1]))
    column1 = [(y, text) for column, _x, y, text in cells if column == 0]
    # An entry that starts on a previous page owns the cells above the first
    # headword of this page.
    owners = [(float("-inf"), current)] if current else []

    skip = False
    for i, (y, text) in enumerate(column1):
        if skip:
            skip = False
            continue
        below = column1[i + 1][1] if i + 1 < len(column1) else ""
        # A headword too long for column 1 is split over two lines, either
        # hyphenated ("UNSATISFAC-" / "TORY (adj)") or with the part of speech
        # on the line below ("anticlockwise" / "(adv)").
        if text.endswith("-") and parse_headword(text[:-1] + below):
            text, skip = text[:-1] + below, True
        elif BARE_WORD.match(text) and WRAPPED_POS.match(below):
            text, skip = f"{text} {below}", True

        parsed = parse_headword(text)
        if parsed:
            current = new_entry(*parsed, entries)
            owners.append((y, current))
        elif current:
            add_forms(current, text)

    if not owners:
        return current

    for column, _x, y, text in cells:
        if column == 0:
            continue
        # The cells of a row sit a few points above their headword, so allow a
        # small tolerance when looking for the entry that owns a cell.
        owner = owners[0][1]
        for headword_y, entry in owners:
            if headword_y <= y + 6:
                owner = entry
        owner[{1: "column2", 2: "ste_examples", 3: "non_ste_examples"}[column]].append(text)

    return current


def collect(pdf):
    entries, current, starts = [], None, None
    for page in bbox_pages(pdf):
        page_text = re.sub(r"\s+", " ", " ".join(t or "" for t in page.itertext()))
        if not PAGE_MARK.search(page_text):
            continue
        # Dictionary pages alternate between two column layouts, one per side,
        # and each is laid out to fit its contents, so the columns are read from
        # every page rather than assumed.
        starts = column_starts(page) or starts
        if starts:
            current = collect_page(page, starts, entries, current)
    return entries


def finalize(entries):
    merged, order = {}, []
    for entry in entries:
        column2 = entry.pop("column2")
        if entry["approved"]:
            entry["meaning"] = " ".join(column2)
        else:
            entry["alternatives"] = parse_alternatives(column2)

        key = (entry["word"].lower(), entry["pos"])
        if key in merged:  # an entry that a page break split in two
            prev = merged[key]
            prev["forms"] += [f for f in entry["forms"] if f not in prev["forms"]]
            prev["alternatives"] += [
                a for a in entry["alternatives"] if a not in prev["alternatives"]
            ]
            prev["meaning"] = (prev["meaning"] + " " + entry["meaning"]).strip()
            prev["ste_examples"] += entry["ste_examples"]
            prev["non_ste_examples"] += entry["non_ste_examples"]
        else:
            merged[key] = entry
            order.append(key)

    # After the page-break merge, so that a cell split over two pages becomes
    # one sentence rather than two halves.
    for entry in merged.values():
        entry["ste_examples"] = join_cell(entry["ste_examples"])
        entry["non_ste_examples"] = join_cell(entry["non_ste_examples"])
        entry["meaning"] = re.sub(r"\s+", " ", entry["meaning"]).strip()

    return [merged[k] for k in order]


# An STE example is printed in uppercase, so a lowercase word in one is text of
# the non-STE column that leaked in - unless it is a unit of measurement, which
# keeps its own case ("2.7 bar", "3000 psi", "1013 mbar").
UNITS = re.compile(
    r"^(?:[munk]?m|k?g|k?N|[mk]?bar|psi|s|min|h|V|A|W|Hz|°?[CF]|rpm|l|ml|Nm"
    r"|in|ft|lb|lbf|oz|kt|gal|pt|qt|deg)$"
)


def bleed_words(example):
    return [w for w in re.findall(r"[a-z]{2,}", example) if not UNITS.match(w)]


def bleed_count(entries):
    """Entries whose STE examples still hold text from the non-STE column."""
    return sum(1 for e in entries if any(bleed_words(x) for x in e["ste_examples"]))


def main():
    pdf, out_path = sys.argv[1], sys.argv[2]
    entries = finalize(collect(pdf))
    approved = [e for e in entries if e["approved"]]
    examples = [x for e in entries for x in e["ste_examples"] + e["non_ste_examples"]]
    payload = {
        "source": "ASD-STE100 Issue 9, 2025-01-15, part 2 - Dictionary",
        "extracted_by": "tools/extract_dictionary.py",
        "casing_warning": (
            "STE examples are printed in uppercase and non-STE examples in lowercase. "
            "That is a typographic convention of the printed table, not a property of the "
            "language. Lowercase both before you use them as training data, or a model "
            "learns that uppercase means compliant and scores well while learning nothing."
        ),
        "counts": {
            "entries": len(entries),
            "approved": len(approved),
            "not_approved": len(entries) - len(approved),
            "example_sentences": len(examples),
            "entries_with_suspected_column_bleed": bleed_count(entries),
        },
        "entries": sorted(entries, key=lambda e: (e["word"].lower(), e["pos"])),
    }
    with open(out_path, "w") as fh:
        json.dump(payload, fh, indent=1, ensure_ascii=False)
    print(json.dumps(payload["counts"], indent=2))


if __name__ == "__main__":
    main()
