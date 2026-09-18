"""Types the scraper returns."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Quantity:
    """One number with its unit as the declaration prints it."""

    value: float | None
    unit: str
    qualifier: str = ""

    def __str__(self) -> str:
        if self.value is None:
            return self.unit
        head = f"{self.qualifier} " if self.qualifier else ""
        return f"{head}{self.value:g} {self.unit}".strip()

    def to_dict(self) -> dict[str, Any]:
        return {"value": self.value, "unit": self.unit, "qualifier": self.qualifier or None}


@dataclass(frozen=True)
class Measurement:
    """What one nutrient declares under one basis."""

    basis: str
    text: str
    quantities: tuple[Quantity, ...] = ()

    @property
    def parsed(self) -> bool:
        return bool(self.quantities)

    def unit(self, unit: str) -> Quantity | None:
        for quantity in self.quantities:
            if quantity.unit == unit:
                return quantity
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "basis": self.basis,
            "text": self.text,
            "quantities": [quantity.to_dict() for quantity in self.quantities],
        }


@dataclass
class Nutrient:
    """One printed row of the nutrition declaration."""

    name: str
    measurements: list[Measurement] = field(default_factory=list)

    def under(self, basis: str) -> Measurement | None:
        for measurement in self.measurements:
            if measurement.basis == basis:
                return measurement
        return None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "measurements": [measurement.to_dict() for measurement in self.measurements],
        }


@dataclass
class NutritionTable:
    """The whole declaration as dm publishes it."""

    caption: str = ""
    bases: list[str] = field(default_factory=list)
    nutrients: list[Nutrient] = field(default_factory=list)

    def nutrient(self, name: str) -> Nutrient | None:
        wanted = name.casefold()
        for nutrient in self.nutrients:
            if nutrient.name.casefold() == wanted:
                return nutrient
        return None

    @property
    def unparsed(self) -> list[Measurement]:
        return [m for n in self.nutrients for m in n.measurements if not m.parsed]

    def to_dict(self) -> dict[str, Any]:
        return {
            "caption": self.caption,
            "bases": self.bases,
            "nutrients": [nutrient.to_dict() for nutrient in self.nutrients],
        }


@dataclass
class Product:
    """One article of the listing with its declaration."""

    dan: int
    gtin: int | None = None
    brand: str = ""
    name: str = ""
    legal_category: str = ""
    net_quantity: str = ""
    category: str = ""
    url: str = ""
    nutrition: NutritionTable | None = None

    @property
    def full_name(self) -> str:
        return f"{self.brand} {self.name}".strip()

    def to_dict(self) -> dict[str, Any]:
        return {
            "dan": self.dan,
            "gtin": self.gtin,
            "brand": self.brand,
            "name": self.name,
            "full_name": self.full_name,
            "legal_category": self.legal_category,
            "net_quantity": self.net_quantity,
            "category": self.category,
            "url": self.url,
            "nutrition": self.nutrition.to_dict() if self.nutrition else None,
        }
