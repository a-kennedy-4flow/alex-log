#!/usr/bin/env python3
"""Turn part 1 of the ASD-STE100 PDF into one Markdown file per writing rule.

Part 1 holds 53 numbered rules in 9 sections. Each rule appears twice: once in
the "Summary of the rules" page that opens its section, and once as a boxed
statement followed by its explanatory text, examples, and Help notes. Only the
second occurrence carries the full rule, so the summary block is cut first.

`pdftotext -layout` is enough here (unlike part 2, which needs -bbox-layout for
its four columns), because part 1 is single-column running text. The layout does
still carry meaning inside a rule: tables and STE/non-STE example pairs are held
together by their column positions. So each line is classified in turn, and a
line that keeps a column gap once list markers are unpadded, or that is indented
like an example, goes into a fenced code block. The rest is reflowed into
paragraphs, using the right margin to tell the last line of a paragraph (which
stops short of it) from a line that only wrapped.

How the parts of a section are told apart:
  - A page belongs to part 1 if its footer has a "Page 1-<section>-<n>" mark.
  - The section's first page also holds the summary. The summary lists every
    rule of the section in ascending order, so the rule numbers stop ascending
    exactly where the rule bodies start. That break ends the summary block.
  - What is left before the first boxed rule is the section introduction
    (section 7 "Definitions", for example). It is kept in its own file so that
    no text of part 1 is dropped.
  - The short heading above a boxed rule ("Approved meaning") is that rule's
    subtitle, not the tail of the rule before it.

Usage: python3 tools/extract_rules.py <pdf> <outdir>
"""

import os
import re
import subprocess
import sys

SOURCE = "ASD-STE100 Issue 9 (2025-01-15), part 1 - Writing rules"

# Footers read "Issue 9  Part 1 - Writing rules  Page 1-2-1" or the mirror of
# it on even pages. The page mark is what identifies a part 1 page.
PAGE_MARK = re.compile(r"Page 1-(\d+)-(\d+)")
FOOTER = re.compile(r"Part 1 - Writing rules", re.I)
NOISE = re.compile(
    r"^(?:ASD.STE100 Simplified Technical English|Issue 9|\d{4}-\d{2}-\d{2}|Blank Page)$",
    re.I,
)
SECTION_TITLE = re.compile(r"^\s*Section (\d+)\s*[-–—]\s*(.+?)\s*$")
SUMMARY_HEAD = re.compile(r"^\s*Summary of the rules\s*$")
# " Rule 2.2     When a technical noun has more than three words, ..."
RULE_BOX = re.compile(r"^(?P<lead>\s*)Rule (?P<num>\d+\.\d+)(?P<gap>\s{2,})(?P<stmt>\S.*?)\s*$")
BULLET = re.compile(r"^(\s*)[-–—•]\s+(?=\S)")
# "1.    Official parts information", "   a)   Remove material:" — a list marker
# padded to a column, which is not a table.
MARKER = re.compile(r"^(\s*)(\d+\.|[a-z]\)|\(\d+\))\s{2,}(?=\S)")
ITEM_START = re.compile(r"^(?:- |\d+\. |[a-z]\) |\(\d+\) )")
# "Horizontal cylinder pivot bearing        (a multi-word noun of 4 words)" —
# a column gap that must survive as preformatted text. Three spaces, not two:
# no justified prose in part 1 opens a gap that wide, but plenty of it has two.
COLUMN_GAP = re.compile(r"\S {3,}\S")
TERMINAL = ('.', '!', '?', ':', ';', '”', '"', ')')
# Characters of the Symbol font, which pdftotext leaves in the private use area.
SYMBOL = {"\uf057": "Ω", "\uf0b0": "°", "\uf0b2": "″", "\uf02e": "."}
PRIVATE_USE = re.compile(r"[\ue000-\uf8ff]")
# Text indented this far is an example, a table, or a Help note, not a paragraph.
PRE_INDENT = 4


