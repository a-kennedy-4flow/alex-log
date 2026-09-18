"""Builds one HTML page of the collected articles grouped by brand."""

from __future__ import annotations

import argparse
import datetime
import html
import json
import re
import sys
import unicodedata
import urllib.parse
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import reference  # noqa: E402
from dmscrape.parse import to_number  # noqa: E402

ENERGY = "Brennwert"
SUB_ROW = re.compile(r"^davon\s", re.IGNORECASE)
READY_WORD = re.compile(r"trinkfertig", re.IGNORECASE)
VOLUME = re.compile(r"\b(ml|l)$")
PACK = re.compile(r"^([\d.,]+)\s*(kg|g|l|ml)$", re.IGNORECASE)
IN_BASE = {"g": 1.0, "kg": 1000.0, "ml": 1.0, "l": 1000.0}
MEASURE = {"g": "mass", "kg": "mass", "ml": "volume", "l": "volume"}


def ready_to_drink(product: dict[str, Any]) -> bool:
    """Test whether the article is a drink rather than a powder.

    Because a) most of them say trinkfertig in the name b) the Kindermilch cartons never
    say it yet they are sold by the litre c) a pack size given as a volume settles those.
    """
    if READY_WORD.search(product.get("name") or ""):
        return True
    return bool(VOLUME.search(product.get("net_quantity") or ""))


def count(number: int, thing: str) -> str:
    """Say how many with the right ending."""
    return f"{number} {thing}" if number == 1 else f"{number} {thing}s"


def slug(text: str) -> str:
    """Make an anchor a browser and a person can both read."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-") or "brand"


def esc(text: Any) -> str:
    return html.escape(str(text or ""))


def file_of(name: str) -> str:
    """The profile page one nutrient name leads to.

    The JavaScript in make_views folds a name the same way so a link from a chart and a
    link from the list land on the same file.
    """
    folded = name.replace("ß", "ss")
    folded = unicodedata.normalize("NFKD", folded).encode("ascii", "ignore").decode()
    return f"{slug(folded)}.html"


def short_name(product: dict[str, Any]) -> str:
    """Drop the pack size off the name.

    Because a) dm ends the published name with the pack size b) the row already prints
    that size beside the legal category c) printing it twice reads as noise.
    """
    name = product["name"]
    size = product.get("net_quantity") or ""
    if size and name.endswith(size):
        return name[: -len(size)].rstrip().rstrip(",")
    return name


def pack_size(product: dict[str, Any]) -> tuple[str, float] | None:
    """Read the net quantity as a measure and a number of the smaller unit."""
    match = PACK.match((product.get("net_quantity") or "").strip())
    if match is None:
        return None
    amount = to_number(match.group(1))
    if amount is None:
        return None
    unit = match.group(2).casefold()
    return MEASURE[unit], amount * IN_BASE[unit]


def repacks(products: list[dict[str, Any]]) -> set[int]:
    """Name every article that repeats a recipe already sold in another pack size.

    Because a) a brand sells one recipe as an 800 g tin and again as a 1,2 kg tin b) the
    published name repeats up to that size c) the second listing counts the brand twice
    on the page and once more on the chart.

    The smallest pack stays. A pack sold by mass is never weighed against one sold by
    volume so a carton cannot displace the tin it shares a name with.
    """
    lines: dict[tuple[str, str, str], list[tuple[float, int]]] = {}
    for product in products:
        size = pack_size(product)
        if size is None:
            continue
        measure, amount = size
        key = (product["brand"], short_name(product).casefold(), measure)
        lines.setdefault(key, []).append((amount, product["dan"]))
    extra: set[int] = set()
    for packs in lines.values():
        extra.update(dan for _, dan in sorted(packs)[1:])
    return extra


def energy_of(product: dict[str, Any]) -> str:
    """Give back the energy as the pack declares it under its first basis."""
    table = product.get("nutrition") or {}
    for nutrient in table.get("nutrients") or []:
        if nutrient["name"].casefold() == ENERGY.casefold():
            return nutrient["measurements"][0]["text"] if nutrient["measurements"] else ""
    return ""


def by_brand(products: list[dict[str, Any]]) -> list[tuple[str, list[dict[str, Any]]]]:
    """Group the articles and put the largest brand first."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for product in products:
        groups.setdefault(product["brand"] or "Ohne Marke", []).append(product)
    for items in groups.values():
        items.sort(key=lambda product: product["name"])
    return sorted(groups.items(), key=lambda pair: (-len(pair[1]), pair[0]))


