"""shop-apotheke.com prices out of the search result the page carries."""

from __future__ import annotations

import json
import re
import urllib.parse
from typing import Any, Iterator

from ...client import Client
from ...models import Product
from ..match import accepts, grams, markers, stage_token
from ..models import Offer

SEARCH = "https://www.shop-apotheke.com/search.htm?q={query}"
HITS = re.compile(r'"hits"\s*:\s*\[')
PER_UNIT = re.compile(r"([\d.,]+)\s*€\s*/\s*1\s*(kg|l)", re.IGNORECASE)
HEADERS = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "referer": "https://www.shop-apotheke.com/",
}


def _number(text: str) -> float | None:
    try:
        return float((text or "").replace(".", "").replace(",", "."))
    except ValueError:
        return None


def hits_in(page: str) -> list[dict[str, Any]]:
    """Pull the search result out of the state the page embeds.

    Because a) the shop renders its results from a search service b) the whole answer is
    written into the page as JSON c) one request therefore yields the barcode the price
    the pack size and the link.
    """
    decoder = json.JSONDecoder()
    for found in HITS.finditer(page):
        start = page.index("[", found.end() - 1)
        try:
            block, _ = decoder.raw_decode(page[start:])
        except ValueError:
            continue
        if isinstance(block, list) and any(isinstance(x, dict) and "productName" in x for x in block):
            return [x for x in block if isinstance(x, dict)]
    return []


class ShopApothekeSource:
    """Asks for the barcode first and falls back to the recipe name."""

    site = "shop-apotheke.com"

    def __init__(self, client: Client) -> None:
        self.client = client

    def queries(self, product: Product) -> Iterator[tuple[str, str]]:
        if product.gtin:
            yield "gtin", str(product.gtin)
        words = " ".join(sorted(markers(product.name, product.brand))[:3])
        yield "name", f"{product.brand} {words} {stage_token(product.name)}".strip()

    def search(self, query: str) -> list[dict[str, Any]]:
        url = SEARCH.format(query=urllib.parse.quote_plus(query))
        return hits_in(self.client.get_text(url, HEADERS))

    def offer_for(self, product: Product) -> Offer | None:
        wanted = grams(product.net_quantity)
        for how, query in self.queries(product):
            best: Offer | None = None
            for hit in self.search(query):
                offer = self._offer(product, hit, how, wanted)
                if offer and (best is None or offer.score > best.score):
                    best = offer
            if best:
                return best
        return None

    def _offer(self, product: Product, hit: dict[str, Any], how: str, wanted: float | None):
        title = (hit.get("productName") or "").strip()
        amount = ((hit.get("prices") or {}).get("retailPrice") or {}).get("amount")
        if not title or amount is None:
            return None
        size = grams(hit.get("packSize") or "") or grams(title)
        if how == "gtin" and str(hit.get("ean") or "") == str(product.gtin):
            score = 1.0
        else:
            score = accepts(product.brand, product.full_name, wanted, title, size,
                            hit.get("brand") or "")
            how = "name"
        if not score:
            return None
        unit = PER_UNIT.search(hit.get("pricePerUnit") or "")
        link = (hit.get("deeplink") or "").lstrip("/")
        return Offer(
            site=self.site,
            title=title,
            price=float(amount),
            url=f"https://www.shop-apotheke.com/{link}" if link else SEARCH.format(query=product.gtin),
            matched=how,
            score=score,
            grams=size,
            per_kilo=_number(unit.group(1)) if unit else None,
        )
