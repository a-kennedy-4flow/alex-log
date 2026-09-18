#!/usr/bin/env python3
"""Collects one encyclopedia description per declared nutrient.

    python3 tools/fetch_nutrients.py
    python3 tools/fetch_nutrients.py --no-cache

Writes `nutrients.json`. Every description is a direct quote with the article it was
taken from and the revision it was taken at. The text is Wikipedia and carries the
CC BY-SA 4.0 licence so it is quoted rather than rewritten.
"""

from __future__ import annotations

import argparse
import datetime
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
USER_AGENT = "milky_os/1.0 (nutrient profile builder; https://github.com/)"
RETRY = frozenset({429, 500, 502, 503, 504})
LICENCE = {
    "name": "CC BY-SA 4.0",
    "url": "https://creativecommons.org/licenses/by-sa/4.0/",
    "note": (
        "Wikipedia text is quoted rather than rewritten. Every quote names the article "
        "and the revision it was taken at."
    ),
}

# The name a pack prints against the article that explains it. An entry of None means no
# article says what the pack means so the profile carries no quote rather than a wrong one.
ARTICLES: dict[str, str | None] = {
    "Brennwert": "Food energy",
    "Fett": "Fat",
    "davon gesättigte Fettsäuren": "Saturated fat",
    "davon einfach ungesättigte Fettsäuren": "Monounsaturated fat",
    "davon mehrfach ungesättigte Fettsäuren": "Polyunsaturated fat",
    "Kohlenhydrate": "Carbohydrate",
    "davon Zucker": "Sugar",
    "davon Stärke": "Starch",
    "davon Milchzucker": "Lactose",
    "Laktose": "Lactose",
    "Folat": "Folate",
    "Folsäure": "Folic acid",
    "Folat, gesamt": "Folate",
    "Ballaststoffe": "Dietary fiber",
    "Eiweiß": "Protein (nutrient)",
    "Casein": "Casein",
    "Molkenprotein": "Whey protein",
    "Alanin": "Alanine",
    "Taurin": "Taurine",
    "Carnitin": "Carnitine",
    "Inositol": "Inositol",
    "Cholin, gesamt": "Choline",
    "Nukleotid": "Nucleotide",
    "Salz": "Salt",
    "Natrium": "Sodium",
    "Kalium": "Potassium",
    "Calcium": "Calcium",
    "Magnesium": "Magnesium",
    "Phosphor": "Phosphorus",
    "Eisen": "Iron",
    "Zink": "Zinc",
    "Kupfer": "Copper",
    "Mangan": "Manganese",
    "Selen": "Selenium",
    "Jod": "Iodine",
    "Chlorid": "Chloride",
    "Fluorid": "Fluoride",
    "Chrom": "Chromium",
    "Molybdän": "Molybdenum",
    "Vitamin A": "Vitamin A",
    "Vitamin C": "Vitamin C",
    "Vitamin D": "Vitamin D",
    "Vitamin E": "Vitamin E",
    "Vitamin K": "Vitamin K",
    "Vitamin B 1, Thiamin": "Thiamine",
    "Vitamin B 2, Riboflavin": "Riboflavin",
    "Vitamin B 6": "Vitamin B6",
    "Vitamin B 12": "Vitamin B12",
    "Niacin": "Niacin",
    "Pantothensäure": "Pantothenic acid",
    "Biotin": "Biotin",
    "Linolsäure": "Linoleic acid",
    "Alpha-Linolensäure": "Alpha-Linolenic acid",
    "Arachidonsäure": "Arachidonic acid",
    "Docosahexaensäure (DHA)": "Docosahexaenoic acid",
    "LCPs": "Polyunsaturated fatty acid",
    "Mittelkettige Triglyceride": "Medium-chain triglyceride",
    "Galactose": "Galactose",
    "Maltodextrin": "Maltodextrin",
    "Laktase": "Lactase",
    "Galactooligosaccharide (GOS)": "Galactooligosaccharide",
    "Fructooligosaccharide": "Fructooligosaccharide",
    "Humane Milch-Oligosaccharide (HMO)": "Human milk oligosaccharide",
    "2'-Fucosyllactose (2'-FL)": "2'-Fucosyllactose",
    "3-Fucosyllactose (3-FL)": "Human milk oligosaccharide",
    # Wikipedia carries no article on the sialyllactoses so the family article stands in
    "3'-Sialyllactose": "Human milk oligosaccharide",
    "6'-Sialyllactose": "Human milk oligosaccharide",
    "Difucosyllactose (DFL)": "Human milk oligosaccharide",
    "Lacto-N-Tetraose (LNT)": "Human milk oligosaccharide",
    "Lacto-N-Neotetraose (LNnt)": "Human milk oligosaccharide",
}