def table_html(table: dict[str, Any] | None, cited: list[str] | None = None,
               dan: int | str = "") -> str:
    """Print the declaration and mark which study each row rests on.

    Because a) a dm row rests on what the maker printed on the pack b) a reference row
    rests on a paper c) a figure nobody can trace back is a figure nobody can check.
    """
    if not table or not table.get("nutrients"):
        return '<p class="empty">No declaration was published.</p>'
    numbered = {key: index + 1 for index, key in enumerate(cited or [])}
    bases = table["bases"] or [""]
    head = "".join(f"<th scope=col>{esc(basis)}</th>" for basis in bases)
    mark_col = "<th scope=col><abbr title=\"Source\">Src</abbr></th>" if numbered else ""
    rows = []
    for nutrient in table["nutrients"]:
        found = {measurement["basis"]: measurement for measurement in nutrient["measurements"]}
        cells = "".join(
            f"<td>{esc(found[basis]['text'])}</td>" if basis in found else '<td class="none">—</td>'
            for basis in bases
        )
        if numbered:
            first = next((found[b] for b in bases if b in found), None)
            key = (first or {}).get("source")
            tip = []
            if (first or {}).get("note"):
                tip.append(first["note"])
            if (first or {}).get("published_range"):
                low, high = first["published_range"]
                tip.append(f"the study publishes {to_german(low)} to {to_german(high)}")
            hint = f' title="{esc(" · ".join(tip))}"' if tip else ""
            cells += (f'<td class="src"><a href="#src-{dan}-{esc(key)}"{hint}>{numbered[key]}</a></td>'
                      if key in numbered else '<td class="src">—</td>')
        classes = []
        if nutrient["name"].casefold() == ENERGY.casefold():
            classes.append("energy")
        if SUB_ROW.match(nutrient["name"]):
            classes.append("sub")
        mark = f' class="{" ".join(classes)}"' if classes else ""
        rows.append(f'<tr{mark}><th scope=row>'
                    f'<a class="what" href="profiles/{file_of(nutrient["name"])}">'
                    f'{esc(nutrient["name"])}</a></th>{cells}</tr>')
    caption = esc(table.get("caption") or "")
    return (
        f'<table class="nutrition"><caption>{caption}</caption>'
        f"<thead><tr><th scope=col>Nutrient</th>{head}{mark_col}</tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table>"
    )


def to_german(value: float) -> str:
    """Print a number the way the declarations print one."""
    return f"{value:g}".replace(".", ",")


def sources_html(product: dict[str, Any], cited: list[str], gathered_on: str) -> str:
    """Name what every figure in this article rests on."""
    if not cited:
        url = product.get("url") or ""
        where = f'<a href="{esc(url)}" rel="noreferrer">{esc(url)}</a>' if url else "dm.de"
        return ('<p class="sources"><b>Source.</b> The declaration as dm publishes it at '
                f"{where} and collected on {esc(gathered_on)}. Nothing was corrected.</p>")
    known = reference.sources()
    items = []
    for index, key in enumerate(cited, start=1):
        one = known.get(key, {})
        link = one.get("url") or (f"https://doi.org/{one['doi']}" if one.get("doi") else "")
        cite = esc(one.get("citation") or key)
        if link:
            cite += f' <a href="{esc(link)}" rel="noreferrer">link</a>'
        extra = []
        for field in ("table", "measured", "period", "quote", "note", "corrigendum"):
            if one.get(field):
                extra.append(esc(one[field]))
        tail = f'<span class="detail">{" · ".join(extra)}</span>' if extra else ""
        items.append(f'<li id="src-{product["dan"]}-{esc(key)}" value="{index}">{cite}{tail}</li>')
    return ('<p class="sources"><b>Sources.</b> Every figure is a published one and the '
            "column marks which paper it came from.</p>"
            f'<ol class="citations">{"".join(items)}</ol>')


