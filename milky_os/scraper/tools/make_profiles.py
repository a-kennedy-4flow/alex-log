#!/usr/bin/env python3
"""Builds one profile page per declared nutrient.

    python3 tools/make_profiles.py

Writes `profiles/index.html` and one page beside it for every name a pack or the
reference declares. A profile says what the nutrient is in the words of an encyclopedia,
what breast milk carries over lactation, what the packs of each age step declare, and
every caveat the figure carries.
"""

from __future__ import annotations

import argparse
import datetime
import json
import statistics
import sys
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import compare_data  # noqa: E402
import reference  # noqa: E402
from compare_data import FOLD, MOTHER, SAME_THING, WHY, against, build  # noqa: E402
from make_page import file_of, ready_to_drink, repacks  # noqa: E402
from make_views import STYLE  # noqa: E402
from reference import german  # noqa: E402

# A pack that declares more than this many times the median of its own step is a
# published error rather than a recipe. Both of the two are named in the readme.
WILD = 20


def esc(text: Any) -> str:
    import html
    return html.escape(str(text or ""))


def prepared(path: Path) -> list[dict[str, Any]]:
    collected = json.loads(path.read_text(encoding="utf-8"))["products"]
    kept = [p for p in reference.merge(collected) if not ready_to_drink(p)]
    dropped = repacks(kept)
    return [p for p in kept if p["dan"] not in dropped]


def gather(products: list[dict[str, Any]]) -> dict[str, Any]:
    """Everything a profile needs, worked out once for every nutrient."""
    data = build(products)
    pairs = {one["stage"]: one for one in against(data)}
    charted = {n["name"]: n["unit"] for n in data["nutrients"]}

    held: dict[str, list[dict[str, Any]]] = {}
    for article in data["articles"]:
        held.setdefault(article["stage"], []).append(article)

    # what a pack prints before anything is folded, so a profile can say how often
    printed: dict[str, int] = {}
    for product in products:
        for nutrient in (product.get("nutrition") or {}).get("nutrients", []):
            printed[nutrient["name"]] = printed.get(nutrient["name"], 0) + 1

    needs = json.loads((ROOT / "requirements.json").read_text(encoding="utf-8"))
    milk = json.loads((ROOT / "breastmilk.json").read_text(encoding="utf-8"))
    windows = {w["key"]: w["name"] for w in milk["windows"]}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for one in milk["nutrients"]:
        by_name.setdefault(one["name"], []).append(one)

    return {
        "data": data, "pairs": pairs, "charted": charted, "held": held,
        "printed": printed, "milk": milk, "windows": windows, "milk_by_name": by_name,
        "needs": needs,
        "stages": [s for s in data["stages"] if s != MOTHER],
    }


def steps_of(bag: dict[str, Any], name: str) -> list[dict[str, Any]]:
    """What every age step declares for one nutrient."""
    rows = []
    for stage in bag["stages"]:
        articles = bag["held"].get(stage, [])
        values = [a["values"][name] for a in articles if name in a["values"]]
        if not values:
            continue
        rows.append({
            "stage": stage, "count": len(values), "of": len(articles),
            "median": statistics.median(values), "low": min(values), "high": max(values),
            "drawn": len(values) >= len(articles) * compare_data.MIN_SHARE,
            "wild": [a for a in articles
                     if name in a["values"]
                     and statistics.median(values) > 0
                     and a["values"][name] / statistics.median(values) > WILD],
        })
    return rows


def milk_of(bag: dict[str, Any], name: str) -> list[dict[str, Any]]:
    """What breast milk carries for one nutrient over every lactation window."""
    entries = list(bag["milk_by_name"].get(name, []))
    if not entries:
        # a folded row gathers whatever the reference filed under any name of its group
        for canon, names, _ in SAME_THING:
            if name in (canon, *names):
                for member in names:
                    entries.extend(bag["milk_by_name"].get(member, []))
    if not entries:
        return []
    rows = []
    for key, window in bag["windows"].items():
        found = [(one["unit"], one["per_100_ml"][key], one)
                 for one in entries if key in one["per_100_ml"]]
        # a window the source never reached carries no figure rather than a stretched one
        first = found[0][2] if found else None
        rows.append({
            "window": window,
            "text": " / ".join(f"{german(value)} {unit}" for unit, value, _ in found),
            "source": first["source"] if first else None,
            "note": (first.get("note", "") if first else ""),
            "range": ([first["low"], first["high"]]
                      if first and first.get("low") is not None else None),
        })
    return rows


