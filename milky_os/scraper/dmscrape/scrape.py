"""Runs the listing and the article reads as one job."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from .client import Client, FetchError
from .listing import BABY_MILK, Entry, iter_entries
from .models import Product
from .product import fetch_product

Progress = Callable[[str], None]


@dataclass
class Failure:
    dan: int
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {"dan": self.dan, "reason": self.reason}


@dataclass
class Result:
    """What one run collected."""

    products: list[Product] = field(default_factory=list)
    failures: list[Failure] = field(default_factory=list)

    @property
    def without_nutrition(self) -> list[Product]:
        return [product for product in self.products if product.nutrition is None]

    def to_dict(self) -> dict[str, Any]:
        return {
            "count": len(self.products),
            "products": [product.to_dict() for product in self.products],
            "failures": [failure.to_dict() for failure in self.failures],
        }


def _note(progress: Progress | None, message: str) -> None:
    if progress:
        progress(message)


def collect(
    client: Client,
    dans: Iterable[int],
    progress: Progress | None = None,
    total: int | None = None,
) -> Result:
    """Read every article and keep going past one that fails."""
    result = Result()
    for index, dan in enumerate(dans, start=1):
        position = f"{index}/{total}" if total else str(index)
        try:
            product = fetch_product(client, dan)
        except (FetchError, KeyError, ValueError) as error:
            result.failures.append(Failure(dan, str(error)))
            _note(progress, f"[{position}] {dan} failed: {error}")
            continue
        result.products.append(product)
        rows = len(product.nutrition.nutrients) if product.nutrition else 0
        _note(progress, f"[{position}] {product.full_name} -- {rows} nutrients")
    return result


def scrape_category(
    client: Client,
    category: str = BABY_MILK,
    query: str = "",
    limit: int | None = None,
    progress: Progress | None = None,
) -> Result:
    _note(progress, "reading the listing")
    found: list[Entry] = list(iter_entries(client, category=category, query=query))
    if limit is not None:
        found = found[:limit]
    _note(progress, f"the listing holds {len(found)} articles")
    return collect(client, [entry.dan for entry in found], progress, len(found))
