"""The dm price out of the article payload the scraper already read."""

from __future__ import annotations

import re
from typing import Any

from ...client import Client
from ...models import Product
from ...product import detail_url
from ..match import grams
from ..models import Offer

MONEY = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2})")
PER_KILO = re.compile(r"\(([\d.,]+)\s*€\s*je\s*1\s*(kg|l)\)", re.IGNORECASE)


def money(text: str) -> float | None:
    """Read a German price as a float."""
    found = MONEY.search(text or "")
    if not found:
        return None
    return float(found.group(1).replace(".", "").replace(",", "."))


class DmSource:
    """dm publishes the price beside the declaration so no extra request is made."""

    site = "dm.de"

    def __init__(self, client: Client) -> None:
        self.client = client

    def offer_for(self, product: Product) -> Offer | None:
        payload: dict[str, Any] = self.client.get_json(detail_url(product.dan))
        block = payload.get("price") or {}
        current = ((block.get("price") or {}).get("current") or {}).get("value")
        price = money(current or "")
        if price is None:
            price = (payload.get("metadata") or {}).get("price")
        if price is None:
            return None
        infos = " ".join(block.get("infos") or [])
        kilo = PER_KILO.search(infos)
        return Offer(
            site=self.site,
            title=product.full_name,
            price=float(price),
            url=product.url,
            matched="dan",
            score=1.0,
            grams=grams(product.net_quantity),
            per_kilo=float(kilo.group(1).replace(".", "").replace(",", ".")) if kilo else None,
        )