def item_html(product: dict[str, Any], gathered_on: str = "") -> str:
    cited = reference.cited_by(product) if reference.available() else []
    hunt = " ".join(
        str(product.get(field) or "")
        for field in ("brand", "name", "legal_category", "net_quantity", "dan", "gtin")
    )
    energy = energy_of(product)
    meta = " · ".join(part for part in (product["net_quantity"], product["legal_category"]) if part)
    # a reference article is published by a journal rather than by dm
    host = urllib.parse.urlsplit(product.get("url") or "").hostname or ""
    label = "dm.de" if host.endswith("dm.de") else host.removeprefix("www.")
    ids = " · ".join(
        part
        for part in (
            f"DAN {product['dan']}",
            f"GTIN {product['gtin']}" if product.get("gtin") else "",
            f'<a href="{esc(product["url"])}" rel="noreferrer">{esc(label)}</a>' if label else "",
        )
        if part
    )
    return (
        f'<li class="item" data-hunt="{esc(hunt.casefold())}">'
        f"<details><summary>"
        f'<span class="name">{esc(short_name(product))}</span>'
        f'<span class="meta">{esc(meta)}</span>'
        f'<span class="energy">{esc(energy)}</span>'
        f'</summary><div class="panel"><p class="ids">{ids}</p>'
        f'{table_html(product.get("nutrition"), cited, product["dan"])}'
        f'{sources_html(product, cited, gathered_on)}</div></details></li>'
    )


def brand_html(brand: str, items: list[dict[str, Any]], gathered_on: str = "") -> str:
    anchor = slug(brand)
    entries = "".join(item_html(product, gathered_on) for product in items)
    return (
        f'<section class="brand" id="{anchor}" data-brand="{esc(brand)}">'
        f'<h2>{esc(brand)}<span class="count">{len(items)}</span></h2>'
        f'<ol class="items">{entries}</ol></section>'
    )


def page(
    collected: dict[str, Any], gathered_on: str, hidden: int = 0, repacked: int = 0
) -> str:
    groups = by_brand(collected["products"])
    articles = sum(len(items) for _, items in groups)
    chips = "".join(
        f'<a href="#{slug(brand)}" data-brand="{esc(brand)}">{esc(brand)}'
        f"<span>{len(items)}</span></a>"
        for brand, items in groups
    )
    body = "".join(brand_html(brand, items, gathered_on) for brand, items in groups)
    milk = sum(len(items) for brand, items in groups if brand == reference.BRAND)
    lede = (
        f"{count(articles - milk, 'article')} from {count(len(groups) - bool(milk), 'brand')}. "
        f"Collected from dm.de on {gathered_on}."
    )
    if milk:
        lede += f" {count(milk, 'lactation window')} of breast milk read from the science."
    dropped = [
        count(hidden, "ready to drink article") if hidden else "",
        count(repacked, "repack") if repacked else "",
    ]
    left_out = " and ".join(part for part in dropped if part)
    if left_out:
        lede += f" {left_out} left out."
    return TEMPLATE.format(lede=esc(lede), chips=chips, body=body, style=STYLE, script=SCRIPT)