def page_texts(pdf):
    if not os.path.exists(pdf):
        sys.exit(f"no such file: {pdf}")
    try:
        out = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", pdf, "-"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except FileNotFoundError:
        sys.exit("pdftotext not found — install poppler-utils")
    except subprocess.CalledProcessError as err:
        sys.exit(f"pdftotext failed: {err.stderr.strip()}")
    return out.split("\f")


def rule_key(num):
    major, minor = num.split(".")
    return int(major), int(minor)


def clean_page(page):
    """Drop the running header and footer; return (lines, "1-2-1")."""
    mark = PAGE_MARK.search(page)
    if not mark:
        return None, None
    label = f"1-{mark.group(1)}-{mark.group(2)}"
    for glyph, replacement in SYMBOL.items():
        page = page.replace(glyph, replacement)
    page = PRIVATE_USE.sub("", page)
    lines = []
    for line in page.split("\n"):
        bare = line.strip()
        if NOISE.match(bare):
            continue
        if FOOTER.search(line) and (PAGE_MARK.search(line) or "Issue 9" in line):
            continue
        if PAGE_MARK.search(line) and not bare.startswith("Rule"):
            continue
        lines.append(line.rstrip())
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines, label


def statement_column(match):
    return len(match.group("lead")) + len("Rule ") + len(match.group("num")) + len(match.group("gap"))


def entry_end(lines, start, column):
    """Index of the last line of a rule statement that wraps over more lines.

    A wrapped statement line is indented to the statement column; the
    explanatory text that follows the rule box starts at the left margin.
    """
    i = start + 1
    while i < len(lines):
        text = lines[i]
        if not text.strip():
            break
        if len(text) - len(text.lstrip()) < column - 2:
            break
        i += 1
    return i - 1


def rule_entries(lines):
    """Every "Rule N.M" line in `lines` as (start, end, num, statement_lines)."""
    entries, i = [], 0
    while i < len(lines):
        match = RULE_BOX.match(lines[i])
        if not match:
            i += 1
            continue
        column = statement_column(match)
        end = entry_end(lines, i, column)
        statement = [match.group("stmt")] + [lines[j].strip() for j in range(i + 1, end + 1)]
        entries.append((i, end, match.group("num"), statement))
        i = end + 1
    return entries


def cut_summary(lines):
    """Remove the section title and the summary block; return (title, lines).

    The summary lists the rules of the section in ascending order, so the first
    rule number that does not ascend is the first boxed rule of the section.
    """
    title = None
    title_at = None
    for i, line in enumerate(lines):
        match = SECTION_TITLE.match(line)
        if match:
            title = f"Section {match.group(1)} – {match.group(2)}"
            title_at = i
            break

    summary_at = next((i for i, line in enumerate(lines) if SUMMARY_HEAD.match(line)), None)
    if summary_at is None:
        return title, lines

    entries = rule_entries(lines[summary_at:])
    end = summary_at
    previous = None
    for start, stop, num, _statement in entries:
        key = rule_key(num)
        if previous is not None and key <= previous:
            break
        previous = key
        end = summary_at + stop

    start = summary_at if title_at is None else min(title_at, summary_at)
    return title, lines[:start] + lines[end + 1 :]


def join_pages(chunks):
    """Concatenate the cleaned pages of a section, healing paragraph breaks.

    A paragraph that runs over a page boundary would otherwise be split in two
    by the gap the removed footer leaves behind.
    """
    lines, marks = [], []
    for page_lines, label in chunks:
        if lines and page_lines:
            previous = next((t for t in reversed(lines) if t.strip()), "")
            following = next((t for t in page_lines if t.strip()), "")
            continues = (
                previous
                and not previous.rstrip().endswith(TERMINAL)
                and following[:1].islower()
                and not BULLET.match(following)
                and not COLUMN_GAP.search(previous)
            )
            if not continues:
                lines.append("")
                marks.append(label)
        for line in page_lines:
            lines.append(line)
            marks.append(label)
    return lines, marks


def strip_common_indent(block):
    widths = [len(t) - len(t.lstrip()) for t in block if t.strip()]
    cut = min(widths) if widths else 0
    return [t[cut:] if t.strip() else "" for t in block]


