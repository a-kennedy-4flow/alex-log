"""volksversand.de prices out of the tracking block the search page writes."""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any, Iterator

from ...client import Client
from ...models import Product
from ..match import accepts, grams, stage_token
from ..models import Offer

SEARCH = "https://volksversand.de/search?q={query}"
IMPRESSIONS = re.compile(r'"impressions"\s*:\s*\[')
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "referer": "https://volksversand.de/",
}
STAGE_WORD = {"pre": "Pre", "1": "1", "2": "2", "3": "3", "4": "4", "kinder": "Kindermilch",
              "spezial": ""}


def impressions_in(page: str) -> list[dict[str, Any]]:
    """Pull the result list out of the tracking block.

    Because a) the shop pushes every result into the analytics layer b) that block carries
    the name the price and the article number c) the rendered markup needs no parsing.
    """
    decoder = json.JSONDecoder()
    for found in IMPRESSIONS.finditer(page):
        start = page.index("[", found.end() - 1)
        try:
            block, _ = decoder.raw_decode(page[start:])
        except ValueError:
            continue
        if isinstance(block, list):
            return [x for x in block if isinstance(x, dict) and "name" in x]
    return []


class VolksversandSource:
    """Asks once per maker and age step so the whole category costs a few requests."""

    site = "volksversand.de"

    def __init__(self, client: Client) -> None:
        self.client = client

    def queries(self, product: Product) -> Iterator[str]:
        step = STAGE_WORD.get(stage_token(product.name), "")
        yield f"{product.brand} {step}".strip()
        if step:
            yield product.brand

    def search(self, query: str) -> list[dict[str, Any]]:
        url = SEARCH.format(query=urllib.parse.quote_plus(query))
        return impressions_in(self.client.get_text(url, HEADERS))

    def offer_for(self, product: Product) -> Offer | None:
        wanted = grams(product.net_quantity)
        for query in self.queries(product):
            best: Offer | None = None
            for hit in self.search(query):
                title = (hit.get("name") or "").strip()
                price = hit.get("price")
                if not title or price is None:
                    continue
                score = accepts(product.brand, product.full_name, wanted, title,
                                grams(title), hit.get("brand") or "")
                if not score:
                    continue
                article = str(hit.get("id") or "")
                offer = Offer(
                    site=self.site,
                    title=title,
                    price=float(price),
                    url=SEARCH.format(query=urllib.parse.quote_plus(article or title)),
                    matched="name",
                    score=score,
                    grams=grams(title) or wanted,
                )
                if best is None or offer.score > best.score:
                    best = offer
            if best:
                return best
        return None
