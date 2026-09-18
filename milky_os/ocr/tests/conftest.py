import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from labelocr.models import Box, Cell, Row  # noqa: E402


def make_rows(lines: list[list[tuple[str, int]]], height: int = 24, gap: int = 14) -> list[Row]:
    """Build rows with cell positions so column tests have real geometry."""
    rows = []
    top = 0
    for line in lines:
        cells = [Cell(text, 0.99, Box(left, top, left + 11 * len(text), top + height)) for text, left in line]
        rows.append(Row(cells))
        top += height + gap
    return rows


def make_lines(texts: list[str]) -> list[Row]:
    return make_rows([[(text, 0)] for text in texts])


@pytest.fixture(scope="session")
def samples(tmp_path_factory) -> Path:
    from tools.make_samples import build

    directory = ROOT / "samples"
    if not all((directory / name).exists() for name in ("crisps.png", "milk.png", "cereal.png")):
        build(directory)
    return directory
