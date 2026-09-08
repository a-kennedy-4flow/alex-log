#!/usr/bin/env python3
"""Baut die Startseite der Sammlung als Vorlagenbibliothek.

Das Skript liest jede Betriebsseite und ermittelt Grundton und Schrift und
Navigationsmuster und Zahl der Bildplaetze. Daraus entsteht index.html mit
mehreren Wegen zum Durchsehen.

Aufruf aus dem Ordner rehbrunn:
    python3 assets/vorlagen.py
"""

import json
import re
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

ORT = Path(__file__).resolve().parent.parent
DATEN = ORT / "assets" / "betriebe.json"

SERIFEN = ("Georgia", "Spectral", "Lora", "Merriweather", "Zilla", "Vollkorn", "Crimson",
           "Garamond", "Cormorant", "Source Serif", "Alegreya", "Iowan", "Bookman", "Charter",
           "Libre Baskerville", "Playfair", "Times", "Palatino", "Baskerville", "Hoefler",
           "Rockwell", "serif")
FEST = ("ui-monospace", "Courier", "Consolas", "Menlo", "Plex Mono", "monospace")

# Muster im Quelltext und ihr Name in der Sammlung
MERKMALE = [
    ("aufklappmenue", "Aufklappmen&uuml;", r'aria-haspopup|class="mega"|class="klapp"'),
    ("reiter", "Reiter", r'role="tab"'),
    ("ziehharmonika", "Ziehharmonika", r"<details"),
    ("seitenleiste", "Seitenleiste", r'nav class="seite"|nav class="inhalt"|class="ruecken"'),
    ("randpunkte", "Randnavigation", r'class="punkte"'),
    ("scrollmarke", "Scrollbeobachter", r"IntersectionObserver"),
    ("filter", "Filter", r'class="filter"|type="search"'),
    ("umschalter", "Umschalter", r'class="schalter"|class="waehler"'),
    ("rechner", "Rechner", r"function rechnen"),
    ("schublade", "Schubladenmen&uuml;", r'id="schub"'),
    ("unterleiste", "Zweite Leiste", r'class="unterleiste"|class="unterband"'),
    ("fixleiste", "Festes Element", r'class="notleiste"|class="hoch"'),
    ("bilder", "Bilder eingebaut", r'<img[^>]+assets/bilder'),
]

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source",
        "track", "wbr", "path", "circle", "rect", "line", "polygon", "polyline", "ellipse",
        "use", "stop", "text", "g"}
GITTER = {"karten", "kacheln", "gitter", "werke", "oefen", "zimmer", "leistungen", "sortiment",
          "projekte", "ziele", "galerie", "vorher", "arbeiten", "stoffe", "steine", "bezuege",
          "holz", "tiers", "klassen", "glaeser", "cases", "tiere"}


