#!/usr/bin/env python3
"""Setzt jeder Vorlagenseite eine Ecke oben links auf.

Die Ecke sagt dass die Seite eine Vorlage ist und f&uuml;hrt zur&uuml;ck zur Sammlung.
Der Aufruf laesst sich beliebig oft wiederholen. Vorhandene Ecken bleiben unberuehrt.

Aufruf aus dem Ordner sites:
    python3 assets/ecke.py
"""

import re
import sys
from pathlib import Path

ORT = Path(__file__).resolve().parent.parent

STIL = """  /* ecke:anfang */
  /* Ecke oben links. Weist die Seite als Vorlage aus. */
  .vorlagenecke { position: fixed; top: 0; left: 0; width: 104px; height: 104px; z-index: 900;
                  background: #e8a41c; color: #1a1a17; text-decoration: none;
                  clip-path: polygon(0 0, 100% 0, 0 100%);
                  box-shadow: 2px 2px 6px rgba(0,0,0,.28); }
  .vorlagenecke:hover { background: #f5b52f; }
  .vorlagenecke:focus-visible { outline: 3px solid #1a1a17; outline-offset: -6px; }
  .vorlagenecke b { position: absolute; top: 22px; left: -32px; width: 148px; text-align: center;
                    transform: rotate(-45deg); font: 700 11px/1 "Segoe UI", system-ui, sans-serif;
                    letter-spacing: .16em; text-transform: uppercase; }
  @media (max-width: 700px) {
    .vorlagenecke { width: 84px; height: 84px; }
    .vorlagenecke b { top: 16px; left: -38px; font-size: 10px; letter-spacing: .1em; }
  }
  @media print { .vorlagenecke { display: none; } }
  /* ecke:ende */
"""

ECKE = """<!-- ecke:anfang -->
<a class="vorlagenecke" href="../index.html"
   title="Diese Seite ist eine Vorlage aus der Sammlung Rehbrunn. Hier geht es zur&uuml;ck."
   aria-label="Diese Seite ist eine Vorlage. Zur&uuml;ck zur Vorlagensammlung.">
  <b>Vorlage</b>
</a>
<!-- ecke:ende -->
"""


def entfernen(text):
    """Nimmt eine vorhandene Ecke heraus. So laesst sich die Ecke erneuern."""
    text = re.sub(r"  /\* ecke:anfang \*/.*?  /\* ecke:ende \*/\n", "", text, flags=re.S)
    text = re.sub(r"<!-- ecke:anfang -->.*?<!-- ecke:ende -->\n", "", text, flags=re.S)
    # Fassung ohne Marken aus dem ersten Durchgang
    text = re.sub(r"\n  /\* Ecke oben links.*?@media print \{ \.vorlagenecke \{ display: none; \} \}\n",
                  "\n", text, flags=re.S)
    text = re.sub(r"<a class=\"vorlagenecke\".*?</a>\n", "", text, flags=re.S)
    return text


def setzen(pfad):
    text = pfad.read_text(encoding="utf-8")
    vorher = "vorlagenecke" in text
    text = entfernen(text)
    if "</style>" not in text:
        raise SystemExit(f"kein Stilblock in {pfad}")
    text = text.replace("</style>", STIL + "</style>", 1)
    treffer = re.search(r"<body[^>]*>\n?", text)
    if not treffer:
        raise SystemExit(f"kein body in {pfad}")
    stelle = treffer.end()
    text = text[:stelle] + ECKE + text[stelle:]
    pfad.write_text(text, encoding="utf-8")
    return "erneuert" if vorher else "gesetzt"


def main():
    auswahl = sys.argv[1:]
    seiten = sorted(ORT.glob("*/index.html"))
    if auswahl:
        seiten = [p for p in seiten if p.parent.name in auswahl]
    ergebnis = [setzen(p) for p in seiten]
    print(f"{ergebnis.count('gesetzt')} Ecken neu gesetzt und "
          f"{ergebnis.count('erneuert')} erneuert von {len(seiten)} Seiten")


if __name__ == "__main__":
    main()
