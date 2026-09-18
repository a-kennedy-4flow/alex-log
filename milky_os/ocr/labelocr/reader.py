"""The one call an application needs."""

from __future__ import annotations

from .models import Label
from .parse import parse_rows


def read_label(source, enhance: bool = False, min_confidence: float = 0.3) -> Label:
    # The engine is imported here so the parser stays usable without the ONNX stack.
    from .engine import read_rows

    return parse_rows(read_rows(source, enhance=enhance, min_confidence=min_confidence))