class Bloecke(HTMLParser):
    """Zaehlt die direkten Kinder aller Gitterbehaelter. Das sind die Bildplaetze."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stapel = []
        self.anzahl = 0

    def handle_starttag(self, tag, attrs):
        klassen = set(dict(attrs).get("class", "").split())
        gitter = bool(klassen & GITTER)
        if self.stapel and self.stapel[-1][1] and tag in ("li", "div", "article"):
            self.anzahl += 1
        if tag not in VOID:
            self.stapel.append((tag, gitter))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for i in range(len(self.stapel) - 1, -1, -1):
            if self.stapel[i][0] == tag:
                del self.stapel[i:]
                break


def helligkeit(hexwert):
    r, g, b = (int(hexwert[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def koerper_regel(quelltext):
    treffer = re.search(r"\n  body \{(.*?)\}", quelltext, re.S)
    return treffer.group(1) if treffer else ""


def grundton(regel):
    hintergrund = re.search(r"background:([^;]+);", regel)
    farben = re.findall(r"#[0-9a-fA-F]{6}", hintergrund.group(1) if hintergrund else "")
    if not farben:
        return "hell", "#ffffff"
    return ("dunkel" if helligkeit(farben[0]) < 0.45 else "hell"), farben[0]


def schriftart(regel):
    schrift = re.search(r"font:[^;]+;", regel)
    text = schrift.group(0) if schrift else ""
    if any(name in text for name in FEST):
        return "fest"
    # "serif" steckt auch in "sans-serif". Deshalb erst die Sippe entfernen.
    ohne_sippe = text.replace("sans-serif", "")
    if any(name in ohne_sippe for name in SERIFEN):
        return "serifen"
    return "serifenlos"


SCHRIFTNAME = {"serifen": "Serifen", "serifenlos": "Serifenlos", "fest": "Nichtproportional"}
TONNAME = {"hell": "Heller Grund", "dunkel": "Dunkler Grund"}


def sammeln():
    betriebe = json.loads(DATEN.read_text(encoding="utf-8"))
    for betrieb in betriebe:
        quelltext = (ORT / betrieb["slug"] / "index.html").read_text(encoding="utf-8")
        regel = koerper_regel(quelltext)
        ton, farbe = grundton(regel)
        zaehler = Bloecke()
        zaehler.feed(quelltext)
        zaehler.close()
        betrieb["zeilen"] = len(quelltext.splitlines())
        betrieb["bloecke"] = zaehler.anzahl
        betrieb["grundton"] = ton
        betrieb["farbe"] = farbe
        betrieb["schrift"] = schriftart(regel)
        betrieb["merkmale"] = [(kuerzel, name) for kuerzel, name, muster in MERKMALE
                               if re.search(muster, quelltext)]
    return betriebe


KOPF = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vorlagensammlung Rehbrunn</title>
<meta name="description" content="Dreissig einzelne Betriebsseiten als Vorlagen. Durchsehen nach Ansicht und Gruppe und Merkmal.">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f2f2f0; color: #16161a;
         font: 16px/1.65 "Inter", "Segoe UI", system-ui, sans-serif; }
  a { color: #8a2f1a; }
  .in { max-width: 1280px; margin: 0 auto; padding: 0 26px; }
  code, .fest { font-family: ui-monospace, "SF Mono", Consolas, monospace; }

  .oberband { background: #16161a; color: #d6d5d0; font-size: 13px; }
  .oberband .in { display: flex; justify-content: space-between; gap: 14px; padding: 10px 26px;
                  flex-wrap: wrap; }
  .oberband a { color: #f0a882; text-decoration: none; }

  header { border-bottom: 2px solid #16161a; background: #fbfbf9; }
  header .in { padding: 40px 26px 30px; display: grid; grid-template-columns: 1fr auto; gap: 26px;
               align-items: end; }
  @media (max-width: 820px) { header .in { grid-template-columns: 1fr; } }
  .zeile { margin: 0; font-size: 12px; letter-spacing: .3em; text-transform: uppercase; color: #8a2f1a; }
  h1 { margin: 10px 0 12px; font-size: clamp(34px, 7vw, 62px); line-height: 1; letter-spacing: -.035em; }
  header p { margin: 0; max-width: 60ch; font-size: 18px; color: #4a4a48; }
  .kennzahlen { display: flex; gap: 26px; flex-wrap: wrap; font-size: 13px; color: #6b6b68;
                letter-spacing: .06em; text-transform: uppercase; }
  .kennzahlen b { display: block; font-size: 28px; letter-spacing: -.02em; color: #16161a;
                  text-transform: none; }

  .werkzeuge { position: sticky; top: 0; z-index: 20; background: rgba(242,242,240,.96);
               backdrop-filter: blur(8px); border-bottom: 1px solid #d8d8d4; }
  .werkzeuge .in { padding: 14px 26px; display: grid; gap: 12px; }
  .reihe { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .reihe > .schild { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: #6b6b68;
                     min-width: 96px; }
  input[type="search"] { flex: 1 1 240px; min-width: 180px; padding: 10px 13px; font: inherit;
                         border: 2px solid #16161a; background: #fff; border-radius: 0; }
  input[type="search"]:focus-visible { outline: 3px solid #8a2f1a; outline-offset: 2px; }
  select { padding: 9px 12px; font: inherit; border: 1px solid #b9b9b4; background: #fff; }
  button { font: inherit; cursor: pointer; }
  .knopf { padding: 8px 14px; border: 1px solid #b9b9b4; background: #fff; color: #33332f; font-size: 14px; }
  .knopf[aria-pressed="true"] { background: #16161a; border-color: #16161a; color: #fff; }
  .marke { padding: 7px 13px; border: 1px solid #cfcfc9; background: #fff; border-radius: 999px;
           font-size: 13px; color: #4a4a46; }
  .marke[aria-pressed="true"] { background: #8a2f1a; border-color: #8a2f1a; color: #fff; }
  .zuruecksetzen { border: 0; background: none; color: #8a2f1a; text-decoration: underline; font-size: 14px; }

  .ergebnis { padding: 22px 26px 60px; max-width: 1280px; margin: 0 auto; }
  .treffer { margin: 0 0 16px; font-size: 14px; color: #6b6b68; }
  .kopfzeile { display: none; }

  #sammlung { display: grid; gap: 16px; }
  #sammlung.ansicht-kacheln { grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
  #sammlung.ansicht-liste, #sammlung.ansicht-tabelle { grid-template-columns: 1fr; gap: 0; }

  .karte { display: block; background: #fff; border: 1px solid #dedeD8; text-decoration: none;
           color: inherit; overflow: hidden; }
  .karte:hover { border-color: #16161a; }
  .karte:focus-visible { outline: 3px solid #8a2f1a; outline-offset: -3px; }
  .karte .bild { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10;
                 object-fit: cover; object-position: top; background: #ecece8;
                 border-bottom: 1px solid #e6e6e0; }
  .karte .streifen { height: 4px; }
  .karte .leib { padding: 14px 16px 16px; }
  .karte .name { display: block; font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
  .karte .gewerk { display: block; font-size: 13px; letter-spacing: .1em; text-transform: uppercase;
                   color: #8a2f1a; margin-top: 3px; }
  .karte .zahlen { display: block; margin-top: 10px; font-size: 12px; color: #6b6b68; }
  /* Diese Zellen gehoeren allein in die Tabellenansicht. */
  .karte .bereichzelle, .karte .zahl { display: none; }
  .karte .muster { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .karte .muster span { font-size: 11px; letter-spacing: .04em; border: 1px solid #e0e0da;
                        background: #f7f7f4; padding: 3px 8px; color: #4a4a46; }

  /* Ansicht Liste */
  .ansicht-liste .karte { display: grid; grid-template-columns: 132px 1fr; gap: 16px;
                          border-left: 0; border-right: 0; border-top: 0; }
  .ansicht-liste .karte .bild { aspect-ratio: 4 / 3; height: 100%; min-height: 100%;
                                object-position: top left; }
  .ansicht-liste .karte .streifen { display: none; }
  .ansicht-liste .karte .leib { padding: 14px 4px 14px 0; }
  .ansicht-liste .karte .muster { margin-top: 8px; }
  @media (max-width: 620px) { .ansicht-liste .karte { grid-template-columns: 88px 1fr; } }

  /* Ansicht Tabelle */
  .ansicht-tabelle .karte { display: grid;
        grid-template-columns: minmax(190px, 1.4fr) 1fr 1fr minmax(150px, 1.2fr) 74px 74px;
        gap: 14px; align-items: baseline; padding: 11px 12px; border: 0; border-bottom: 1px solid #e2e2dc; }
  .ansicht-tabelle .karte .bild, .ansicht-tabelle .karte .streifen { display: none; }
  .ansicht-tabelle .karte .leib { display: contents; }
  .ansicht-tabelle .karte .name { font-size: 15px; }
  .ansicht-tabelle .karte .gewerk { margin: 0; font-size: 12px; text-transform: none; letter-spacing: 0;
                                    color: #4a4a46; }
  .ansicht-tabelle .karte .bereichzelle { display: block; font-size: 13px; color: #4a4a46; }
  .ansicht-tabelle .karte .zahlen { display: none; }
  .ansicht-tabelle .karte .muster { margin: 0; }
  .ansicht-tabelle .karte .zahl { display: block; font-size: 13px; text-align: right;
                                  color: #4a4a46; font-variant-numeric: tabular-nums; }
  .kopfzeile { grid-template-columns: minmax(190px, 1.4fr) 1fr 1fr minmax(150px, 1.2fr) 74px 74px;
               gap: 14px; padding: 0 12px 8px; font-size: 11px; letter-spacing: .14em;
               text-transform: uppercase; color: #6b6b68; border-bottom: 2px solid #16161a;
               margin-bottom: 6px; }
  .kopfzeile span:nth-child(5), .kopfzeile span:nth-child(6) { text-align: right; }
  @media (max-width: 900px) {
    .ansicht-tabelle .karte { grid-template-columns: 1fr 1fr; }
    .kopfzeile { display: none !important; }
  }

  .gruppe { margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #16161a;
            font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #16161a; }
  .gruppe:first-child { margin-top: 0; }
  .gruppe b { color: #8a2f1a; }
  .leer { padding: 40px 0; color: #6b6b68; }

  .fussnote { border-top: 2px solid #16161a; background: #fbfbf9; }
  .fussnote .in { padding: 30px 26px; display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 26px; }
  .fussnote h2 { margin: 0 0 8px; font-size: 12px; letter-spacing: .2em; text-transform: uppercase;
                 color: #8a2f1a; }
  .fussnote p { margin: 0; font-size: 15px; color: #4a4a48; }
  .abschluss { font-size: 13px; color: #7a7a76; }
  .abschluss .in { padding: 16px 26px 44px; }
</style>
</head>
<body>
<div class="oberband"><div class="in">
  <span>Vorlagen zum Durchsehen &middot; jede Seite tr&auml;gt ihr eigenes Stilblatt</span>
  <a href="bildvarianten.html">Bilder einbauen &rarr;</a>
</div></div>

<header>
  <div class="in">
    <div>
      <p class="zeile">Vorlagensammlung</p>
      <h1>Rehbrunn</h1>
      <p>Dreissig einzelne Seiten. Keine teilt sich ein Stilblatt mit einer anderen. Diese Seite
      ist zugleich das Gewerbeverzeichnis des Ortes und der Weg durch die Vorlagen.</p>
    </div>
    <div class="kennzahlen">
      <div><b>{{ANZAHL}}</b>Vorlagen</div>
      <div><b>{{MUSTERZAHL}}</b>Muster</div>
      <div><b>{{ZEILEN}}</b>Zeilen</div>
    </div>
  </div>
</header>

<div class="werkzeuge">
  <div class="in">
    <div class="reihe">
      <span class="schild">Suche</span>
      <input id="suche" type="search" placeholder="Name oder Gewerk oder Muster" aria-label="Vorlagen durchsuchen">
      <button class="zuruecksetzen" id="zurueck" type="button">Alles zur&uuml;cksetzen</button>
    </div>
    <div class="reihe">
      <span class="schild">Ansicht</span>
      <button class="knopf" data-ansicht="kacheln" aria-pressed="true">Kacheln</button>
      <button class="knopf" data-ansicht="liste" aria-pressed="false">Liste</button>
      <button class="knopf" data-ansicht="tabelle" aria-pressed="false">Tabelle</button>
      <span class="schild" style="margin-left:14px">Gruppe</span>
      <select id="gruppe" aria-label="Gruppierung">
        <option value="keine">ohne Gruppen</option>
        <option value="bereich">nach Bereich</option>
        <option value="muster">nach Navigationsmuster</option>
        <option value="grundton">nach Grundton</option>
        <option value="schrift">nach Schrift</option>
      </select>
      <span class="schild" style="margin-left:14px">Reihenfolge</span>
      <select id="sortierung" aria-label="Sortierung">
        <option value="name">Name von A bis Z</option>
        <option value="zeilen-ab">l&auml;ngste Seite zuerst</option>
        <option value="zeilen-auf">k&uuml;rzeste Seite zuerst</option>
        <option value="bloecke-ab">meiste Bildpl&auml;tze zuerst</option>
      </select>
    </div>
    <div class="reihe">
      <span class="schild">Merkmale</span>
      {{MARKEN}}
    </div>
  </div>
</div>

<main class="ergebnis">
  <p class="treffer" id="treffer">Alle {{ANZAHL}} Vorlagen werden angezeigt.</p>
  <div class="kopfzeile" id="kopfzeile" aria-hidden="true">
    <span>Vorlage</span><span>Gewerk</span><span>Bereich</span><span>Muster</span>
    <span>Zeilen</span><span>Pl&auml;tze</span>
  </div>
  <div id="sammlung" class="ansicht-kacheln">
{{KARTEN}}
  </div>
  <p class="leer" id="leer" hidden>Keine Vorlage passt zu dieser Auswahl.</p>
</main>

<div class="fussnote">
  <div class="in">
    <div>
      <h2>Was hier liegt</h2>
      <p>Jede Vorlage ist eine vollst&auml;ndige Seite f&uuml;r einen erfundenen Betrieb. Rehbrunn
      ist kein realer Ort.</p>
    </div>
    <div>
      <h2>Vorschau</h2>
      <p>Jede Kachel zeigt eine echte Bildschirmaufnahme der Seite. Neu aufgenommen wird mit
      <code>python3 assets/aufnahmen.py</code>.</p>
    </div>
    <div>
      <h2>Bilder</h2>
      <p>Wie Abbildungen hineinkommen zeigt
      <a href="bildvarianten.html">bildvarianten.html</a> an vier Wegen.</p>
    </div>
    <div>
      <h2>Liste</h2>
      <p>Die schlichte Aufz&auml;hlung aller Namen steht in
      <a href="betriebe.md">betriebe.md</a>.</p>
    </div>
    <div>
      <h2>Neu bauen</h2>
      <p>Diese Seite entsteht aus den Vorlagen selbst. Der Aufruf lautet
      <code>python3 assets/vorlagen.py</code>.</p>
    </div>
  </div>
</div>

<div class="abschluss"><div class="in">Kein Aufbauschritt und keine Abh&auml;ngigkeit. Ohne JavaScript bleibt die Kachelansicht.</div></div>

<script>
const sammlung = document.getElementById('sammlung');
const karten = [...sammlung.children];
const treffer = document.getElementById('treffer');
const leer = document.getElementById('leer');
const kopfzeile = document.getElementById('kopfzeile');
const suche = document.getElementById('suche');
const gruppeWahl = document.getElementById('gruppe');
const sortWahl = document.getElementById('sortierung');
const ansichtKnoepfe = [...document.querySelectorAll('[data-ansicht]')];
const merkmalKnoepfe = [...document.querySelectorAll('[data-merkmal]')];

const NAMEN = {{NAMEN}};
let ansicht = 'kacheln';
let merkmale = new Set();

function passend() {
  const wort = suche.value.trim().toLowerCase();
  return karten.filter(karte => {
    if (wort && !karte.dataset.suche.includes(wort)) return false;
    for (const m of merkmale) {
      if (!karte.dataset.merkmale.split(' ').includes(m)) return false;
    }
    return true;
  });
}

function sortieren(liste) {
  const art = sortWahl.value;
  const kopie = [...liste];
  if (art === 'name') kopie.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name, 'de'));
  if (art === 'zeilen-ab') kopie.sort((a, b) => b.dataset.zeilen - a.dataset.zeilen);
  if (art === 'zeilen-auf') kopie.sort((a, b) => a.dataset.zeilen - b.dataset.zeilen);
  if (art === 'bloecke-ab') kopie.sort((a, b) => b.dataset.bloecke - a.dataset.bloecke);
  return kopie;
}

function gruppenSchluessel(karte, art) {
  if (art === 'bereich') return [karte.dataset.bereich];
  if (art === 'grundton') return [NAMEN[karte.dataset.grundton]];
  if (art === 'schrift') return [NAMEN[karte.dataset.schrift]];
  if (art === 'muster') return karte.dataset.merkmale.split(' ').filter(Boolean).map(m => NAMEN[m] || m);
  return ['alle'];
}

function zeichnen() {
  const gefiltert = sortieren(passend());
  sammlung.replaceChildren();
  const art = gruppeWahl.value;

  if (art === 'keine') {
    for (const karte of gefiltert) sammlung.append(karte);
  } else {
    const gruppen = new Map();
    for (const karte of gefiltert) {
      for (const schluessel of gruppenSchluessel(karte, art)) {
        if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
        gruppen.get(schluessel).push(karte);
      }
    }
    for (const schluessel of [...gruppen.keys()].sort((a, b) => a.localeCompare(b, 'de'))) {
      const kopf = document.createElement('p');
      kopf.className = 'gruppe';
      kopf.innerHTML = schluessel + ' <b>' + gruppen.get(schluessel).length + '</b>';
      kopf.style.gridColumn = '1 / -1';
      sammlung.append(kopf);
      for (const karte of gruppen.get(schluessel)) {
        sammlung.append(art === 'muster' ? karte.cloneNode(true) : karte);
      }
    }
  }

  leer.hidden = gefiltert.length > 0;
  kopfzeile.style.display = (ansicht === 'tabelle' && art === 'keine') ? 'grid' : 'none';
  treffer.textContent = gefiltert.length === karten.length
    ? `Alle ${karten.length} Vorlagen werden angezeigt.`
    : `${gefiltert.length} von ${karten.length} Vorlagen passen zur Auswahl.`;
}

suche.addEventListener('input', zeichnen);
gruppeWahl.addEventListener('change', zeichnen);
sortWahl.addEventListener('change', zeichnen);

for (const knopf of ansichtKnoepfe) {
  knopf.addEventListener('click', () => {
    ansicht = knopf.dataset.ansicht;
    for (const anderer of ansichtKnoepfe) anderer.setAttribute('aria-pressed', String(anderer === knopf));
    sammlung.className = 'ansicht-' + ansicht;
    zeichnen();
  });
}

for (const knopf of merkmalKnoepfe) {
  knopf.addEventListener('click', () => {
    const m = knopf.dataset.merkmal;
    if (merkmale.has(m)) merkmale.delete(m); else merkmale.add(m);
    knopf.setAttribute('aria-pressed', String(merkmale.has(m)));
    zeichnen();
  });
}

document.getElementById('zurueck').addEventListener('click', () => {
  suche.value = '';
  merkmale.clear();
  for (const knopf of merkmalKnoepfe) knopf.setAttribute('aria-pressed', 'false');
  gruppeWahl.value = 'keine';
  sortWahl.value = 'name';
  zeichnen();
});

zeichnen();
</script>
</body>
</html>
"""