STYLE = """
:root {
  --ink: #16181d;
  --quiet: #5c6270;
  --line: #e2e5ec;
  --page: #f6f7f9;
  --card: #ffffff;
  --accent: #002878;
  --band: #eef1f7;
  --radius: 10px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #e8eaf0;
    --quiet: #9aa2b4;
    --line: #2c313c;
    --page: #14161b;
    --card: #1b1e25;
    --accent: #8ab0ff;
    --band: #232833;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.top {
  padding: 1.25rem 1.25rem 0.75rem;
  background: var(--page);
  border-bottom: 1px solid var(--line);
}
h1 { margin: 0; font-size: 1.4rem; letter-spacing: -0.01em; }
.lede { margin: 0.2rem 0 0.8rem; color: var(--quiet); font-size: 0.9rem; }
.tools { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
input[type=search] {
  flex: 1 1 18rem;
  min-width: 12rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  color: inherit;
  font: inherit;
}
input[type=search]:focus-visible, button:focus-visible, summary:focus-visible, a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
button {
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
button:hover { border-color: var(--accent); }
.brands { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.75rem 0 0.25rem; }
.brands a {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: inherit;
  text-decoration: none;
  font-size: 0.82rem;
}
.brands a:hover { border-color: var(--accent); color: var(--accent); }
.brands span { color: var(--quiet); font-variant-numeric: tabular-nums; }
main { padding: 1rem 1.25rem 4rem; }
.brand { margin: 0 0 1.5rem; }
.brand h2 {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0 0 0.5rem;
  padding: 0.6rem 0 0.4rem;
  background: var(--page);
  border-bottom: 2px solid var(--accent);
  font-size: 1.05rem;
}
.brand h2 .count {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: var(--band);
  color: var(--quiet);
  font-size: 0.78rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.items { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.4rem; }
.item > details {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  overflow: hidden;
}
.item > details[open] { border-color: var(--accent); }
summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.1rem 1rem;
  padding: 0.6rem 0.8rem;
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker { display: none; }
summary::after {
  content: "";
  grid-row: 1 / span 2;
  grid-column: 3;
  align-self: center;
  width: 0.45rem;
  height: 0.45rem;
  border-right: 2px solid var(--quiet);
  border-bottom: 2px solid var(--quiet);
  transform: rotate(-45deg);
  transition: transform 0.15s ease;
}
details[open] summary::after { transform: rotate(45deg); }
summary:hover::after { border-color: var(--accent); }
summary:hover .name { color: var(--accent); }
.name { font-weight: 600; }
.meta { grid-column: 1; color: var(--quiet); font-size: 0.85rem; }
.energy {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  color: var(--quiet);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.panel { padding: 0 0.8rem 0.8rem; border-top: 1px solid var(--line); }
.ids { margin: 0.6rem 0; color: var(--quiet); font-size: 0.8rem; }
.ids a, .lede a { color: var(--accent); }
table.nutrition {
  width: 100%;
  max-width: 52rem;
  border-collapse: collapse;
  font-size: 0.85rem;
}
table.nutrition caption {
  padding-bottom: 0.4rem;
  color: var(--quiet);
  font-size: 0.8rem;
  text-align: left;
}
table.nutrition th, table.nutrition td {
  padding: 0.28rem 0.5rem;
  border-bottom: 1px solid var(--line);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
table.nutrition th[scope=row] {
  width: 48%;
  text-align: left;
  font-weight: 400;
  white-space: normal;
}
table.nutrition thead th { color: var(--quiet); font-size: 0.78rem; font-weight: 600; }
table.nutrition thead th:first-child { text-align: left; }
table.nutrition tbody tr:hover { background: var(--band); }
tr.energy th, tr.energy td { font-weight: 600; }
tr.sub th[scope=row] { padding-left: 1.4rem; color: var(--quiet); }
td.none { color: var(--quiet); }
a.what { color: inherit; text-decoration: none; border-bottom: 1px dotted var(--quiet); }
a.what:hover, a.what:focus { color: var(--accent); border-bottom-color: var(--accent); }
.empty { color: var(--quiet); font-size: 0.85rem; }
td.src { width: 2.4rem; text-align: right; font-size: 0.78rem; }
td.src a { color: var(--accent); text-decoration: none; }
td.src a:hover, td.src a:focus { text-decoration: underline; }
.sources { margin: 0.7rem 0 0.3rem; font-size: 0.82rem; color: var(--quiet); }
.sources b { color: var(--ink); }
ol.citations { margin: 0; padding-left: 1.4rem; font-size: 0.78rem; color: var(--quiet); }
ol.citations li { margin-bottom: 0.35rem; }
ol.citations li:target { background: var(--band); }
ol.citations a { color: var(--accent); }
ol.citations .detail { display: block; opacity: 0.85; }
#shown { color: var(--accent); font-weight: 600; }
.item[hidden], .brand[hidden], .brands a[hidden] { display: none; }
#nothing { display: none; color: var(--quiet); }
#nothing[data-shown] { display: block; }
@media print {
  .brand h2 { position: static; }
  .tools, .brands { display: none; }
  .item > details { break-inside: avoid; }
}
"""

