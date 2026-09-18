"""Collects one price per shop for every article the scraper already read."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from ..client import Client, FetchError
from ..models import Product
from .models import Offer
from .sources import NAMES, SOURCES

Progress = Callable[[str], None]


@dataclass
class Quote:
    """Every offer found for one article."""

    dan: int
    offers: list[Offer] = field(default_factory=list)

    @property
    def cheapest(self) -> Offer | None:
        priced = [o for o in self.offers if o.kilo_price is not None]
        return min(priced, key=lambda o: o.kilo_price or 0.0) if priced else None

    def to_dict(self) -> dict[str, Any]:
        return {"dan": self.dan, "offers": [offer.to_dict() for offer in self.offers]}


@dataclass
class PriceRun:
    """What one price collection found."""

    quotes: list[Quote] = field(default_factory=list)
    failures: list[dict[str, str]] = field(default_factory=list)

    def coverage(self) -> dict[str, int]:
        counts = {name: 0 for name in NAMES}
        for quote in self.quotes:
            for offer in quote.offers:
                counts[offer.site] = counts.get(offer.site, 0) + 1
        return counts

    def to_dict(self) -> dict[str, Any]:
        return {
            "sites": NAMES,
            "count": len(self.quotes),
            "coverage": self.coverage(),
            "quotes": [quote.to_dict() for quote in self.quotes],
            "failures": self.failures,
        }


def collect_prices(
    client: Client,
    products: Iterable[Product],
    sites: Iterable[str] | None = None,
    progress: Progress | None = None,
) -> PriceRun:
    """Ask every source for every article and keep going past one that refuses."""
    wanted = set(sites) if sites else set(NAMES)
    sources = [cls(client) for cls in SOURCES if cls.site in wanted]
    run = PriceRun()
    items = list(products)
    for index, product in enumerate(items, start=1):
        quote = Quote(dan=product.dan)
        for source in sources:
            try:
                offer = source.offer_for(product)
            except (FetchError, KeyError, ValueError) as error:
                run.failures.append({"dan": str(product.dan), "site": source.site,
                                     "reason": str(error)})
                continue
            if offer:
                quote.offers.append(offer)
        run.quotes.append(quote)
        if progress:
            found = " ".join(f"{o.site} {o.price:.2f}" for o in quote.offers) or "no offer"
            progress(f"[{index}/{len(items)}] {product.full_name} -- {found}")
    return run


__all__ = ["Offer", "PriceRun", "Quote", "collect_prices", "NAMES"]
