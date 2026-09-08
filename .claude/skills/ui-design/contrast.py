#!/usr/bin/env python3
"""
WCAG 2 contrast ratio between two colours.

Because a) a ratio recalled from memory is usually the one from a different
background. b) the difference between 4.4 and 4.6 decides whether a colour may
carry text at all.

    python3 contrast.py "#007EFF" "#FFFFFF"
    python3 contrast.py --pairs pairs.json

The json form is a list of triples. Each holds a name then a foreground then
a background.
"""

import json
import sys

# Body text needs this. Large text needs 3.
AA_BODY = 4.5


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(colour: str) -> float:
    h = colour.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def ratio(foreground: str, background: str) -> float:
    a, b = luminance(foreground), luminance(background)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def report(name: str, foreground: str, background: str) -> bool:
    value = ratio(foreground, background)
    ok = value >= AA_BODY
    print(f'{value:5.2f}  {"PASS" if ok else "fail"}  {name}')
    return ok


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == '--pairs':
        pairs = json.loads(open(argv[2], encoding='utf-8').read())
        failed = [p for p in pairs if not report(p[0], p[1], p[2])]
        print(f'\n{len(pairs) - len(failed)} of {len(pairs)} carry text at {AA_BODY} to 1.')
        if failed:
            print('These draw lines or fills alone:')
            for name, _, _ in failed:
                print(f'  {name}')
        return 0
    if len(argv) == 3:
        report(f'{argv[1]} on {argv[2]}', argv[1], argv[2])
        return 0
    print(__doc__)
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