def caveats(bag: dict[str, Any], name: str, milk_rows: list[dict[str, Any]],
            step_rows: list[dict[str, Any]]) -> list[str]:
    """Everything a reader has to know before trusting the number."""
    out = []
    folded_into = FOLD.get(name)
    for canon, names, why in SAME_THING:
        others = [n for n in names if n != name]
        if name == canon and others:
            counts = " and ".join(f"{n} on {bag['printed'].get(n, 0)}" for n in others)
            out.append(f"This row gathers more than one printed name. A pack printing "
                       f"{counts} of the {len(bag['data']['articles'])} articles here is "
                       f"counted under this one. {why}")
        elif name in names and name != canon:
            out.append(f"A pack printing this is counted under {canon} on every chart so "
                       f"no chart draws this name on its own. {why} This page is here so "
                       f"the name still leads somewhere.")

    if name not in bag["charted"] and (folded_into is None or folded_into == name):
        seen = bag["printed"].get(name, 0)
        total = len(bag["data"]["articles"])
        out.append(f"No chart draws this. Only {seen} of the {total} articles print it "
                   f"which is under the half of the field a nutrient needs before a "
                   f"median means anything.")

    if not milk_rows:
        out.append("Breast milk carries no figure here. Either no source measures it or "
                   "human milk does not contain it. The reference is never guessed.")
    else:
        empty = [r["window"] for r in milk_rows if not r["text"]]
        if empty:
            out.append(f"Breast milk has no figure for {len(empty)} of the ten lactation "
                       f"windows because the study behind it does not reach them: "
                       f"{', '.join(empty)}.")
        first = next((r for r in milk_rows if r["text"]), None)
        if first and first["note"]:
            out.append(f"On the reference figure: {first['note']}.")
        told = bag["milk"]["sources"].get(first["source"], {}) if first else {}
        if told.get("note"):
            out.append(told["note"])
        # a corrigendum is about the paper rather than about one figure so it stays on
        # the citation under the table and never becomes a caveat of every nutrient
        if first and first["range"]:
            low, high = first["range"]
            out.append(f"The study published a spread of {german(low)} to {german(high)} "
                       f"and the figure here is one number taken from it.")
        spread = {r["text"] for r in milk_rows if r["text"]}
        if len(spread) == 1 and len(milk_rows) > 1:
            out.append("The reference figure does not change with the month because its "
                       "source publishes one number for mature milk rather than a curve.")

    held = bag["needs"]["absorption"].get(name)
    if held and held.get("milk") and held.get("formula"):
        out.append(f"A concentration here is not what reaches the child. "
                   f"{german(held['milk'])}% of this is absorbed from human milk against "
                   f"{german(held['formula'])}% from a powder, so a step carrying many "
                   f"times the milk does not deliver many times as much. {held['says']}")
    elif held:
        out.append(f"A concentration here is not what reaches the child. {held['says']}")

    need = bag["needs"]["requirements"].get(name)
    outcome = bag["needs"]["set_from_outcome"].get(name)
    if outcome and not need:
        out.append(f"The requirement for this is set from {outcome['set_from']}. "
                   f"{outcome['says']}")
    if need:
        part = need["milk_a_day"] / need["needs_a_day"] * 100 if need["needs_a_day"] else None
        if outcome:
            out.append(f"The adequate intake for this is set from {outcome['set_from']}. "
                       f"{outcome['says']}")
        elif part is not None and part < 90:
            out.append(f"Breast milk delivers {german(part)}% of the adequate intake. That "
                       f"is not a shortfall in the milk. {bag['needs']['circular']['says']} "
                       f"The milk of a healthy mother is what adequate means at this age.")

    for row in step_rows:
        for wild in row["wild"]:
            times = wild["values"][name] / row["median"]
            out.append(f"{wild['brand']} {wild['variant']} declares "
                       f"{german(wild['values'][name])} against a {row['stage']} median of "
                       f"{german(row['median'])} which is {german(times)} times it. "
                       f"That is what the publisher printed and it is passed through "
                       f"untouched.")
    return out


