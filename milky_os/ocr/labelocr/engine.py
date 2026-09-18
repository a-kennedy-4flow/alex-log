"""Turns an image into rows of recognised text."""

from __future__ import annotations

from pathlib import Path
from typing import Union

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .models import Box, Cell, Row

MIN_LONG_SIDE = 1280
"""Photographs below this size lose small print. Upscaling before detection recovers it."""

_engine = None

Source = Union[str, Path, Image.Image]


def _ocr():
    """One engine serves the process. Because each build loads three ONNX models."""
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR

        _engine = RapidOCR()
    return _engine


def open_image(source: Source) -> Image.Image:
    image = source if isinstance(source, Image.Image) else Image.open(source)
    image = ImageOps.exif_transpose(image)
    return image if image.mode == "RGB" else image.convert("RGB")


def prepare(image: Image.Image, enhance: bool = False) -> Image.Image:
    """Scale the image for detection.

    Contrast and sharpening are off by default. Because a) they cost nothing on clean
    artwork b) they amplify the noise in a real photograph c) a sweep over a small
    German label lost five recognised words to them.
    """
    long_side = max(image.size)
    if long_side < MIN_LONG_SIDE:
        scale = MIN_LONG_SIDE / long_side
        width, height = image.size
        image = image.resize((round(width * scale), round(height * scale)), Image.LANCZOS)
    if enhance:
        grey = ImageOps.autocontrast(ImageOps.grayscale(image), cutoff=1)
        grey = grey.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))
        image = grey.convert("RGB")
    return image


def read_cells(
    source: Source,
    enhance: bool = False,
    min_confidence: float = 0.3,
) -> list[Cell]:
    """Recognise the text. Boxes come back in the coordinates of the source image."""
    image = open_image(source)
    prepared = prepare(image, enhance=enhance)
    scale = prepared.width / image.width
    # RapidOCR reads the array in the channel order OpenCV uses.
    array = np.asarray(prepared)[:, :, ::-1]
    result, _timings = _ocr()(array)
    cells: list[Cell] = []
    for points, text, score in result or []:
        text = text.strip()
        if not text or float(score) < min_confidence:
            continue
        xs = [point[0] / scale for point in points]
        ys = [point[1] / scale for point in points]
        box = Box(round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys)))
        cells.append(Cell(text=text, confidence=float(score), box=box))
    return cells


def group_rows(cells: list[Cell], share: float = 0.5) -> list[Row]:
    rows: list[Row] = []
    for cell in sorted(cells, key=lambda item: (item.box.centre_y, item.box.left)):
        for row in rows:
            if row.box.overlaps_vertically(cell.box, share):
                row.cells.append(cell)
                break
        else:
            rows.append(Row([cell]))
    for row in rows:
        row.cells.sort(key=lambda item: item.box.left)
    rows.sort(key=lambda item: item.box.top)
    return rows


def read_rows(
    source: Source,
    enhance: bool = False,
    min_confidence: float = 0.3,
) -> list[Row]:
    return group_rows(read_cells(source, enhance=enhance, min_confidence=min_confidence))
