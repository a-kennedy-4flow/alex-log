"""Read a food label photograph and return the declared information."""

from .models import Box, Cell, Label, Nutrient, Quantity, Row
from .parse import parse_rows
from .reader import read_label

__all__ = ["Box", "Cell", "Label", "Nutrient", "Quantity", "Row", "parse_rows", "read_label"]
__version__ = "0.1.0"
