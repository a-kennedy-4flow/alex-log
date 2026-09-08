#!/usr/bin/env python3
"""Erzeugt Platzhalterbilder f&uuml;r die Betriebsseiten.

Jedes Bild entsteht aus dem Namen des Betriebs und seiner Akzentfarbe. Gleicher
Name ergibt immer dasselbe Bild. Ein echtes Foto ersetzt spaeter einfach die
Datei unter demselben Namen und demselben Seitenverhaeltnis.

Aufruf:
    python3 bilder.py            alle Betriebe
    python3 bilder.py apotheke-am-lindenplatz
    python3 bilder.py --bildnisse 4 apotheke-am-lindenplatz
"""

import colorsys
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ORDNER = Path(__file__).resolve().parent / "bilder"

# slug: (akzent, zweitfarbe, motiv)
BETRIEBE = {
    "konditorei-mohnblume": ("#a63d40", "#f3e2cf", "kreise"),
    "gasthaus-zur-alten-muehle": ("#7c4a1e", "#e8dcc2", "balken"),
    "apotheke-am-lindenplatz": ("#007a33", "#dceee2", "kreuz"),
    "optik-sternberg": ("#2f5bd7", "#dde6fb", "kreise"),
    "hoerakustik-wieland": ("#a35c00", "#f3eee2", "wellen"),
    "sanitaetshaus-kranich": ("#0d6b7d", "#d9ecf0", "balken"),
    "tierarztpraxis-ehlert": ("#3f7d3a", "#e2eedd", "kreise"),
    "physiotherapie-rehbrunn": ("#6ad3b4", "#12303a", "wellen"),
    "fahrschule-kurvenreich": ("#ffd21e", "#2b2b2b", "balken"),
    "kfz-meisterbetrieb-vogt": ("#ff7a1a", "#22262c", "raster"),
    "tischlerei-bergmann": ("#7b4a20", "#efe3cf", "maserung"),
    "polsterei-seidel": ("#9b3055", "#f2dfe5", "raster"),
    "schlosserei-kranz": ("#d94f2b", "#262a2e", "raster"),
    "elektro-sauer": ("#ffd23f", "#16283a", "balken"),
    "haustechnik-brandt": ("#14708f", "#dcecf2", "wellen"),
    "malerwerkstatt-reindl": ("#a24b2c", "#efe7da", "kreise"),
    "dachdeckerei-hufnagel": ("#a8322c", "#e6e9ec", "schuppen"),
    "steinmetz-aichinger": ("#8a7f68", "#e8e4da", "maserung"),
    "glaserei-sonnabend": ("#17798f", "#e2eff3", "raster"),
    "ofenbau-hartmann": ("#e08a3c", "#241b16", "kreise"),
    "uhrmacherei-pfeil": ("#7a6222", "#efece4", "kreise"),
    "fotoatelier-lichtblick": ("#e8c25a", "#191919", "balken"),
    "druckerei-falkenberg": ("#1f4ed8", "#e9edf9", "raster"),
    "schreibwaren-ohlert": ("#1e5f52", "#e7efe9", "balken"),
    "musikhaus-cantabile": ("#c9a0ff", "#1d1926", "wellen"),
    "reisebuero-weitblick": ("#0f7a8c", "#dcf0f5", "wellen"),
    "buchbinderei-halm": ("#7a3b2e", "#f0e6d6", "maserung"),
    "imkerei-sonnenwiese": ("#f0b429", "#f7efd8", "waben"),
    "mosterei-bachtal": ("#4a7c1e", "#e6efd9", "kreise"),
    "galabau-erle": ("#2f6b3f", "#e3ece0", "schuppen"),
}

# name: (breite, hoehe) fuer die drei Bildplaetze einer Seite
FORMATE = {"hero": (1600, 900), "tafel": (900, 675), "portraet": (700, 700)}


def farbe(wert):
    wert = wert.lstrip("#")
    return tuple(int(wert[i:i + 2], 16) for i in (0, 2, 4))


def mischen(a, b, anteil):
    return tuple(round(x + (y - x) * anteil) for x, y in zip(a, b))


def ton_drehen(rgb, grad):
    """Dreht den Farbton. So bekommt jedes Bildnis seine eigene Note."""
    h, l, s = colorsys.rgb_to_hls(*[k / 255 for k in rgb])
    h = (h + grad / 360) % 1
    return tuple(round(k * 255) for k in colorsys.hls_to_rgb(h, l, s))


MOTIVE = ["kreise", "balken", "raster", "wellen", "schuppen", "waben", "maserung", "kreuz"]

# Jeder Bildplatz bekommt eigenes Motiv und eigene Groesse und eigenes Licht.
PLAETZE = {
    "hero": dict(format="hero", versatz=0, skala=1.0, drehung=0, licht="verlauf", ton=0, kraft=1.0),
    "tafel": dict(format="tafel", versatz=3, skala=1.7, drehung=-14, licht="hell", ton=-16, kraft=0.8),
}
for i in range(1, 7):
    PLAETZE[f"portraet-{i}"] = dict(
        format="portraet", versatz=1 + i * 2, skala=1.15 + i * 0.22, drehung=22 * i - 44,
        licht="rund" if i % 2 else "hell", ton=-36 + i * 18, kraft=0.62,
    )