def vorschau(slug):
    """Liefert Pfad und Groesse des Vorschaubildes."""
    aufnahme = ORT / "assets" / "aufnahmen" / f"{slug}.jpg"
    ersatz = ORT / "assets" / "bilder" / f"{slug}-hero.jpg"
    datei = aufnahme if aufnahme.exists() else ersatz
    with Image.open(datei) as bild:
        breite, hoehe = bild.size
    return datei.relative_to(ORT).as_posix(), breite, hoehe


def karte_bauen(betrieb, sofort=False):
    pfad, breite, hoehe = vorschau(betrieb["slug"])
    laden = "eager" if sofort else "lazy"
    marken = "".join(f'<span>{name}</span>' for _, name in betrieb["merkmale"])
    suchwort = " ".join([betrieb["name"], betrieb["gewerk"], betrieb["bereich"],
                         betrieb["strasse"]] + [name for _, name in betrieb["merkmale"]]).lower()
    kuerzel = " ".join(k for k, _ in betrieb["merkmale"])
    return f'''    <a class="karte" href="{betrieb['slug']}/index.html"
       data-name="{betrieb['name']}" data-bereich="{betrieb['bereich']}"
       data-grundton="{betrieb['grundton']}" data-schrift="{betrieb['schrift']}"
       data-merkmale="{kuerzel}" data-zeilen="{betrieb['zeilen']}" data-bloecke="{betrieb['bloecke']}"
       data-suche="{suchwort}">
      <span class="streifen" style="background:{betrieb['farbe']}"></span>
      <img class="bild" src="{pfad}" width="{breite}" height="{hoehe}"
           loading="{laden}" decoding="async" alt="">
      <span class="leib">
        <span class="name">{betrieb['name']}</span>
        <span class="gewerk">{betrieb['gewerk']}</span>
        <span class="bereichzelle">{betrieb['bereich']}</span>
        <span class="muster">{marken}</span>
        <span class="zahl">{betrieb['zeilen']}</span>
        <span class="zahl">{betrieb['bloecke']}</span>
        <span class="zahlen">{betrieb['zeilen']} Zeilen &middot; {betrieb['bloecke']} Bildpl&auml;tze &middot; {TONNAME[betrieb['grundton']]} &middot; {SCHRIFTNAME[betrieb['schrift']]}</span>
      </span>
    </a>'''