def normalize_markers(line):
    """Pull a list marker padded to a column back next to its text.

    "1.    Official parts information" is a list item, but the padding after the
    marker looks exactly like the column gap of a table. Closing the gap lets the
    line be recognized as prose.
    """
    line = BULLET.sub(lambda m: f"{m.group(1)}- ", line)
    return MARKER.sub(lambda m: f"{m.group(1)}{m.group(2)} ", line)


def classify(block, width):
    """Label each line of a block "prose" or "pre".

    A line is preformatted if it holds a column gap, or if it is indented like an
    example or a table. The exception is a line that continues an unfinished
    prose line above it, which is how a long list item wraps.
    """
    kinds = []
    for i, line in enumerate(block):
        text = normalize_markers(line)
        if COLUMN_GAP.search(text):
            kinds.append("pre")
            continue
        if len(text) - len(text.lstrip()) < PRE_INDENT:
            kinds.append("prose")
            continue
        previous = normalize_markers(block[i - 1]).strip() if i else ""
        # A list label that stops well before the margin is complete, so what is
        # indented below it is its own example block, not the rest of the label.
        label = (
            bool(ITEM_START.match(previous))
            and bool(width)
            and len(block[i - 1].rstrip()) <= width - 8
        )
        continues = (
            kinds
            and kinds[-1] == "prose"
            and previous
            and not previous.endswith(TERMINAL)
            and not label
        )
        kinds.append("prose" if continues else "pre")
    return kinds


def reflow(lines, width=None):
    """Join wrapped lines into paragraphs and list items.

    A line that ends a sentence well before the right margin ends its paragraph:
    part 1 is justified, so a wrapped line runs to the margin, while a line that
    stops short is the last one of its paragraph or a lead-in like "Examples:".
    """
    # The end column comes from the original line, not the marker-normalized one,
    # because that is where the text really ends on the page.
    items = [(len(t.rstrip()), normalize_markers(t).strip()) for t in lines if t.strip()]
    out, broken = [], True
    for i, (end_column, text) in enumerate(items):
        if broken or ITEM_START.match(text) or not out:
            out.append(text)
        elif out[-1][-2:-1].isalpha() and out[-1].endswith("-") and text[:1].isalpha():
            out[-1] += text  # "a word-" + "for-word" is one hyphenated word
        else:
            out[-1] += " " + text

        following = items[i + 1][1] if i + 1 < len(items) else ""
        short = bool(width) and end_column <= width - 8
        if text.endswith(TERMINAL):
            broken = short
        else:
            # A list label ("1. Official parts information") has its description
            # below it, which a list item that only wraps does not: the label is
            # followed by a new sentence, the wrapped item by its own next words.
            broken = short and bool(ITEM_START.match(text)) and following[:1].isupper()
    return out


def join_lines(entries):
    """Separate paragraphs by a blank line, but keep list items adjacent."""
    out = ""
    for i, entry in enumerate(entries):
        if not i:
            out = entry
        elif ITEM_START.match(entry) and ITEM_START.match(entries[i - 1]):
            out += "\n" + entry
        else:
            out += "\n\n" + entry
    return out


def render_pre(run, width):
    """Render an example, table, or Help note, keeping its column positions."""
    block = [normalize_markers(t) for t in strip_common_indent(run)]
    body = [t for t in block if t.strip()]
    # A bullet list is only padded to a column, so it reads better as a list.
    if body and body[0].lstrip().startswith("- ") and not any(COLUMN_GAP.search(t) for t in block):
        return join_lines(reflow(block, width))
    return "\n".join(["```text"] + [t.rstrip() for t in block] + ["```"])


def text_width(lines):
    """The right margin of the running text, used to spot short final lines."""
    widths = [len(t.rstrip()) for t in lines if t.strip() and not COLUMN_GAP.search(t)]
    return max(widths) if widths else 0


def render_body(lines, width):
    """Turn a rule body into Markdown, keeping tables and examples verbatim."""
    out = []
    for block in split_blocks(lines):
        kinds = classify(block, width)
        start = 0
        for i in range(1, len(block) + 1):
            if i < len(block) and kinds[i] == kinds[start]:
                continue
            run = block[start:i]
            if kinds[start] == "prose":
                rendered = join_lines(reflow(run, width))
            else:
                rendered = render_pre(run, width)
            if rendered:
                out.append(rendered)
            start = i
    return "\n\n".join(out).strip()


