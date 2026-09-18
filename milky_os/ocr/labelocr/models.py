"""Types the reader returns."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def height(self) -> int:
        return self.bottom - self.top

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def centre_x(self) -> float:
        return (self.left + self.right) / 2

    @property
    def centre_y(self) -> float:
        return (self.top + self.bottom) / 2

    def union(self, other: "Box") -> "Box":
        return Box(
            min(self.left, other.left),
            min(self.top, other.top),
            max(self.right, other.right),
            max(self.bottom, other.bottom),
        )

    def overlaps_vertically(self, other: "Box", share: float = 0.5) -> bool:
        """Test whether two boxes sit on the same printed line.

        Because a) a nutrition table row is detected as one box per column b) the
        columns of a row share most of their vertical extent c) the shorter box
        sets the limit so a tall box cannot swallow a small one.
        """
        overlap = min(self.bottom, other.bottom) - max(self.top, other.top)
        shorter = min(self.height, other.height)
        if shorter <= 0:
            return False
        return overlap / shorter >= share

    def to_dict(self) -> dict[str, int]:
        return {
            "left": self.left,
            "top": self.top,
            "right": self.right,
            "bottom": self.bottom,
        }


@dataclass
class Cell:
    """One text region as the OCR engine found it."""

    text: str
    confidence: float
    box: Box

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "confidence": round(self.confidence, 3),
            "box": self.box.to_dict(),
        }


@dataclass
class Row:
    """The cells that share one printed line."""

    cells: list[Cell]

    @property
    def text(self) -> str:
        return " ".join(cell.text for cell in self.cells)

    @property
    def box(self) -> Box:
        box = self.cells[0].box
        for cell in self.cells[1:]:
            box = box.union(cell.box)
        return box

    @property
    def confidence(self) -> float:
        return min(cell.confidence for cell in self.cells)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "confidence": round(self.confidence, 3),
            "box": self.box.to_dict(),
            "cells": [cell.to_dict() for cell in self.cells],
        }


@dataclass(frozen=True)
class Quantity:
    value: float
    unit: str

    def __str__(self) -> str:
        return f"{self.value:g} {self.unit}"

    def to_dict(self) -> dict[str, Any]:
        return {"value": self.value, "unit": self.unit}


@dataclass
class Nutrient:
    """One row of the nutrition declaration."""

    name: str
    per_100: Quantity | None = None
    per_serving: Quantity | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "per_100": self.per_100.to_dict() if self.per_100 else None,
            "per_serving": self.per_serving.to_dict() if self.per_serving else None,
        }


@dataclass
class Label:
    product_name: str | None = None
    net_quantity: Quantity | None = None
    ingredients: str | None = None
    allergens: list[str] = field(default_factory=list)
    may_contain: list[str] = field(default_factory=list)
    nutrition: list[Nutrient] = field(default_factory=list)
    nutrition_basis: str | None = None
    serving: str | None = None
    best_before: str | None = None
    use_by: str | None = None
    storage: str | None = None
    barcode: str | None = None
    warnings: list[str] = field(default_factory=list)
    rows: list[Row] = field(default_factory=list)

    def nutrient(self, name: str) -> Nutrient | None:
        for nutrient in self.nutrition:
            if nutrient.name == name:
                return nutrient
        return None

    @property
    def confidence(self) -> float:
        if not self.rows:
            return 0.0
        return sum(row.confidence for row in self.rows) / len(self.rows)

    def to_dict(self, include_rows: bool = False) -> dict[str, Any]:
        data: dict[str, Any] = {
            "product_name": self.product_name,
            "net_quantity": self.net_quantity.to_dict() if self.net_quantity else None,
            "ingredients": self.ingredients,
            "allergens": self.allergens,
            "may_contain": self.may_contain,
            "nutrition_basis": self.nutrition_basis,
            "serving": self.serving,
            "nutrition": [nutrient.to_dict() for nutrient in self.nutrition],
            "best_before": self.best_before,
            "use_by": self.use_by,
            "storage": self.storage,
            "barcode": self.barcode,
            "confidence": round(self.confidence, 3),
            "warnings": self.warnings,
        }
        if include_rows:
            data["rows"] = [row.to_dict() for row in self.rows]
        return data