def cite_line(bag: dict[str, Any], key: str) -> str:
    one = bag["needs"]["sources"].get(key, {})
    link = (f'https://doi.org/{one["doi"]}' if one.get("doi") else one.get("url", ""))
    tail = f' <a href="{esc(link)}" rel="noreferrer">doi</a>' if link else ""
    quote = f'<span class="detail">{esc(one["quote"])}</span>' if one.get("quote") else ""
    return f'<p class="attrib">{esc(one.get("citation", key))}{tail}{quote}</p>'


def needs_card(bag: dict[str, Any], name: str) -> str:
    """What a baby of the first six months actually has to be fed."""
    need = bag["needs"]["requirements"].get(name)
    apart = bag["needs"]["set_from_outcome"].get(name)
    if not need:
        # a requirement can be set from an outcome and still carry no figure a day
        if apart:
            return card("What a baby needs", (
                f'<p>The requirement for this is set from {esc(apart["set_from"])} rather '
                f'than from what milk holds. No figure a day is published beside the '
                f'milk. {esc(apart["says"])}</p>'
                f'<p class="attrib"><span class="detail">{esc(apart["quote"])}</span></p>'
                + cite_line(bag, apart["source"])))
        return card("What a baby needs", '<p class="empty">No adequate intake is published '
                                         "for this at the age these packs are sold for.</p>")
    used = bag["needs"]["volume_used"]
    part = need["milk_a_day"] / need["needs_a_day"] * 100 if need["needs_a_day"] else None
    rows = (f'<tr><th scope=row>Adequate intake a day</th>'
            f'<td>{german(need["needs_a_day"])} {esc(need["unit"])}</td></tr>'
            f'<tr><th scope=row>Breast milk delivers a day</th>'
            f'<td>{german(need["milk_a_day"])} {esc(need["unit"])}</td></tr>'
            + (f'<tr><th scope=row>Which is</th><td>{german(part)}% of it</td></tr>'
               if part is not None else "")
            + f'<tr><th scope=row>So a feed needs</th>'
              f'<td>{german(need["needs_per_100_ml"])} {esc(need["unit"])} per 100 ml</td></tr>')
    circular = bag["needs"]["circular"]
    outcome = bag["needs"]["set_from_outcome"].get(name)
    where = (f'This one is set from {esc(outcome["set_from"])} rather than from milk, so the '
             f'milk really can fall short of it and does. {esc(outcome["says"])}'
             if outcome else
             f'{esc(circular["says"])} Breast milk is the reference for what adequate means '
             f'at this age so a figure under the intake is a question about the intake.')
    note = (f'<p class="attrib">The figure a day becomes a figure per 100 ml on the '
            f'{german(used["millilitres"], 4)} ml a baby of {esc(used["window"])} was '
            f'measured drinking.'
            + (f' {esc(need["converted"])}.' if need.get("converted") else "")
            + f'</p><p class="attrib">{where}</p>'
            + (f'<p class="attrib"><span class="detail">{esc(outcome["quote"])}</span></p>'
               if outcome else
               f'<p class="attrib"><span class="detail">{esc(circular["quote"])}</span></p>'))
    return card("What a baby needs", (
        f'<table class="grid"><tbody>{rows}</tbody></table>{note}'
        + cite_line(bag, (outcome or circular)["source"])
        + cite_line(bag, "milq-volume")))


def absorbed_card(bag: dict[str, Any], name: str) -> str:
    """How much of it crosses the gut, which is the only part that feeds anyone."""
    held = bag["needs"]["absorption"].get(name)
    if not held:
        return card("How much is absorbed", (
            '<p class="empty">No measurement of how much of this is absorbed from either '
            "milk is carried here. A concentration on this page is what is in the milk "
            "rather than what reaches the child.</p>"))
    rows = ""
    if held.get("milk") is not None:
        rows += (f'<tr><th scope=row>Absorbed from human milk</th>'
                 f'<td>{german(held["milk"])}%</td></tr>')
    if held.get("formula") is not None:
        rows += (f'<tr><th scope=row>Absorbed from formula</th>'
                 f'<td>{german(held["formula"])}%</td></tr>')
    table = f'<table class="grid"><tbody>{rows}</tbody></table>' if rows else ""
    cites = cite_line(bag, held["source"])
    if held.get("also"):
        cites += cite_line(bag, held["also"])
    return card("How much is absorbed", (
        f'{table}<p class="attrib">Measured by {esc(held["measured"])}.</p>'
        f'<p>{esc(held["says"])}</p>{cites}'))


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name} · dm Babymilch</title>
<style>{style}{extra}</style>
</head>
<body>
<header class="top">
  <h1>{name}</h1>
  <p class="lede">{lede} <a href="index.html">Every nutrient</a> ·
    <a href="../index.html">The list</a> · <a href="../compare.html">Compare</a>.</p>