def split_blocks(lines):
    blocks, current = [], []
    for line in lines:
        if line.strip():
            current.append(line)
        elif current:
            blocks.append(current)
            current = []
    if current:
        blocks.append(current)
    return blocks


def render_statement(statement_lines):
    return "\n".join(f"> {t}" for t in reflow(statement_lines))


def take_heading(lines):
    """Split a leading short heading off a region; return (lines, heading).

    A section opens with a heading over its first paragraph ("Definitions" in
    section 7), with no blank line to separate the two.
    """
    start = 0
    while start < len(lines) and not lines[start].strip():
        start += 1
    if start >= len(lines):
        return lines, None
    candidate = lines[start].strip()
    looks_like_heading = (
        0 < len(candidate) <= 70
        and not candidate.endswith((".", ",", ";", ":"))
        and not COLUMN_GAP.search(lines[start])
        and not BULLET.match(candidate)
        and not ITEM_START.match(candidate)
    )
    if not looks_like_heading:
        return lines, None
    return lines[start + 1 :], candidate


def take_subtitle(lines):
    """Split a trailing short heading off a body region.

    "Approved meaning" above a rule box introduces the rule below it, so it must
    not stay attached to the rule above it.
    """
    end = len(lines)
    while end and not lines[end - 1].strip():
        end -= 1
    if not end:
        return lines, None
    candidate = lines[end - 1].strip()
    alone = end == 1 or not lines[end - 2].strip()
    looks_like_heading = (
        alone
        and 0 < len(candidate) <= 70
        and not candidate.endswith((".", ",", ";", ":"))
        and not COLUMN_GAP.search(candidate)
        and not BULLET.match(candidate)
    )
    if not looks_like_heading:
        return lines, None
    return lines[: end - 1], candidate


def slug(text, max_words=7):
    words = re.sub(r"[^a-z0-9\s]", " ", text.lower()).split()
    return "-".join(words[:max_words])[:60].rstrip("-")


def collect(pdf):
    """Return (sections, rules) parsed from part 1 of the PDF."""
    by_section = {}
    for page in page_texts(pdf):
        lines, label = clean_page(page)
        if not label:
            continue
        section = int(label.split("-")[1])
        if section == 0 or not lines:  # part title page and its blank page
            continue
        by_section.setdefault(section, []).append((lines, label))

    streams = []
    for section in sorted(by_section):
        chunks = by_section[section]
        head_lines, head_label = chunks[0]
        title, head_lines = cut_summary(head_lines)
        chunks = [(head_lines, head_label)] + chunks[1:]
        lines, marks = join_pages([c for c in chunks if c[0]])
        streams.append((section, title, head_label, lines, marks))

    # The right margin is a property of the page, so it is measured over all of
    # part 1: a single short rule does not have enough lines to show it.
    width = text_width([line for stream in streams for line in stream[3]])

    sections, rules = [], []
    for section, title, head_label, lines, marks in streams:
        entries = rule_entries(lines)
        if not entries:
            continue

        intro = lines[: entries[0][0]]
        intro, subtitle = take_subtitle(intro)
        intro, heading = take_heading(intro)
        sections.append(
            {
                "number": section,
                "title": title or f"Section {section}",
                "page": head_label,
                "heading": heading,
                "intro": render_body(intro, width),
            }
        )

        for i, (start, stop, num, statement) in enumerate(entries):
            end = entries[i + 1][0] if i + 1 < len(entries) else len(lines)
            body = lines[stop + 1 : end]
            body, next_subtitle = take_subtitle(body)
            rules.append(
                {
                    "number": num,
                    "key": rule_key(num),
                    "section": section,
                    "section_title": title or f"Section {section}",
                    "subtitle": subtitle,
                    "page": marks[start],
                    "statement": render_statement(statement),
                    "statement_text": " ".join(t.strip() for t in statement).strip(),
                    "body": render_body(body, width),
                }
            )
            subtitle = next_subtitle

    return sections, rules


