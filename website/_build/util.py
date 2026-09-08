# -*- coding: utf-8 -*-
"""Helpers shared by the three designs."""
import html
import os
import re

def esc(s):
    return html.escape(str(s), quote=True)

def slugify(s):
    s = s.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def write(outdir, name, text):
    path = os.path.join(outdir, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path

def img(name):
    """Path from a design page to a shared photograph."""
    return "../assets/img/" + name

def phone_href(p):
    return "tel:" + p

def alt_for(name):
    """Alt text for a photograph. The live site ships the file name as alt."""
    return ALT.get(name, "Naturheilpraxis Sanare Naturalis")

ALT = {
    "sanare-naturalis.jpg": "Logo der Naturheilpraxis Sanare Naturalis",
    "_v6a4005-2.jpg": "Rafia Willemsen, Heilpraktikerin",
    "_v6a3234-2.jpg": "Behandlung der Beinachse auf der Liege",
    "_v6a2931neu-cropped.jpg": "Blick in die Praxisräume",
    "_v6a2940neu-cropped.jpg": "Behandlungsliege mit Decke und Kräuterbällen",
    "_v6a2960neu-cropped.jpg": "Kräuterstempel, Duftlampe und Lavendel",
    "haende-schoko-cropped.jpg": "Hände bei einer Ölmassage des Rückens",
    "_v6a3192neuausschnitt.jpg": "Behandlung der Halswirbelsäule",
    "_v6a3221.jpg": "Untersuchung der Schulter im Stehen",
    "_v6a3176.jpg": "Honigmassage mit warmem Tuch",
    "_v6a3165neu.jpg": "Massage der Rückenmuskulatur",
    "_v6a3118neu.jpg": "Öl läuft aus der Hand auf den Rücken",
    "_v6a3055ausschnitt.jpg": "Massage mit zwei Kräuterstempeln",
    "_v6a3067.jpg": "Schokoladenmassage des Rückens",
    "_v6a3000.jpg": "Wirbelsäulenmodell im Beratungsgespräch",
    "_v6a2990.jpg": "Erklärung am Wirbelsäulenmodell",
    "_v6a2950neu.jpg": "Basaltsteine für die Hot Stone-Massage",
    "_v6a2929ausschnitt.jpg": "Akupunkturtafel in den Praxisräumen",
    "_v6a3184neuausschnitt.jpg": "Sanfte Behandlung im Gesicht- und Halsbereich",
    "fotolia_50789499_xs.jpg": "Vergleich von normaler Haut und Cellulite",
    "fotolia_60752692_xs1.jpg": "Fußmassage bei Kerzenschein",
    "fotolia_64959443_xs1.jpg": "Kapseln mit Mikronährstoffen",
    "fotolia_76203397_xs.jpg": "Schema von junger und älterer Haut mit Hyaluronsäure",
    "fotolia_83007699_xs1.jpg": "Schröpfgläser auf dem Rücken",
    "fotolia_103883308_xs1.jpg": "Obst, Gemüse und Hanteln",
    "fotolia_105505101_xs.jpg": "Tablettenbox für morgens, mittags, abends und nachts",
}