</header>
<main>{body}</main>
</body>
</html>
"""

EXTRA = """
main { margin: 0 1.25rem 3rem; display: grid; gap: 1rem; max-width: 60rem; }
.card h2 { margin: 0 0 0.5rem; font-size: 1rem; }
blockquote { margin: 0 0 0.6rem; padding-left: 0.9rem; border-left: 3px solid var(--line);
  font-size: 0.95rem; }
.attrib { margin: 0; color: var(--quiet); font-size: 0.78rem; }
.attrib a { color: var(--accent); }
table.grid { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
table.grid th, table.grid td { padding: 0.28rem 0.5rem; border-bottom: 1px solid var(--line);
  text-align: right; }
table.grid th[scope=row], table.grid thead th:first-child { text-align: left; }
table.grid thead th { color: var(--quiet); font-size: 0.78rem; }
table.grid td.none { color: var(--quiet); }
ul.caveats { margin: 0; padding-left: 1.1rem; font-size: 0.85rem; }
ul.caveats li { margin-bottom: 0.45rem; }
.empty { color: var(--quiet); font-size: 0.85rem; margin: 0; }
.tag { display: inline-block; padding: 0.05rem 0.4rem; border-radius: 3px;
  background: var(--band); color: var(--quiet); font-size: 0.72rem; margin-left: 0.3rem; }
.index { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
.index th, .index td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--line);
  text-align: left; vertical-align: top; }
