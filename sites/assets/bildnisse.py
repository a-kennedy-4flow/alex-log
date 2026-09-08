#!/usr/bin/env python3
"""Erzeugt Bildnisse im Stil eines Ratespiels mit Gesichtern.

Grundlage ist die Sammlung DiceBear. Sie arbeitet auf dem eigenen Rechner und
ruft nichts aus dem Netz. Der Name der Person ist der Same. Gleicher Name ergibt
immer dasselbe Gesicht.

Vorher einmal einrichten:
    pip install dicebear-core dicebear-styles

Aufruf aus dem Ordner sites:
    python3 assets/bildnisse.py
    python3 assets/bildnisse.py --stil notionists
    python3 assets/bildnisse.py --muster

Die Stile open-peeps und notionists und lorelei stehen unter CC0. Sie brauchen
keine Namensnennung. Die Stile personas und micah und dylan stehen unter CC BY 4.0
und verlangen einen Hinweis auf den Urheber.
"""

import argparse
import importlib.resources as res
import json
from pathlib import Path

try:
    from dicebear import Avatar, Style
except ImportError:  # pragma: no cover
    raise SystemExit("dicebear fehlt. Bitte 'pip install dicebear-core dicebear-styles' ausfuehren.")

ORT = Path(__file__).resolve().parent.parent
ZIEL = ORT / "assets" / "bildnisse"
FREI = {"open-peeps", "notionists", "lorelei", "thumbs", "pixel-art", "identicon"}
MUSTERSTILE = ["open-peeps", "notionists", "lorelei", "personas", "micah", "toon-head",
               "dylan", "adventurer", "avataaars", "big-smile", "miniavs", "croodles"]

# Person und Seite. Der Name ist zugleich der Same.
# Der Zufall kennt kein Geschlecht. Ein Bart auf einer Frau Doktor faellt sofort auf.
# Deshalb entscheidet nicht das Programm sondern der Eintrag hier. Wer keinen Bart
# tragen soll bekommt facialHairProbability auf null.
OHNE_BART = {"facialHairProbability": 0}
LEUTE = [
    ("apotheke-am-lindenplatz", "Dr. Silke Amend", OHNE_BART),
    ("apotheke-am-lindenplatz", "Jonas Weller", {}),
    ("apotheke-am-lindenplatz", "Petra Lind", OHNE_BART),
    ("apotheke-am-lindenplatz", "Mira Sahin", OHNE_BART),
]


def stil_laden(name):
    roh = res.files("dicebear_styles").joinpath(f"{name}.json").read_text(encoding="utf-8")
    return Style.from_json(roh)


def dateiname(person):
    return person.replace("Dr. ", "").replace(" ", "-").lower()


# Der Zufall waehlt sonst auch Wut und Angst. Ein Betrieb zeigt freundliche Gesichter.
FREUNDLICH = ["smile", "smileBig", "smileTeethGap", "calm", "lovingGrin1", "lovingGrin2",
              "cheeky", "explaining", "serious"]


def bildnis(style, same, grund, freundlich=True, eigenes=None):
    einstellungen = {"seed": same}
    if grund:
        einstellungen["backgroundColor"] = [grund.lstrip("#")]
    bauteile = style.components()
    if freundlich and "expression" in bauteile:
        moeglich = set(bauteile["expression"].variants())
        # Die Optionen heissen <Bauteil>Variant und <Bauteil>Probability.
        einstellungen["expressionVariant"] = [a for a in FREUNDLICH if a in moeglich]
        # Brillen und Baerte unterscheiden die Leute. Deshalb haeufiger als voreingestellt.
        einstellungen["accessoriesProbability"] = 45
        einstellungen["facialHairProbability"] = 35
    einstellungen.update(eigenes or {})
    return Avatar(style, einstellungen).to_string()


def muster(stile, grund):
    """Legt von jedem Stil vier Gesichter ab. Fuer den Vergleich auf einer Seite."""
    ordner = ZIEL / "muster"
    ordner.mkdir(parents=True, exist_ok=True)
    namen = [name for _, name, _ in LEUTE]
    for name in stile:
        style = stil_laden(name)
        for person in namen:
            (ordner / f"{name}-{dateiname(person)}.svg").write_text(
                bildnis(style, person, grund), encoding="utf-8")
    print(f"{len(stile) * len(namen)} Musterbildnisse in {ordner}")


def main():
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument("--stil", default="open-peeps")
    zerleger.add_argument("--grund", default="f2f5f6", help="Hintergrundfarbe ohne Raute")
    zerleger.add_argument("--muster", action="store_true", help="alle Vergleichsstile ablegen")
    wahl = zerleger.parse_args()

    ZIEL.mkdir(parents=True, exist_ok=True)
    if wahl.muster:
        muster(MUSTERSTILE, wahl.grund)
        return

    style = stil_laden(wahl.stil)
    for seite, person, eigenes in LEUTE:
        pfad = ZIEL / f"{seite}-{dateiname(person)}.svg"
        pfad.write_text(bildnis(style, person, wahl.grund, eigenes=eigenes), encoding="utf-8")
    hinweis = "ohne Namensnennung" if wahl.stil in FREI else "mit Pflicht zur Namensnennung"
    print(f"{len(LEUTE)} Bildnisse im Stil {wahl.stil} ({hinweis}) in {ZIEL}")


if __name__ == "__main__":
    main()