def fetch(title: str, cache: Path | None, gap: float, tries: int = 5) -> dict[str, Any] | None:
    """Ask the encyclopedia for one article summary.

    The endpoint answers 429 under a burst so each refusal doubles the wait. A cached
    article costs no request at all.
    """
    key = urllib.parse.quote(title.replace(" ", "_"), safe="")
    if cache is not None:
        kept = cache / f"{key}.json"
        if kept.exists():
            return json.loads(kept.read_text(encoding="utf-8"))
    url = SUMMARY.format(title=key)
    request = urllib.request.Request(url, headers={
        "user-agent": USER_AGENT, "accept": "application/json"})
    wait = gap
    for attempt in range(tries):
        time.sleep(wait)
        try:
            with urllib.request.urlopen(request, timeout=45) as answer:
                body = json.loads(answer.read().decode("utf-8"))
            if cache is not None:
                cache.mkdir(parents=True, exist_ok=True)
                (cache / f"{key}.json").write_text(json.dumps(body, ensure_ascii=False),
                                                   encoding="utf-8")
            return body
        except urllib.error.HTTPError as bad:
            if bad.code == 404:
                return {"error": "404 no such article", "title": title}
            if bad.code not in RETRY or attempt == tries - 1:
                return {"error": f"{bad.code} {bad.reason}", "title": title}
            wait *= 2
        except (urllib.error.URLError, TimeoutError) as bad:
            if attempt == tries - 1:
                return {"error": str(bad), "title": title}
            wait *= 2
    return None


def sentences(text: str, most: int = 3) -> str:
    """Keep the opening of the article so the quote stays a quote.

    Because a) the whole article is far more than a profile needs b) cutting mid sentence
    misquotes it c) the opening of an encyclopedia article is the definition.
    """
    out, count = [], 0
    for part in text.replace("\n", " ").split(". "):
        part = part.strip()
        if not part:
            continue
        out.append(part if part.endswith(".") else part + ".")
        count += 1
        if count >= most:
            break
    return " ".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "nutrients.json")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--gap", type=float, default=1.0)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    say = (lambda *_: None) if args.quiet else print
    cache = None if args.no_cache else ROOT / ".cache" / "encyclopedia"
    wanted = sorted({title for title in ARTICLES.values() if title})
    say(f"asking for {len(wanted)} articles behind {len(ARTICLES)} declared names")

    held: dict[str, Any] = {}
    for title in wanted:
        answer = fetch(title, cache, args.gap)
        if answer is None or answer.get("error"):
            say(f"  MISSING {title}: {(answer or {}).get('error')}")
            continue
        if answer.get("type") not in ("standard", None):
            say(f"  NOT AN ARTICLE {title}: {answer.get('type')}")
            continue
        held[title] = {
            "title": answer.get("title") or title,
            "description": answer.get("description") or "",
            "quote": sentences(answer.get("extract") or ""),
            "url": (answer.get("content_urls", {}).get("desktop", {}).get("page")
                    or f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title)}"),
            "revision": answer.get("revision") or "",
            "as_of": answer.get("timestamp") or "",
        }

    profiles = {}
    for name, title in ARTICLES.items():
        article = held.get(title or "")
        profiles[name] = {"article": title, **(article or {})} if article else {"article": title}

    payload = {
        "built_on": datetime.date.today().isoformat(),
        "source": "English Wikipedia by way of its REST summary endpoint",
        "licence": LICENCE,
        "profiles": profiles,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")
    quoted = sum(1 for one in profiles.values() if one.get("quote"))
    say(f"{args.out} holds {len(profiles)} names and {quoted} quotes over {len(held)} articles")
    for name, one in profiles.items():
        if not one.get("quote"):
            say(f"  no quote for {name!r} (article {one.get('article')!r})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