def rule_filename(rule):
    major, minor = rule["key"]
    return f"rule-{major}.{minor:02d}-{slug(rule['statement_text'])}.md"


def write_rule(outdir, rule):
    heading = f"# Rule {rule['number']}"
    if rule["subtitle"]:
        heading += f" — {rule['subtitle']}"
    parts = [
        heading,
        f"*{SOURCE}, {rule['section_title']}, page {rule['page']}*",
        rule["statement"],
    ]
    if rule["body"]:
        parts.append(rule["body"])
    path = os.path.join(outdir, rule_filename(rule))
    with open(path, "w") as fh:
        fh.write("\n\n".join(parts).rstrip() + "\n")
    return path


def write_section_intro(outdir, section):
    if not section["intro"] and not section["heading"]:
        return None
    name = f"section-{section['number']}-{slug(section['title'].split('–')[-1])}-introduction.md"
    parts = [
        f"# {section['title']} — introduction",
        f"*{SOURCE}, page {section['page']}*",
    ]
    if section["heading"]:
        parts.append(f"## {section['heading']}")
    if section["intro"]:
        parts.append(section["intro"])
    path = os.path.join(outdir, name)
    with open(path, "w") as fh:
        fh.write("\n\n".join(parts).rstrip() + "\n")
    return path


def local_rules(outdir):
    """Rules hand-written for the repository, as (filename, title, statement).

    A rule that the standard does not have goes in a `rule-local-*.md` file, so
    that it is picked up by the same `rule-*.md` glob as the extracted rules and
    sorts after them. This function only reads those files; it never writes one.
    """
    found = []
    for name in sorted(os.listdir(outdir)):
        if not (name.startswith("rule-local-") and name.endswith(".md")):
            continue
        with open(os.path.join(outdir, name), encoding="utf-8") as fh:
            text = fh.read()
        title = next((t[2:].strip() for t in text.split("\n") if t.startswith("# ")), name)
        quoted = [t[1:].strip() for t in text.split("\n") if t.startswith(">")]
        statement = re.sub(r"\s+", " ", " ".join(quoted)).strip()
        found.append((name, title, statement))
    return found


def write_index(outdir, sections, rules):
    lines = [
        "# ASD-STE100 Simplified Technical English — writing rules",
        "",
        f"All {len(rules)} writing rules of {SOURCE}, one file per rule.",
        "Extracted by `ste/tools/extract_rules.py`.",
    ]
    for section in sections:
        lines += ["", f"## {section['title']}", ""]
        if section["intro"]:
            name = f"section-{section['number']}-{slug(section['title'].split('–')[-1])}-introduction.md"
            lines.append(f"- [Introduction]({name})")
        for rule in [r for r in rules if r["section"] == section["number"]]:
            statement = re.sub(r"\s+", " ", rule["statement_text"]).strip()
            lines.append(f"- [Rule {rule['number']}]({rule_filename(rule)}) — {statement}")

    local = local_rules(outdir)
    if local:
        lines += ["", "## Project rules", ""]
        lines.append("Written for this repository, not part of ASD-STE100.")
        lines.append("")
        for name, title, statement in local:
            lines.append(f"- [{title}]({name}) — {statement}")

    path = os.path.join(outdir, "index.md")
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return path


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__.strip().splitlines()[-1])
    pdf, outdir = sys.argv[1], sys.argv[2]
    sections, rules = collect(pdf)
    if not rules:
        sys.exit("no rules found — is this the ASD-STE100 issue 9 PDF?")

    os.makedirs(outdir, exist_ok=True)
    for section in sections:
        write_section_intro(outdir, section)
    for rule in rules:
        write_rule(outdir, rule)
    write_index(outdir, sections, rules)

    print(f"{len(rules)} rules from {len(sections)} sections -> {outdir}")
    for section in sections:
        numbers = [r["number"] for r in rules if r["section"] == section["number"]]
        print(f"  {section['title']}: {len(numbers)} rules ({numbers[0]} thru {numbers[-1]})")


if __name__ == "__main__":
    main()
