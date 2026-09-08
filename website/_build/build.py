# -*- coding: utf-8 -*-
"""Render the three designs from the one content module.

Run it from anywhere. Output goes to website/<design>/ next to this folder.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import design_klar, design_ruhe, design_praxis  # noqa: E402
from util import write  # noqa: E402

DESIGNS = [design_klar, design_ruhe, design_praxis]

PORTS = {"klar": 8081, "ruhe": 8082, "praxis": 8083}

NOTES = {
    "klar": ["Beschwerdefinder statt Menübaum", "Porträt und Zulassung im ersten Bild",
             "Inhaltsverzeichnis folgt dem Leser", "Serifen für Überschriften"],
    "ruhe": ["Ganzseitige Fotografie", "Wortmarke statt JPEG-Logo", "Einblenden beim Scrollen",
             "Lesefortschritt auf Unterseiten"],
    "praxis": ["Terminpanel im ersten Bild", "Alle 20 Behandlungen durchsuchbar",
               "Helle und dunkle Ansicht", "Anrufleiste am unteren Rand auf dem Telefon"],
}

CHOOSER_CSS = """
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#0E1618;color:#E9EFEF;
  font:400 16px/1.6 "Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#63C3CE}
.wrap{width:min(1100px,calc(100% - 44px));margin:0 auto;padding:76px 0 70px}
h1{font-size:clamp(30px,4.4vw,46px);margin:0 0 14px;letter-spacing:-.028em;font-weight:600}
.lede{color:#93A5A8;margin:0 0 12px;max-width:64ch}
.meta{color:#63757A;font-size:14px;margin:0 0 50px}
.g{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.c{background:#152124;border:1px solid #223236;border-radius:16px;padding:28px 28px 30px;
  display:flex;flex-direction:column}
.n{font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;
  text-transform:uppercase;color:#63C3CE;margin:0 0 14px}
h2{font-size:24px;margin:0 0 10px;font-weight:600}
.c>p{color:#93A5A8;margin:0 0 20px;font-size:15px}
ul{list-style:none;margin:0 0 26px;padding:0;display:grid;gap:9px}
li{position:relative;padding-left:19px;font-size:14px;color:#B7C5C7}
li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:#3E8A93}
.act{margin-top:auto;display:flex;gap:9px;flex-wrap:wrap}
.b{display:inline-flex;align-items:center;border-radius:9px;padding:11px 17px;
  font:600 14px/1 inherit;text-decoration:none;border:1px solid transparent}
.b1{background:#3E8A93;color:#07171A}
.b1:hover{background:#63C3CE}
.b2{border-color:#2A3B3F;color:#B7C5C7}
.b2:hover{border-color:#3E8A93;color:#63C3CE}
.port{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;color:#63757A;margin-top:16px}
footer{margin-top:56px;padding-top:26px;border-top:1px solid #1E2C2F;color:#63757A;font-size:14px}
@media(max-width:880px){.g{grid-template-columns:1fr}}
"""


def chooser():
    cards = []
    for i, d in enumerate(DESIGNS, 1):
        notes = "".join("<li>%s</li>" % n for n in NOTES[d.NAME])
        cards.append('<article class="c"><p class="n">Entwurf %d</p><h2>%s</h2><p>%s</p>'
                     '<ul>%s</ul><div class="act">'
                     '<a class="b b1" href="%s/index.html">Öffnen</a>'
                     '<a class="b b2" href="%s/therapien.html">Therapien</a>'
                     '<a class="b b2" href="%s/kontakt.html">Kontakt</a></div>'
                     '<p class="port">Eigener Port %d</p></article>'
                     % (i, d.TITLE, d.TAGLINE, notes, d.NAME, d.NAME, d.NAME, PORTS[d.NAME]))
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Sanare Naturalis · drei Entwürfe</title>'
            '<link rel="preconnect" href="https://fonts.googleapis.com">'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600'
            '&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">'
            '<style>%s</style></head><body><div class="wrap">'
            '<h1>Sanare Naturalis · drei Entwürfe</h1>'
            '<p class="lede">Derselbe Inhalt in drei Gestaltungen. Jeder Entwurf umfasst alle zehn '
            'Seiten der bestehenden Website.</p>'
            '<p class="meta">Inhalt und Fotografie stammen von www.sanare-naturalis.de.</p>'
            '<div class="g">%s</div>'
            '<footer>Erzeugt aus website/_build/build.py.</footer>'
            '</div></body></html>') % (CHOOSER_CSS.strip(), "".join(cards))


def main():
    total = 0
    for d in DESIGNS:
        out = os.path.join(ROOT, d.NAME)
        n = d.build(out)
        total += n
        print("%-8s %2d Seiten -> %s" % (d.NAME, n, out))
    write(ROOT, "index.html", chooser())
    print("chooser  -> %s" % os.path.join(ROOT, "index.html"))
    print("%d Seiten insgesamt" % total)


if __name__ == "__main__":
    main()
