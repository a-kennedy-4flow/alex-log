"""Draw synthetic food labels.

The samples give the reader something to run against without a photograph. Because
a) the text is known the tests can assert exact values b) no third party image has to
be committed c) a drawn label still exercises detection recognition and row grouping.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
WIDTH = 1000
MARGIN = 60
INK = (17, 17, 17)
PAPER = (252, 252, 250)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    path = FONT_DIR / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size)


class Sheet:
    def __init__(self, height: int = 1500):
        self.image = Image.new("RGB", (WIDTH, height), PAPER)
        self.draw = ImageDraw.Draw(self.image)
        self.y = MARGIN

    def text(self, value: str, size: int = 26, bold: bool = False, gap: int = 12, x: int = MARGIN) -> None:
        self.draw.text((x, self.y), value, font=font(size, bold), fill=INK)
        self.y += size + gap

    def wrapped(self, value: str, size: int = 24, width: int = 62, gap: int = 8) -> None:
        for line in textwrap.wrap(value, width=width):
            self.text(line, size=size, gap=gap)

    def columns(self, cells: list[str], positions: list[int], size: int = 26, bold: bool = False, gap: int = 14) -> None:
        for value, x in zip(cells, positions):
            self.draw.text((x, self.y), value, font=font(size, bold), fill=INK)
        self.y += size + gap

    def rule(self, gap: int = 14) -> None:
        self.draw.line([(MARGIN, self.y), (WIDTH - MARGIN, self.y)], fill=INK, width=2)
        self.y += gap

    def save(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.image.crop((0, 0, WIDTH, min(self.y + MARGIN, self.image.height))).save(path)
        return path


def crisps(out: Path) -> Path:
    sheet = Sheet()
    sheet.text("SALTED CRISPS", size=64, bold=True, gap=8)
    sheet.text("Hand cooked potato crisps", size=30, gap=26)
    sheet.text("INGREDIENTS:", size=26, bold=True, gap=8)
    sheet.wrapped(
        "Potatoes, Sunflower Oil (22%), Sea Salt, Milk Powder, Wheat Flour, "
        "Barley Malt Extract, Yeast Extract."
    )
    sheet.y += 10
    sheet.text("Allergy advice: contains milk, wheat and barley.", size=24, gap=26)
    columns = [MARGIN, 470, 700]
    sheet.columns(["NUTRITION", "per 100g", "per 30g serving"], columns, bold=True)
    sheet.rule()
    sheet.columns(["Energy", "2180kJ / 523kcal", "654kJ / 157kcal"], columns, size=24)
    sheet.columns(["Fat", "32.0g", "9.6g"], columns, size=24)
    sheet.columns(["of which saturates", "2.8g", "0.8g"], columns, size=24)
    sheet.columns(["Carbohydrate", "50.1g", "15.0g"], columns, size=24)
    sheet.columns(["of which sugars", "0.9g", "0.3g"], columns, size=24)
    sheet.columns(["Fibre", "4.3g", "1.3g"], columns, size=24)
    sheet.columns(["Protein", "6.2g", "1.9g"], columns, size=24)
    sheet.columns(["Salt", "1.30g", "0.39g"], columns, size=24)
    sheet.y += 20
    sheet.text("Net weight 150g e", size=28, bold=True, gap=10)
    sheet.text("Best before: 14/03/2027", size=26, gap=10)
    sheet.text("5012345678900", size=30, gap=10)
    return sheet.save(out)


def milk(out: Path) -> Path:
    sheet = Sheet()
    sheet.text("FRESH WHOLE MILK", size=58, bold=True, gap=8)
    sheet.text("Pasteurised and homogenised", size=30, gap=26)
    sheet.text("INGREDIENTS: Whole Milk.", size=26, gap=26)
    columns = [MARGIN, 520]
    sheet.columns(["Typical values", "per 100ml"], columns, bold=True)
    sheet.rule()
    sheet.columns(["Energy", "268kJ / 64kcal"], columns, size=24)
    sheet.columns(["Fat", "3.6g"], columns, size=24)
    sheet.columns(["of which saturates", "2.3g"], columns, size=24)
    sheet.columns(["Carbohydrate", "4.7g"], columns, size=24)
    sheet.columns(["of which sugars", "4.7g"], columns, size=24)
    sheet.columns(["Protein", "3.4g"], columns, size=24)
    sheet.columns(["Salt", "0.10g"], columns, size=24)
    sheet.y += 20
    sheet.text("Keep refrigerated below 5C.", size=24, gap=8)
    sheet.text("Once opened use within 3 days.", size=24, gap=20)
    sheet.text("Use by: 21 SEP 2026", size=28, gap=10)
    sheet.text("1 litre e", size=30, bold=True, gap=10)
    return sheet.save(out)


def cereal(out: Path) -> Path:
    sheet = Sheet()
    sheet.text("OAT CLUSTERS", size=60, bold=True, gap=8)
    sheet.text("Crunchy oat cereal with honey", size=30, gap=26)
    sheet.text("Ingredients:", size=26, bold=True, gap=8)
    sheet.wrapped(
        "Wholegrain Oats (68%), Sugar, Sunflower Oil, Honey (4%), Almonds (3%), "
        "Salt, Barley Malt Extract."
    )
    sheet.y += 10
    sheet.text("May contain peanuts and sesame.", size=24, gap=26)
    columns = [MARGIN, 560]
    sheet.columns(["Nutrition", "per 100g"], columns, bold=True)
    sheet.rule()
    sheet.columns(["Energy", "1780kJ / 425kcal"], columns, size=24)
    sheet.columns(["Fat", "14.2g"], columns, size=24)
    sheet.columns(["of which saturates", "1.7g"], columns, size=24)
    sheet.columns(["Carbohydrate", "60.4g"], columns, size=24)
    sheet.columns(["of which sugars", "17.2g"], columns, size=24)
    sheet.columns(["Fibre", "7.1g"], columns, size=24)
    sheet.columns(["Protein", "9.8g"], columns, size=24)
    sheet.columns(["Salt", "0.25g"], columns, size=24)
    sheet.y += 20
    sheet.text("Store in a cool dry place.", size=24, gap=20)
    sheet.text("Net quantity: 500g", size=28, bold=True, gap=10)
    sheet.text("Best before end: MAR 2027", size=26, gap=10)
    return sheet.save(out)


SAMPLES = {"crisps.png": crisps, "milk.png": milk, "cereal.png": cereal}


def build(directory: Path) -> list[Path]:
    return [maker(directory / name) for name, maker in SAMPLES.items()]


if __name__ == "__main__":
    import sys

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "samples"
    for path in build(target):
        print(path)
