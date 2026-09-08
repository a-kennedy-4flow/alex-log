#!/usr/bin/env python3
"""Nimmt von jeder Betriebsseite eine Bildschirmaufnahme.

Firefox laeuft dafuer ohne Fenster. Zwei Eigenheiten sind zu beachten. Erstens
darf zur selben Zeit kein anderer Firefox laufen weil das Snap-Paket nur eine
Sitzung zulaesst. Zweitens sieht das Snap keine versteckten Ordner. Das Profil
liegt deshalb unter ~/ff-aufnahme und nicht unter ~/.cache.

Aufruf aus dem Ordner sites:
    python3 assets/aufnahmen.py
    python3 assets/aufnahmen.py apotheke-am-lindenplatz
"""

import subprocess
import sys
from pathlib import Path

from PIL import Image

ORT = Path(__file__).resolve().parent.parent
ZIEL = ORT / "assets" / "aufnahmen"
PROFIL = Path.home() / "ff-aufnahme"
FENSTER = (1280, 900)
BREITE = 800
GUETE = 78


def seiten(auswahl):
    ordner = sorted(p.parent for p in ORT.glob("*/index.html"))
    if not auswahl:
        return ordner
    gewaehlt = [p for p in ordner if p.name in auswahl]
    fehlend = set(auswahl) - {p.name for p in gewaehlt}
    if fehlend:
        raise SystemExit(f"unbekannte Seite: {sorted(fehlend)}")
    return gewaehlt


def aufnehmen(seite):
    roh = ZIEL / f"{seite.name}.png"
    befehl = [
        "firefox", "--headless", "--profile", str(PROFIL),
        f"--window-size={FENSTER[0]},{FENSTER[1]}",
        "--screenshot", str(roh),
        f"file://{seite / 'index.html'}",
    ]
    subprocess.run(befehl, check=False, capture_output=True, timeout=120)
    if not roh.exists():
        return False
    bild = Image.open(roh).convert("RGB")
    hoehe = round(bild.height * BREITE / bild.width)
    bild = bild.resize((BREITE, hoehe), Image.LANCZOS)
    bild.save(ZIEL / f"{seite.name}.jpg", quality=GUETE, optimize=True, progressive=True)
    roh.unlink()
    return True


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    PROFIL.mkdir(parents=True, exist_ok=True)
    fehler = []
    fertig = 0
    for seite in seiten(sys.argv[1:]):
        if aufnehmen(seite):
            fertig += 1
            print(".", end="", flush=True)
        else:
            fehler.append(seite.name)
            print("x", end="", flush=True)
    print()
    if fehler:
        raise SystemExit(f"keine Aufnahme moeglich: {fehler}. Laeuft noch ein Firefox?")
    print(f"{fertig} Aufnahmen in {ZIEL}")


if __name__ == "__main__":
    main()
