"""One adapter per shop.

A source turns the article dm lists into at most one offer. It owns its query its parser
and its acceptance. It never raises for a shop that simply does not stock the article.
"""

from __future__ import annotations

from .dm import DmSource
from .shopapotheke import ShopApothekeSource
from .volksversand import VolksversandSource

SOURCES = [DmSource, ShopApothekeSource, VolksversandSource]
NAMES = [source.site for source in SOURCES]

__all__ = ["SOURCES", "NAMES", "DmSource", "ShopApothekeSource", "VolksversandSource"]