PLAETZE["portraet"] = PLAETZE["portraet-1"]


def verlauf(groesse, oben, unten, art, wuerfel):
    breite, hoehe = groesse
    bild = Image.new("RGB", (breite, hoehe))
    zeichner = ImageDraw.Draw(bild)
    if art == "rund":
        for y in range(hoehe):
            zeichner.line([(0, y), (breite, y)], fill=mischen(oben, unten, y / hoehe))
        maske = Image.new("L", (breite, hoehe), 0)
        mx, my = breite * wuerfel.uniform(.35, .65), hoehe * wuerfel.uniform(.3, .5)
        r = breite * .62
        ImageDraw.Draw(maske).ellipse([mx - r, my - r, mx + r, my + r], fill=255)
        maske = maske.filter(ImageFilter.GaussianBlur(breite // 5))
        hell = Image.new("RGB", (breite, hoehe), mischen(oben, (255, 255, 255), .35))
        bild = Image.composite(hell, bild, maske)
    else:
        schraeg = wuerfel.uniform(-.4, .4)
        for y in range(hoehe):
            for teil in range(1):
                anteil = min(1, max(0, y / hoehe + schraeg * 0))
            zeichner.line([(0, y), (breite, y)], fill=mischen(oben, unten, y / hoehe))
        if schraeg:
            seite = Image.new("RGB", (breite, hoehe))
            sz = ImageDraw.Draw(seite)
            for x in range(breite):
                sz.line([(x, 0), (x, hoehe)], fill=mischen(oben, unten, x / breite))
            bild = Image.blend(bild, seite, abs(schraeg))
    flecken = Image.new("RGB", (breite, hoehe), (0, 0, 0))
    fz = ImageDraw.Draw(flecken)
    for _ in range(6):
        radius = wuerfel.randint(breite // 6, breite // 2)
        mitte = (wuerfel.randint(0, breite), wuerfel.randint(0, hoehe))
        fz.ellipse([mitte[0] - radius, mitte[1] - radius, mitte[0] + radius, mitte[1] + radius],
                   fill=mischen(oben, unten, wuerfel.random()))
    flecken = flecken.filter(ImageFilter.GaussianBlur(breite // 7))
    return Image.blend(bild, flecken, 0.38)


def motiv_schicht(groesse, art, ton, wuerfel, skala, kraft):
    """Zeichnet das Muster auf eine eigene Ebene. Die Ebene ist groesser als das
    Bild damit sie gedreht und dann beschnitten werden kann."""
    breite, hoehe = groesse
    linie = (*ton, round(150 * kraft))
    schicht = Image.new("RGBA", (breite, hoehe), (0, 0, 0, 0))
    zeichner = ImageDraw.Draw(schicht)
    stark = max(2, round(breite / (220 * skala)))
    einheit = breite / skala

    if art == "kreise":
        for _ in range(round(9 * skala)):
            radius = wuerfel.uniform(einheit / 9, einheit / 3)
            mitte = (wuerfel.uniform(0, breite), wuerfel.uniform(0, hoehe))
            zeichner.ellipse([mitte[0] - radius, mitte[1] - radius, mitte[0] + radius, mitte[1] + radius],
                             outline=linie, width=stark)
    elif art == "balken":
        schritt = round(einheit / 11)
        for x in range(-hoehe, breite + hoehe, schritt):
            zeichner.line([(x, hoehe), (x + hoehe, 0)], fill=linie, width=max(3, schritt // 4))
    elif art == "raster":
        schritt = round(einheit / 13)
        for x in range(0, breite + schritt, schritt):
            zeichner.line([(x, 0), (x, hoehe)], fill=linie, width=stark)
        for y in range(0, hoehe + schritt, schritt):
            zeichner.line([(0, y), (breite, y)], fill=linie, width=stark)
    elif art == "wellen":
        reihen = round(6 * skala)
        for reihe in range(reihen):
            grund = hoehe * (reihe + 1) / (reihen + 1)
            punkte = [(x, grund + math.sin(x / breite * 5 + reihe * .9) * hoehe / (12 * skala))
                      for x in range(0, breite + 16, 16)]
            zeichner.line(punkte, fill=linie, width=max(3, stark * 2), joint="curve")
    elif art == "schuppen":
        schritt = round(einheit / 15)
        for reihe, y in enumerate(range(0, hoehe + schritt, max(1, schritt // 2))):
            versatz = 0 if reihe % 2 else schritt // 2
            for x in range(-schritt, breite + schritt, schritt):
                zeichner.arc([x + versatz, y - schritt, x + versatz + schritt, y + schritt],
                             start=0, end=180, fill=linie, width=stark)
    elif art == "waben":
        radius = einheit / 12
        breit, hoch = radius * 1.5, radius * math.sqrt(3)
        for spalte in range(int(breite / breit) + 2):
            for reihe in range(int(hoehe / hoch) + 2):
                x, y = spalte * breit, reihe * hoch + (hoch / 2 if spalte % 2 else 0)
                ecken = [(x + radius * math.cos(math.radians(60 * k)),
                          y + radius * math.sin(math.radians(60 * k))) for k in range(6)]
                zeichner.polygon(ecken, outline=linie, width=stark)
    elif art == "kreuz":
        schritt = round(einheit / 5)
        arm = max(2, schritt // 9)
        for reihe, y in enumerate(range(0, hoehe + schritt, schritt)):
            versatz = 0 if reihe % 2 else schritt // 2
            for x in range(-schritt, breite + schritt, schritt):
                mx, my = x + versatz, y
                zeichner.rectangle([mx - arm, my - arm * 3, mx + arm, my + arm * 3], fill=linie)
                zeichner.rectangle([mx - arm * 3, my - arm, mx + arm * 3, my + arm], fill=linie)
    elif art == "maserung":
        reihen = round(20 * skala)
        for i in range(reihen):
            grund = hoehe * i / (reihen - 1)
            welle = wuerfel.uniform(1.4, 2.6)
            versatz = wuerfel.uniform(0, 6)
            tiefe = hoehe / (24 * skala) * (0.4 + abs(math.sin(i)))
            punkte = [(x, grund + math.sin(x / breite * welle * math.pi + versatz) * tiefe)
                      for x in range(0, breite + 16, 16)]
            zeichner.line(punkte, fill=linie, width=stark, joint="curve")
    return schicht


def koernung(bild, wuerfel):
    breite, hoehe = bild.size
    rauschen = Image.effect_noise((breite, hoehe), 12).convert("L")
    return Image.composite(bild, Image.blend(bild, rauschen.convert("RGB"), 0.08), rauschen)


def bild_bauen(slug, platz):
    akzent, zweit, motiv = BETRIEBE[slug]
    plan = PLAETZE[platz]
    breite, hoehe = FORMATE[plan["format"]]
    wuerfel = random.Random(f"{slug}-{platz}-v2")

    grund = ton_drehen(farbe(akzent), plan["ton"])
    papier = farbe(zweit)
    if plan["licht"] == "hell":
        oben, unten = mischen(papier, (255, 255, 255), .3), mischen(grund, papier, .45)
    elif plan["licht"] == "rund":
        oben, unten = mischen(grund, papier, .6), mischen(grund, (0, 0, 0), .55)
    else:
        oben, unten = mischen(papier, grund, .3), mischen(grund, (0, 0, 0), .3)

    bild = verlauf((breite, hoehe), oben, unten, plan["licht"], wuerfel)

    art = MOTIVE[(MOTIVE.index(motiv) + plan["versatz"]) % len(MOTIVE)]
    gross = round(math.hypot(breite, hoehe)) + 4
    schicht = motiv_schicht((gross, gross), art, mischen(papier, (255, 255, 255), .45),
                            wuerfel, plan["skala"], plan["kraft"])
    if plan["drehung"]:
        schicht = schicht.rotate(plan["drehung"], resample=Image.BICUBIC)
    links, oben_kante = (gross - breite) // 2, (gross - hoehe) // 2
    schicht = schicht.crop((links, oben_kante, links + breite, oben_kante + hoehe))
    bild = Image.alpha_composite(bild.convert("RGBA"), schicht).convert("RGB")

    rand = Image.new("L", (breite, hoehe), 0)
    ImageDraw.Draw(rand).ellipse([-breite // 4, -hoehe // 4, breite * 5 // 4, hoehe * 5 // 4], fill=255)
    rand = rand.filter(ImageFilter.GaussianBlur(breite // 6))
    dunkel = Image.new("RGB", (breite, hoehe), mischen(unten, (0, 0, 0), .4))
    bild = Image.composite(bild, dunkel, rand)
    return koernung(bild, wuerfel)


def main():
    fehlend = {m for _, _, m in BETRIEBE.values()} - set(MOTIVE)
    if fehlend:
        raise SystemExit(f"Motiv nicht gezeichnet: {sorted(fehlend)}")
    ORDNER.mkdir(parents=True, exist_ok=True)
    argumente = sys.argv[1:]
    bildnisse = 0
    if "--bildnisse" in argumente:
        i = argumente.index("--bildnisse")
        bildnisse = int(argumente[i + 1])
        del argumente[i:i + 2]
    gewuenscht = argumente or list(BETRIEBE)
    unbekannt = [s for s in gewuenscht if s not in BETRIEBE]
    if unbekannt:
        raise SystemExit(f"unbekannter Betrieb: {unbekannt}")
    anzahl = 0
    for slug in gewuenscht:
        plaetze = ["hero", "tafel", "portraet"]
        plaetze += [f"portraet-{i}" for i in range(1, bildnisse + 1)]
        for platz in plaetze:
            ziel = ORDNER / f"{slug}-{platz}.jpg"
            bild_bauen(slug, platz).save(ziel, quality=82, optimize=True, progressive=True)
            anzahl += 1
    print(f"{anzahl} Bilder in {ORDNER}")


if __name__ == "__main__":
    main()
