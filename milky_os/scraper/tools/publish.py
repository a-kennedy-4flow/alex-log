#!/usr/bin/env python3
"""Puts the built pages where the app can serve them.

    python3 tools/publish.py

The single file pages are built to open straight off the filesystem. They are copied
into the app's public directory as well so one server answers for everything and a link
from one page to another always resolves.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT.parent / "scraper2" / "public" / "pages"

FILES = ["index.html", "compare.html"]
TREES = ["views", "profiles"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=APP)
    args = parser.parse_args(argv)

    missing = [name for name in FILES + TREES if not (ROOT / name).exists()]
    if missing:
        print(f"nothing to publish for {', '.join(missing)}. Build them first.", file=sys.stderr)
        return 1

    if args.out.exists():
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True)

    count = 0
    for name in FILES:
        shutil.copy2(ROOT / name, args.out / name)
        count += 1
    for name in TREES:
        shutil.copytree(ROOT / name, args.out / name)
        count += len(list((args.out / name).glob("*.html")))

    size = sum(f.stat().st_size for f in args.out.rglob("*.html")) / 1024
    print(f"{args.out} holds {count} pages and weighs {size:.0f} kB")
    print("  served at /pages/index.html once the app is built")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