SCRIPT = """
const field = document.getElementById('filter');
const brands = [...document.querySelectorAll('.brand')];
const chips = new Map([...document.querySelectorAll('.brands a')].map(a => [a.dataset.brand, a]));
const nothing = document.getElementById('nothing');
const tally = document.getElementById('shown');

function apply(term) {
  const needle = term.trim().toLowerCase();
  let shown = 0;
  for (const brand of brands) {
    let here = 0;
    for (const item of brand.querySelectorAll('.item')) {
      const match = !needle || item.dataset.hunt.includes(needle);
      item.hidden = !match;
      if (match) here += 1;
    }
    brand.hidden = here === 0;
    brand.querySelector('.count').textContent = here;
    const chip = chips.get(brand.dataset.brand);
    if (chip) {
      chip.hidden = here === 0;
      chip.querySelector('span').textContent = here;
    }
    shown += here;
  }
  nothing.toggleAttribute('data-shown', shown === 0);
  tally.textContent = needle ? ` Showing ${shown}.` : '';
}

field.addEventListener('input', () => apply(field.value));

const asked = new URLSearchParams(location.search).get('q');
if (asked) {
  field.value = asked;
  apply(asked);
}
for (const button of document.querySelectorAll('[data-open]')) {
  button.addEventListener('click', () => {
    const open = button.dataset.open === '1';
    for (const panel of document.querySelectorAll('.item:not([hidden]) details')) {
      panel.open = open;
    }
  });
}
"""

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dm Babymilch by brand</title>
<style>{style}</style>
</head>
<body>
<header class="top">
  <h1>dm Babymilch</h1>
  <p class="lede">{lede}<span id="shown"></span> <a href="compare.html">Compare like with like</a> · <a href="profiles/index.html">What each nutrient is</a>.</p>
  <div class="tools">
    <input id="filter" type="search" placeholder="Filter by brand or name or article number" autocomplete="off">
    <noscript><span class="lede">The filter needs JavaScript. Every article is listed below.</span></noscript>
    <button type="button" data-open="1">Expand shown</button>
    <button type="button" data-open="0">Collapse all</button>
  </div>
  <nav class="brands">{chips}</nav>
</header>
<main>
<p id="nothing">Nothing matches that filter.</p>
{body}
</main>
<script>{script}</script>
</body>
</html>
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="make_page",
        description="Build one HTML page of the collected articles grouped by brand.",
    )
    parser.add_argument("--data", type=Path, default=Path("products.json"), help="collected JSON")
    parser.add_argument("--out", type=Path, default=Path("index.html"), help="page to write")
    parser.add_argument(
        "--ready-to-drink",
        action="store_true",
        help="keep the trinkfertig articles which are left out by default",
    )
    parser.add_argument(
        "--repacks",
        action="store_true",
        help="keep the bigger pack of a recipe which is left out by default",
    )
    parser.add_argument(
        "--no-reference",
        action="store_true",
        help="leave out the Muttermilch reference articles which are kept by default",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    collected = json.loads(args.data.read_text(encoding="utf-8"))
    offered = collected["products"]
    if not args.no_reference and reference.available():
        offered = reference.merge(offered)
    kept = offered
    hidden = 0
    if not args.ready_to_drink:
        kept = [product for product in kept if not ready_to_drink(product)]
        hidden = len(offered) - len(kept)
    repacked = 0
    if not args.repacks:
        extra = repacks(kept)
        kept = [product for product in kept if product["dan"] not in extra]
        repacked = len(extra)
    stamp = datetime.date.fromtimestamp(args.data.stat().st_mtime)
    gathered_on = f"{stamp.day} {stamp:%B} {stamp.year}"
    args.out.write_text(page({"products": kept}, gathered_on, hidden, repacked), encoding="utf-8")
    size = args.out.stat().st_size / 1024
    print(f"{args.out} holds {len(kept)} articles and weighs {size:.0f} kB")
    if hidden:
        print(f"{hidden} ready to drink articles were left out")
    if repacked:
        print(f"{repacked} repacks were left out")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
