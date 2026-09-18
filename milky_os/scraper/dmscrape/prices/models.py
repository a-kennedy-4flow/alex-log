"""Types the price sources return."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

EURO_PER_KILO = 1000.0


@dataclass(frozen=True)
class Offer:
    """One price one shop publishes for one article."""

    site: str
    title: str
    price: float
    url: str
    matched: str
    score: float
    grams: float | None = None
    per_kilo: float | None = None
    currency: str = "EUR"

    @property
    def kilo_price(self) -> float | None:
        if self.per_kilo is not None:
            return self.per_kilo
        if self.grams:
            return self.price * EURO_PER_KILO / self.grams
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "site": self.site,
            "title": self.title,
            "price": round(self.price, 2),
            "currency": self.currency,
            "grams": self.grams,
            "per_kilo": round(self.kilo_price, 2) if self.kilo_price is not None else None,
            "url": self.url,
            "matched": self.matched,
            "score": round(self.score, 3),
        }
