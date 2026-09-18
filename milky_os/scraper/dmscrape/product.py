"""Reads one article from the dm product service."""

from __future__ import annotations

import re
from typing import Any

from .client import Client
from .models import Product
from .parse import nutrition_of, tidy

DETAIL_URL = "https://products.dm.de/product/products/detail/DE/dan/{dan}"
NET_QUANTITY = re.compile(r",\s*([\d.,]+\s*(?:g|kg|ml|l|St\.?|Stück))\s*$", re.IGNORECASE)


def detail_url(dan: int) -> str:
    return DETAIL_URL.format(dan=dan)


def net_quantity_of(headline: str) -> str:
    """Pull the pack size off the end of the article name."""
    match = NET_QUANTITY.search(headline)
    return tidy(match.group(1)) if match else ""


def parse_product(payload: dict[str, Any]) -> Product:
    title = payload.get("title") or {}
    seo = (payload.get("seoInformation") or {}).get("structuredData") or {}
    metadata = payload.get("metadata") or {}
    brand = payload.get("brand") or {}
    headline = tidy(title.get("headline"))
    path = tidy(payload.get("self"))
    return Product(
        dan=int(payload["dan"]),
        gtin=int(payload["gtin"]) if payload.get("gtin") else None,
        brand=tidy(brand.get("name") or seo.get("brand")),
        name=headline,
        legal_category=tidy(title.get("subheadline")),
        net_quantity=net_quantity_of(headline),
        category=tidy(seo.get("category") or " > ".join(payload.get("breadcrumbs") or [])),
        url=tidy(metadata.get("canonical")) or (f"https://www.dm.de{path}" if path else ""),
        nutrition=nutrition_of(payload),
    )


def fetch_product(client: Client, dan: int) -> Product:
    return parse_product(client.get_json(detail_url(dan)))