.index td.num { text-align: right; font-variant-numeric: tabular-nums; }
.index a { color: var(--accent); text-decoration: none; }
.index a:hover { text-decoration: underline; }
"""


def card(title: str, inner: str) -> str:
    return f'<section class="card"><h2>{esc(title)}</h2>{inner}</section>'


def profile_page(name: str, bag: dict[str, Any], book: dict[str, Any], lede: str) -> str:
    unit = bag["charted"].get(name, "")
    entry = book["profiles"].get(name, {})
    blocks = []

    if entry.get("quote"):
        blocks.append(card("What it is", (
            f"<blockquote>{esc(entry['quote'])}</blockquote>"
            f'<p class="attrib">Quoted from the Wikipedia article '
            f'<a href="{esc(entry["url"])}" rel="noreferrer">{esc(entry["title"])}</a>'
            + (f' as of {esc((entry.get("as_of") or "")[:10])}' if entry.get("as_of") else "")
            + f' · {esc(book["licence"]["name"])} '
              f'<a href="{esc(book["licence"]["url"])}" rel="noreferrer">licence</a></p>'
        )))
    else:
        blocks.append(card("What it is", '<p class="empty">No encyclopedia article '
                                         "explains this name.</p>"))

    milk_rows = milk_of(bag, name)
    if milk_rows:
        body = "".join(
            f'<tr><th scope=row>{esc(r["window"])}</th>'
            + (f'<td>{esc(r["text"])}</td>' if r["text"] else '<td class="none">—</td>')
            + "</tr>" for r in milk_rows)
        keys = {r["source"] for r in milk_rows if r["source"]}
        cites = "".join(
            f'<p class="attrib">{esc(bag["milk"]["sources"][k]["citation"])}'
            + (f' <a href="https://doi.org/{esc(bag["milk"]["sources"][k]["doi"])}" '
               f'rel="noreferrer">doi</a>' if bag["milk"]["sources"][k].get("doi") else "")
            + (f' <a href="{esc(bag["milk"]["sources"][k]["url"])}" rel="noreferrer">link</a>'
               if bag["milk"]["sources"][k].get("url") else "")
            + "</p>" for k in sorted(keys))
        blocks.append(card("In breast milk, per 100 ml", (
            '<table class="grid"><thead><tr><th>Lactation window</th>'
            f"<th>Declared</th></tr></thead><tbody>{body}</tbody></table>{cites}")))
    else:
        blocks.append(card("In breast milk", '<p class="empty">No source measures this in '
                                             "human milk so the reference declares nothing.</p>"))

    step_rows = steps_of(bag, name)
    if step_rows:
        body = ""
        for r in step_rows:
            pair = bag["pairs"].get(r["stage"])
            found = next((n for n in (pair or {}).get("nutrients", [])
                          if n["name"] == name), None)
            times = (f'{german(found["field"]["median"] / found["milk"]["median"])}×'
                     if found and found["milk"]["median"] else "—")
            need = bag["needs"]["requirements"].get(name)
            share = (f'{german(r["median"] / need["needs_per_100_ml"] * 100)}%'
                     if need and need["needs_per_100_ml"] else "—")
            body += (f'<tr><th scope=row>{esc(r["stage"])}'
                     + ("" if r["drawn"] else '<span class="tag">not drawn</span>')
                     + f'</th><td>{r["count"]} of {r["of"]}</td>'
                     f'<td>{german(r["median"])}</td><td>{german(r["low"])}</td>'
                     f'<td>{german(r["high"])}</td><td>{times}</td>'
                     f'<td>{share}</td></tr>')
        blocks.append(card(f"In the packs, per 100 ml{' in ' + unit if unit else ''}", (
            '<table class="grid"><thead><tr><th>Age step</th><th>Packs</th>'
            "<th>Median</th><th>Lowest</th><th>Highest</th>"
            "<th>Times the milk</th><th>Of the need</th></tr></thead>"
            f"<tbody>{body}</tbody></table>")))
    else:
        blocks.append(card("In the packs", '<p class="empty">No pack declares this.</p>'))

    blocks.append(needs_card(bag, name))
    blocks.append(absorbed_card(bag, name))

    notes = caveats(bag, name, milk_rows, step_rows)
    blocks.append(card("What to watch", (
        f'<ul class="caveats">{"".join(f"<li>{esc(n)}</li>" for n in notes)}</ul>'
        if notes else '<p class="empty">Nothing beyond the usual. The figure is the '
                      "declaration as published.</p>")))

    return PAGE.format(name=esc(name), style=STYLE, extra=EXTRA, lede=esc(lede),
                       body="".join(blocks))


def index_page(names: list[str], bag: dict[str, Any], book: dict[str, Any],
               lede: str) -> str:
    rows = ""
    for name in names:
        entry = book["profiles"].get(name, {})
        milk = "yes" if bag["milk_by_name"].get(name) else "—"
        rows += (f'<tr><td><a href="{esc(file_of(name))}">{esc(name)}</a></td>'
                 f'<td>{esc(entry.get("description") or "")}</td>'
                 f'<td class="num">{bag["printed"].get(name, 0)}</td>'
                 f"<td>{milk}</td>"
                 f'<td>{"yes" if name in bag["charted"] else "—"}</td></tr>')
    body = card(f"{len(names)} names", (
        '<table class="index"><thead><tr><th>Nutrient</th><th>What it is</th>'
        "<th>Packs</th><th>Breast milk</th><th>Charted</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"))
    return PAGE.format(name="Every nutrient", style=STYLE, extra=EXTRA, lede=esc(lede),
                       body=body)




def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "products.json")
    parser.add_argument("--book", type=Path, default=ROOT / "nutrients.json")
    parser.add_argument("--out", type=Path, default=ROOT / "profiles")
    args = parser.parse_args(argv)

    products = prepared(args.data)
    bag = gather(products)
    book = json.loads(args.book.read_text(encoding="utf-8"))

    names = sorted(set(bag["printed"]) | set(bag["charted"]) | set(bag["milk_by_name"]),
                   key=lambda n: (-bag["printed"].get(n, 0), n))
    stamp = datetime.date.fromtimestamp(args.data.stat().st_mtime)
    lede = (f"{len(names)} names over {len(bag['data']['articles'])} articles "
            f"collected on {stamp.day} {stamp:%B} {stamp.year}.")

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "index.html").write_text(index_page(names, bag, book, lede), encoding="utf-8")
    for name in names:
        (args.out / file_of(name)).write_text(
            profile_page(name, bag, book, lede), encoding="utf-8")
    size = sum(f.stat().st_size for f in args.out.glob("*.html")) / 1024
    print(f"{args.out}/ holds {len(names)} profiles and an index, {size:.0f} kB in all")
    missing = [n for n in names if not book["profiles"].get(n, {}).get("quote")]
    if missing:
        print(f"  {len(missing)} without an encyclopedia quote: {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