def main():
    betriebe = sammeln()
    betriebe.sort(key=lambda b: b["name"])
    vorhandene = {kuerzel: name for b in betriebe for kuerzel, name in b["merkmale"]}
    marken = "\n      ".join(
        f'<button class="marke" data-merkmal="{kuerzel}" aria-pressed="false">{name}</button>'
        for kuerzel, name in sorted(vorhandene.items(), key=lambda p: p[1]))
    namen = {**vorhandene, **{k: v for k, v in TONNAME.items()}, **SCHRIFTNAME}
    seite = (KOPF
             .replace("{{ANZAHL}}", str(len(betriebe)))
             .replace("{{MUSTERZAHL}}", str(len(vorhandene)))
             .replace("{{ZEILEN}}", str(sum(b["zeilen"] for b in betriebe)))
             .replace("{{MARKEN}}", marken)
             .replace("{{KARTEN}}", "\n".join(karte_bauen(b, i < 8)
                                              for i, b in enumerate(betriebe)))
             .replace("{{NAMEN}}", json.dumps(namen, ensure_ascii=False)))
    (ORT / "index.html").write_text(seite, encoding="utf-8")
    print(f"index.html neu gebaut mit {len(betriebe)} Vorlagen und {len(vorhandene)} Mustern")


if __name__ == "__main__":
    main()
