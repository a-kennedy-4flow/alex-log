# -*- coding: utf-8 -*-
"""Every word of the live site held once.

The German copy is verbatim from www.sanare-naturalis.de. Errors in the
original are kept. README.md lists them.
"""

PRACTICE = {
    "name": "Sanare Naturalis",
    "legal_name": "Naturheilpraxis sanare naturalis",
    "strapline": "Naturheilpraxis",
    "sub": "amerikanische Chiropraktik",
    "practitioner": "Rafia Willemsen",
    "role": "Heilpraktikerin",
    "street": "Uerdingerstr. 573",
    "postcode": "47800",
    "city": "Krefeld",
    "phone": "0173/8626293",
    "phone_link": "+491738626293",
    "web": "www.sanare-naturalis.de",
    "licensed": "Zulassung seit dem 16.06.2016",
    "association": "Mitglied im BDH",
}

NAV = [
    ("index", "Home", []),
    ("therapien", "Therapien", [
        ("manuelle-therapien", "Manuelle Therapien"),
        ("infusionstherapien", "Infusionstherapien"),
        ("faszien-therapie", "Faszien Therapie"),
    ]),
    ("wellness-massagen", "Wellness-Massagen", []),
    ("aesthetische-medizin", "Ästhetische Medizin", []),
    ("aktuelles", "Aktuelles", []),
    ("kontakt", "Kontakt", []),
]

HOME = {
    "heading": "Herzlich willkommen auf meiner Website, ich freue mich über ihr Interesse!",
    "paras": [
        "Mein Anliegen als Heilpraktikerin ist es, mit Ihnen gemeinsam einen Weg zu gehen, der zur Erhaltung Ihrer Gesundheit führt. Ich behandle also nicht die Symptome oder die Krankheit, sondern Menschen, deren Körper aus welchen Gründen auch immer Krankheitsträger geworden sind.",
        "Um diese Ursachen herauszufinden und zu behandeln, stehen in meiner Praxis unterschiedliche Diagnoseverfahren und Therapien zur Verfügung. Welche Therapieform in jedem Einzelfall die richtige und dem Individuum entsprechende Behandlung darstellt werden wir in den ersten Terminen festlegen. Hierbei ist zu beachten, daß bei gleicher Symptomatik zweier Patienten durchaus zwei verschiedenen Therapien Anwendung finden, wenn die Ursache des Problems eine andere ist.",
        "Ich lege besonderen Wert darauf, Sie als Individuum zu betrachten und zu behandeln.",
    ],
}

ABOUT = {
    "heading": "Über mich",
    "name": "Rafia Willemsen",
    "line": "Jahrgang 1972, verheiratet, 4 Kinder",
    "cv": [
        ("", "4-jährige Ausbildung zur Heilpraktikerin in Villa Salutis, Krefeld"),
        ("2013", "Weiterbildung Urinfunktionsdiagnostik, ISO, Köln"),
        ("2014", "Weiterbildung in Urinfunktionsdiagnostik und Spagyrik nach Kraus, Hessischer Naturheilverband, Hochheim"),
        ("2015", "Ausbildung zur Wellness-Therapeutin, Villa Salutis, Krefeld"),
        ("2015", "Ausbildung in manueller Therapie, Heilpraktikerschule Gorny, Oberhausen"),
        ("2016", "Weiterbildung Wirbelsäulenmeridianbalance, Terra-Medica, Köln"),
        ("2016", "Fachfortbildung Kinesiotaping, Heilpraktikerschule Gorny, Oberhausen"),
        ("2016", "Fachfortbildung Ästhetische Medizin, Villa Salutis, Krefeld"),
        ("", "Qualitätszirkel mit Kolleginnen zum stetigen Austausch und Weiterbildung"),
        ("", "Mitglied im BDH"),
    ],
}

QUOTE = {
    "latin": "medicus curat, natura sanat",
    "source": "Hippokrates",
    "gloss": "Der Arzt behandelt, die Natur heilt (lat), wusste schon im Altertum der griechische Arzt Hippokrates. In diesem Sinne sollen in meiner Naturheilpraxis die Selbstheilungskräfte des Körpers aktiviert werden. Dazu stelle ich Ihnen im folgenden verschiedene Therapieformen vor.",
}

# A section is one treatment. "img" names a file in ../assets/img.
# "tags" drives the symptom finder in Klar and the search in Praxis.
PAGES = {
    "therapien": {
        "title": "Therapien",
        "lede": "Übersicht der Therapieformen in meiner Naturheilpraxis.",
        "hero": "_v6a3234-2.jpg",
        "sections": [
            {
                "id": "klassische-manuelle-therapien",
                "heading": "Klassische manuelle Therapien",
                "img": "_v6a3221.jpg",
                "tags": ["Rücken", "Schulter", "Knie", "Hüfte", "Verspannung", "Überbelastung", "Arthrose"],
                "paras": [
                    "Bedingt durch den Arbeitsalltag, leiden inzwischen immer mehr Menschen unter „Rücken“, aber auch Schulter-, Knie- und Hüftprobleme nehmen zu.",
                    "Es kann aber auch durch den sogenannten Ausgleichssport oder die Bewegung in der Freizeit zu Überbelastung kommen, was zu den gleichen Symptomen führt.",
                    "Nicht zuletzt ist noch die Gruppe der durch z.B. degenerative Erkrankung oder Altersverschleiß betroffenen Personen zu berücksichtigen. Überall hier sind klassische manuelle Therapien eine Möglichkeit, ohne Einsatz von Medikamenten eine Entlastung zu unterstützen.",
                ],
                "link": ("manuelle-therapien", "Manuelle Therapien"),
            },
            {
                "id": "infusionstherapien",
                "heading": "Infusionstherapien",
                "img": "fotolia_64959443_xs1.jpg",
                "tags": ["Erschöpfung", "Immunsystem", "Nährstoffmangel", "Entgiftung"],
                "paras": [
                    "Abgeleitet vom lateinischen infundere: hineingießen wird mit Infusionstherapie eine kontinuierliche Verabreichung von Flüssigkeit direkt in die Blutbahn zu medizinischen Zwecken bezeichnet. Je nach Ursache zur Infusion bzw. medizinischem Zweck wird die Flüssigkeit mit Medikamenten, Makro- oder Mikronährstoffen angereichert. Auch ein Ausgleich des Flüssigkeitshaushaltes kann durch Infusion erreicht werden.",
                    "In der Regel erfolgt die Infusion intravenös, das heißt über Venen an den Gliedmaßen, z.B. Handrücken oder Ellenbogenbeuge. Die Infusiontherapie kann je nach Indikation langfristig oder kurzfristig angelegt sein.",
                ],
                "link": ("infusionstherapien", "Infusionstherapien"),
            },
            {
                "id": "faszien-therapie",
                "heading": "Faszien-Therapie",
                "img": "_v6a3192neuausschnitt.jpg",
                "tags": ["Faszien", "Verkrampfung", "Beweglichkeit", "Haltung"],
                "paras": [
                    "Seit einigen Jahren hat sich die Wissenschaft intensiv mit den Faszien beschäftigt. Faszien sind bindegewebige Umhüllungen von Muskeln und sorgen für geschmeidige Beweglichkeit. Sind die Faszien verhärtet, stellen sich Verkrampfungen ein, welche durch gezielte Behandlungen auflösbar sind. Neben Rolfing stellt auch die ISBT Bowen Therapie eine dieser sehr erfolgreichen Formen dar und wird von mir in meiner Praxis im Rahmen eines gesamtheitlichen Konzeptes angeboten.",
                ],
                "link": ("faszien-therapie", "ISBT Bowen Therapie"),
            },
            {
                "id": "schmerztherapien",
                "heading": "Schmerztherapien",
                "img": "fotolia_105505101_xs.jpg",
                "tags": ["Migräne", "chronischer Schmerz", "Bewegungsschmerz", "Rücken"],
                "paras": [
                    "Neben der herkömmlichen Methodik, Schmerzen mittels Medikamente zu behandeln, gibt es noch den Bereich der alternativen Schmerztherapie. Besonders chronische Schmerzpatienten scheuen die Nebenwirkungen einer Dauermedikation und suchen für sich andere Wege, um mit beispielsweise Migräne, Bewegungsschmerzen oder Rückenproblemen umzugehen.",
                ],
            },
            {
                "id": "schroepftherapie",
                "heading": "Schröpftherapie",
                "img": "fotolia_83007699_xs1.jpg",
                "tags": ["Blockaden", "Durchblutung", "Akupunktur", "Verspannung"],
                "paras": [
                    "Die Behandlung mittels Schröpfgläsern ist schon seit 3500 Jahren aus dem alten Mesopotamien bekannt. In Griechenland galten Schröpfgläser aufgrund ihrer hohen Wirkung als Symbole für die ärztliche Heilkunst. Heute wird in der Naturheilkunde das Schröpfen nach wie vor gerne praktiziert.",
                    "Beim Schröpfen werden mit Hilfe von Saugglocken durch Unterdruck bestimmte Areale des Körpers zur Selbstheilung angeregt. Zum einen können sich Blockaden direkt lösen, zum anderen kann durch die Stimmulation an Akupunktur-Punkten auf dem Rücken ein Reiz ausgelöst werden, durch den das Chi (chin: Lebensenergie) wieder fließen kann.",
                    "Eine weitere, milde Form des Schröpfens stellt die Schröpfmassage dar. Hier werden Schröpfgläser zur kräftigen Massage genutzt, welche durch den Unterdruck auch tiefe Muskelschichten erreichen und lockern kann.",
                ],
            },
        ],
    },
    "manuelle-therapien": {
        "title": "Manuelle Therapien",
        "lede": "Behandlung von Wirbelsäule und Gelenken mit den Händen.",
        "hero": "_v6a3234-2.jpg",
        "parent": ("therapien", "Therapien"),
        "sections": [
            {
                "id": "dorntherapie",
                "heading": "Dorntherapie",
                "img": "_v6a2990.jpg",
                "tags": ["Ischialgie", "Schwindel", "Kopfschmerzen", "Wirbelsäule", "Muskelverspannung"],
                "paras": [
                    "Die nach ihm benannte Dorntherapie geht zurück auf den Allgäuer Volksheiler Dieter Dorn im Jahr 1975. Er erfuhr Linderung am eigenen Körper und entwickelte daraus die sehr erfolgreiche Behandlung.",
                    "Schon geringfügig fehlstehende Wirbelkörper üben Druck auf die umliegenden Nerven und die sie versorgten Organsysteme aus. Dadurch kann es zu zahlreichen Symptomen wie Ischialgien, Schwindel, Kopfschmerzen, Empfindungsstörungen in Armen und Beinen kommen. Häufig wird vom Betroffenen auch zunächst lediglich die Muskelverspannung und die damit verbundene eingeschränkte Beweglichkeit wahrgenommen. Alle diese Beschwerden sind eine Indikation zur Anwendung der Dorntherapie.",
                    "Nach der Voruntersuchung werden sogenannte blockierte Wirbel durch den Behandler fixiert, während der Patient durch seine Eigenbewegung die Reposition des Wirbels unterstützt. Diese Methode ist sowohl für Bänder und Sehnen als auch für die Bandscheiben durch den fliessenden und sanften Vorgang gut verträglich.",
                    "Die Dorntherapie beinhaltet als manuelle Therapie auch Teile der traditionellen chinesischen Medizin (TCM). Es entsteht ein positiver Einfluß auf die inneren Organe und die Psyche.",
                ],
            },
            {
                "id": "breuss-massage",
                "heading": "Breuss-Massage",
                "img": "_v6a3165neu.jpg",
                "tags": ["Bandscheiben", "Erschöpfung", "nervöse Zustände", "Wirbelsäule"],
                "paras": [
                    "Bei der Breuss-Massage handelt es sich um eine energetisch manuelle Therapie, welche häufig in Verbindung mit der Dorntherapie angewandt wird. Die Wirbelsäule wird durch spezielle Techniken sanft gestreckt und durch den entstehenden Raum werden die Zwischenwirbelscheiben „belüftet“. Die Regeneration der Bandscheiben wird unterstützt durch das zur Massage verwendete Johanniskrautöl.",
                    "Neben der rein körperlichen Wirkung hilft die Breuss-Massage auch bei nervösen Zuständen, Erschöpfung und Anstrengung, da das Johanniskrautöl eine positive Wirkung hat.",
                    "Die Breuss-Massage unterstützt vor der Dorn-Behandlung die Lockerung der Rückenmuskulatur; nach der Dorn-Behandlung angewandt dient sie der Stabilisierung.",
                ],
            },
            {
                "id": "skribben",
                "heading": "Skribben",
                "img": "_v6a3221.jpg",
                "tags": ["Arthrose", "Schulterschmerzen", "Hüfte", "Knie", "Gelenke"],
                "paras": [
                    "Gerade beim Skribben handelt es sich um eine traditionelle manuelle Therapie, die jahrelang in Vergessenheit geraten war. Das Skribben entspricht der Tradition von mitteleuropäischen Sehnensetzern und Knochenbrechern; es ist in seiner Behandlungsform auch unter anderen Namen, z.B. sanfte Chiropraktik nach Marienhoff, zu finden.",
                    "Wieder aufgelebt und unter dem Namen Skribben erneut verbreitet wurde die Behandlung dank des sehr aktiven Arztes Dr. Klaus Karsch aus dem Allgäu. Er belebte aufgrund seines Engagements die alte Technik neu. Seitdem verfügen wir in Deutschland über eine sehr gute Alternativbehandlung bei Gelenksbeschwerden wie z.B. Arthrose, Schulterschmerzen, Hüft- und Knieprobleme, um nur einige zu nennen.",
                ],
            },
            {
                "id": "wirbelsaeulen-meridian-balance",
                "heading": "Wirbelsäulen-Meridian-Balance",
                "img": "_v6a3000.jpg",
                "tags": ["wiederkehrende Beschwerden", "Akupressur", "Tai Chi", "Chi"],
                "paras": [
                    "Auslöser für immer wiederkehrende Beschwerden können im Ist-Zustand des Individuums liegen. Damit ist eine Kombination aus körperlichem und seelisch-geistigem Befinden gemeint. Hier greift die Wirbelsäulen-Meridian-Balance als ausgleichende Therapie ein.",
                    "Gegründet ist die Therapieform auf den Erkenntnissen des berühmtesten chinesischen Arztes Hua Tuo (ca. 180-250 n.Chr.) und der nach ihm benannten Akupunktur-Punkte. In Verbindung gebracht mit modernen Beschwerden kann die Wirbelsäulen-Meridian-Balance durch Stimulation des betroffenen Hua Tuo-Punktes begleitet durcht fördernden Bewegungen auch wiederkehrende Symptome behandeln.",
                    "In der Wirbelsäulen-Meridian-Balance wird ein Ausgleich der körperlichen Beschwerden durch Akupressur und, durch die dem Tai Chi entlehnten Bewegungen, eine ganzheitliche Gesundung durch das wieder fließende Chi (chin. Lebensenergie) angestrebt.",
                ],
            },
        ],
    },
}

PAGES["infusionstherapien"] = {
    "title": "Infusionstherapien",
    "lede": "Nährstoffe direkt über die Blutbahn.",
    "hero": "_v6a2960neu-cropped.jpg",
    "parent": ("therapien", "Therapien"),
    "sections": [
        {
            "id": "vitamin-c-hochdosisinfusion",
            "heading": "Vitamin C-Hochdosisinfusion",
            "img": "fotolia_64959443_xs1.jpg",
            "tags": ["Immunsystem", "Entgiftung", "Bindegewebe", "Wundheilung", "Eisen"],
            "paras": [
                "Vitamin C (Ascorbinsäure) wird im Körper bei sehr vielen Prozessen benötigt. Als Antioxidationsmittel sorgt es im Blut, im Gehirn, in Körperzellen und sogar im Zellkern dafür, dass freie Radikale gefangen und eliminiert werden. Desweiteren dient Vitamin C als Gefäßschutz, es hält das Blut dünnflüssiger und verhindert die Ablagerung von z.B. Cholesterin. Dadurch wirkt es vorbeugend bei allen mit Arteriosklerose verbundenen Krankheiten wie Angina Pectoris, Bluthochdruck oder Schlaganfall. Auch das Bindegewebe wird durch das Verschweißen von Eiweißen und anderen Substanzen zu Kollagenfasern durch Vitamin C gestärkt. Kollagenfasern sorgen zum einen für die Elastizität von Haut, Bändern und Sehnen und zum anderen für die Wundheilung.",
                "In der Milz und in den Darmwänden wird Eisen gelagert, welches durch Vitamin C in die Blutbahn gebracht wird und dort zum Sauerstofftransport und zur Stärkung des Immunsystems zur Verfügung gestellt werden kann. Auch die Entgiftungsleistung der Leber wird durch Stimulation der Leberenzyme mit Vitamin C deutlich gesteigert. Dadurch werden Gifte wie Nikotin, Nitrosamine und Formaldehyd schneller und effektiver entsorgt.",
                "Nicht zuletzt sorgt Vitamin C für die Regulation der Hormonausschüttung, weshalb es bei Schildrüsenerkrankungen, aber auch bei Wachstumsstörungen oder vermehrten Stresshormonen beteiligt ist.",
                "Leider hat der menschliche Organismus im Laufe der Evolution die Fähigkeit zur Herstellung von Vitamin C verloren. Deshalb muss Vitamin C über die Nahrung zugeführt werden. Die besten Quellen dafür stellen frisches Obst und Gemüse dar, welche auch für den niedrig angesetzten täglichen Bedarf von 100 mg zur Versorgung ausreichen. Sollten jedoch eines oder auch mehrere der oben genannten Symptome auftreten, kann ein Mangel an Vitamin C vorliegen. Hier ist eine Infusion mit hochdosiertem Vitamin C sinnvoll. Die Umgehung des Magen-Darm-Traktes verhindert den Verlust von wertvollen Bestandteilen. So steht Vitamin C dem Körper direkt über das Blut zur Verfügung und kann seine mannigfache Wirkung unmittelbar entfalten.",
            ],
        },
        {
            "id": "b12-infusionen",
            "heading": "B12 Infusionen",
            "img": "_v6a2940neu-cropped.jpg",
            "tags": ["Blutarmut", "Schwangerschaft", "Vegetarier", "Veganer", "Nervensystem"],
            "paras": [
                "Vitamin B12 (Cobalamin) ist im Körper ein wichtiger Faktor zur Blutneubildung. Außerdem wird es zur Zellteilung und zum Wachstum benötigt. Daraus ergibt sich der gesteigerte Bedarf in Schwangerschaft und Stillzeit. Leider kann Vitamin B12 nicht durch den Darm direkt aufgenommen werden, es braucht dazu den im Magen gebildeten „Intrinsic factor“. Dadurch kann es zu schweren Mangelzuständen als Folge einer Magenschleimhauterkrankung kommen. Aber auch Darmerkrankungen wie Wurmbefall, Hepatitis, Antibiose über einen längeren Zeitraum sowie Alkohol- und Nikotinmissbrauch können zu einem Mangel an Vitamin B12 aufgrund der schlechten Aufnahme im Darm führen.",
                "Vitamin B12 kommt fast ausschließlich in tierischen Lebensmitteln wie Fleisch, Milch und Eiern vor. Der tägliche Bedarf von Erwachsenen liegt bei 3 Mikrogramm, welches für Vegetarier und Veganer schon schwer zu erreichen ist. Ein Mangel stellt sich häufig erst schleichend ein, da Vitamin B12 als einziges wasserlösliches Vitamin im Körper gespeichert werden kann.",
                "Nichtsdestotrotz sind die Folgen eines Mangels gravierend: Neben Zungenbrennen und nervalen Symptomen wie Gang-Unsicherheit, Lähmungen und Gefühlsstörungen kann es bis zur Blutarmut, der sogenannten perniziösen Anämie, führen.",
            ],
        },
    ],
}

PAGES["faszien-therapie"] = {
    "title": "Faszien Therapie",
    "lede": "Sanfte Impulse auf Muskeln und Faszien.",
    "hero": "_v6a3234-2.jpg",
    "parent": ("therapien", "Therapien"),
    "sections": [
        {
            "id": "isbt-bowen-therapie",
            "heading": "ISBT Bowen-Therapie",
            "img": "_v6a3184neuausschnitt.jpg",
            "tags": ["Golfarm", "Tennisarm", "Karpaltunnelsyndrom", "Migräne", "Asthma", "Kiefergelenk", "Verdauung", "Haltung"],
            "paras": [
                "Ihren Namen verdankt die ISBT-Bowen Therapie ihrem Gründer, dem Australier Thomas A. Bowen (1916-1982). Lange bevor die Wissenschaft die Bedeutung der Faszien entdeckte, fing er an, als selbstbezeichneter Osteopath diese über Punkte zu behandeln. Es handelt sich bei der Bowen-Therapie um eine sanfte manuelle Heilmethode, in der natürliche Abläufe der Muskel- und Faszienfunktion wiederhergestellt werden. Kleinste Bowen-Moves regen die betroffenen Körperbereiche an, ihren ursprünglichen Spannungszustand wieder herzustellen. Wirken die gesetzten Impulse nach, erreicht man eine Entspannung, wodurch Schmerzreize und daraus resultierende Verspannungen sich auflösen können. Es werden Dysbalancen, Haltungsschäden und Beschwerden des Bewegungsapparates (z.B. Golf- / Tennisarm oder Karpaltunnelsyndrom) behandelt.",
                "Durch das Zusammenspiel zwischen vegetativem und autonomem Nervensystem wird ein gesteigertes Wohlbefinden des Patienten erreicht, so dass neben den obigen Beschwerden auch Verdauungsprobleme, Migräne, Kiefergelenksbeschwerden und Asthma eine Indikation der Bowen-Therapie darstellen.",
            ],
        },
    ],
}

PAGES["wellness-massagen"] = {
    "title": "Wellness-Massagen",
    "lede": "Sieben Massagen für Erholung und Hautbild.",
    "hero": "haende-schoko-cropped.jpg",
    "sections": [
        {
            "id": "aromaoel-massage",
            "heading": "Aromaöl-Massage",
            "img": "_v6a3118neu.jpg",
            "tags": ["Muskelverspannung", "Entspannung", "Aromatherapie", "Auszeit"],
            "paras": [
                "Die Behandlung mit kostbaren Duftstoffen war schon vor der Antike bekannt und erfreut sich in Form der Aromaöl-Massage heute neuer Beliebtheit.",
                "Bei der Aromaöl-Massage werden die erwärmten ätherischen Öle tief in die Muskulatur einmassiert. Diese Behandlung hat einen doppelten Effekt: Durch die Massage wirken die Aromastoffe auf den Körper ein; das Einatmen der Düfte unterstützt das innere Gleichgewicht.",
                "Gemäß der Aromatherapie kann die Aromaöl-Massage je nach Duftstoff sowohl anregend als auch beruhigend wirken. Dadurch wird neben der Lösung von Muskelverspannungen auch eine mentale Auszeit erfahren.",
            ],
        },
        {
            "id": "honig-massage",
            "heading": "Honig-Massage",
            "img": "_v6a3176.jpg",
            "tags": ["Entschlackung", "Durchblutung", "Rücken", "Erkältung", "Gesicht"],
            "paras": [
                "Die Ursprünge der Honig-Massage liegen in Tibet und Russland. Die hohe Wirksamkeit des Honigs war jedoch schon im alten Ägypten bekannt, orientalische Frauen nutzten ihn bereits früh zur Schönheitspflege.",
                "Während der Honig-Massage werden Schlacken und Giftstoffe im Körper durch die stark antibakterielle und heilende Wirkung des Honigs zunächst gelöst. Durch die Zupfmassagetechniken und die sich verändernde Konsistenz des Honigs kommt es zu einer tiefen Wirkung in das Gewebe hinein. Verspannungen und Verklebungen der oberen Gewebeschichten werden gelöst, es kommt zu einer kräftig angeregten Durchblutung. Dadurch werden die gelösten Stoffe nun vermehrt abtransportiert und ausgeschleust, so dass eine ganzheitliche Reinigung erfolgt.",
                "Besonders bewährt hat sich die Honig-Massage im Bereich von Rücken und Oberschenkeln. Auch für das Gesicht ist sie sehr gut geeignet. Dort wird sie jedoch aufgrund des sehr viel feineren Hautbildes als Honig-Sahne-Massage angewandt. Auch jahreszeitlich ist die Wirkung der Honig-Massage nutzbar. Da sie auch dem Festsetzen von Bakterien in Lunge und Bronchien entgegenwirken kann, empfiehlt sie sich bei nass-kaltem Erkältungswetter sowohl präventiv als auch beschwerdelindernd.",
            ],
        },
        {
            "id": "hot-stone-massage",
            "heading": "Hot Stone-Massage",
            "img": "_v6a2950neu.jpg",
            "tags": ["Lymphfluss", "Stress", "Anspannung", "Gesicht", "Wärme"],
            "paras": [
                "Bei der Hot Stone-Massage werden sowohl im Wasserbad auf über 50 Grad erhitzte Basaltsteine als auch kühle Marmorsteine verwendet. Dadurch entsteht eine Kombination aus Ganzkörpermassage, Temperaturreizen und Energiearbeit.",
                "Die Hot Stone-Massage regt den Lymphfluss an, fördert durch die Wärme das Lösen von Muskelverspannungen und aktiviert die Selbstheilungskräfte des Körpers. Durch die Temperaturreize entsteht eine ähnliche Wirkung wie bei den bekannten Kneippschen Güssen, jedoch auf eine gemilderte Art, da die Reize punktuell gesetzt werden und nicht der gesamte Körper erhitzt oder gekühlt wird. Durch Stimulation einzelner Energiepunkte des Körpers trägt die Hot Stone-Massage zum Abbau von Stress und Anspannung bei.",
                "Des weiteren werden durch die Wärme der Steine die Poren der Haut weit geöffnet, wodurch die Inhaltstoffe des Massageöls besonders gut aufgenommen werden. Aus diesem Grund eignet sich die Hot Stone-Massage auch zur Gesichtsbehandlung: Hier werden Wirkstoffe aus Ampullen und Antifalten-Behandlungen bis in tiefe Hautschichten eingeschleust.",
            ],
        },
        {
            "id": "kraeuterstempel-massage",
            "heading": "Kräuterstempel-Massage",
            "img": "_v6a3055ausschnitt.jpg",
            "tags": ["Ayurveda", "Immunsystem", "Entgiftung", "Hautbild", "Blockaden"],
            "paras": [
                "Die Ursprünge der Kräuterstempel-Massage liegen im ost-asiatischen Raum. Besonders in ayurvedischen Behandlungen wurden sie bereits früh erwähnt.",
                "Bei der Kräuterstempel-Massage werden faustgroße Baumwollsäckchen mit Kräutern, Früchten, Gewürzen und weiteren wertvollen Inhaltsstoffen verwendet. Diese werden in warmem Öl erhitzt und dann in einer Kombination aus Wärmereizen, Akupressur und speziellen Massagetechniken eingesetzt. Je nach Wahl der Inhaltsstoffe kann die Durchblutung angeregt, Entschlackungs- und Entgiftungsprozesse beschleunigt werden, das Immunsystem gestärkt oder auch Anspannung und Stress abgemildert werden. Auch Blockaden und Verspannungen lösen sich durch die Massage mit den Kräuterstempeln. Äußerlich verbessert sich das Hautbild durch den Peeling-Effekt und die Zellregeneration wird durch die Inhaltsstoffe gefördert.",
                "Da die Wahl der Inhaltsstoffe so extrem wichtig ist, werden in meiner Praxis keine industriellen Kräuterstempel verwendet. Nach persöhnlicher Absprache und Beratung werden Ihre Kräuterstempel individuell auf Sie und Ihre Bedürfnisse hin angefertigt.",
            ],
        },
        {
            "id": "anti-cellulite-massage",
            "heading": "Anti-Cellulite-Massage",
            "img": "fotolia_50789499_xs.jpg",
            "tags": ["Cellulite", "Orangenhaut", "Bindegewebe", "Oberschenkel"],
            "paras": [
                "Cellulite ist nicht schön: Sie kann bis zur Reduktion des Selbstbewusstseins und zur Einschränkung im täglichen Leben führen. Zum Glück kann man gegen die so genannte Orangenhaut etwas tun. Es handelt sich hier um Fetteinlagerungen im Bindegewebe, die durch stete Massage, unterstützt durch Bewegung und gesunde Ernährung, reduziert werden können.",
                "Bei der Anti-Cellulite-Massage handelt es sich um eine kräftige Zupfmassage, welche zur Lösung der Fettdepots führt. Es kommt zu einer starken Rötung und dem Abtransport der gelösten Fettpartikel durch den Körper. Um eine Wirksamkeit zu zeigen, ist die Anti-Cellulite-Massage regelmässig zweimal im Monat durchzuführen. In der Regel ist bereits nach zehn Massagen eine Besserung zu sehen. Dadurch kann das Selbstbewusstsein steigen und der Umgang mit dem eigenen Körper wird wieder positiv.",
            ],
        },
        {
            "id": "fussmassage",
            "heading": "Fußmassage",
            "img": "fotolia_60752692_xs1.jpg",
            "tags": ["Füße", "Peeling", "Fußbad", "Entspannung"],
            "paras": [
                "In der heutigen Zeit sind unsere Füße enormen Belastungen ausgesetzt. Wir gehen in Schuhen über asphaltierte Wege und Strassen, was nicht den natürlichen Anforderungen unseres Körpers entspricht. Deshalb dient die Fußmassage nicht nur dem Wohlbefinden, sondern auch der verdienten Pflege und Zuwendung unserer Füße.",
                "Bei der Fußmassage werden die Füße zunächst in einem wohltuenden und pflegenden Fußbad gereinigt, danach erfolgt ein mildes Peeling. Erst im Anschluss daran erfolgt die eigentliche Massage, bei der Sie sich komplett entspannen können.",
            ],
        },
        {
            "id": "fussreflexzonen-massage",
            "heading": "Fußreflexzonen-Massage",
            "img": "_v6a2929ausschnitt.jpg",
            "tags": ["Reflexzonen", "Organe", "TCM", "Symptome lindern"],
            "paras": [
                "Die Fußreflexzonen-Massage ist eine Besonderheit unter den Fußmassagen. Gemäß der chinesischen und anderen asiatischen Medizinformen wurde schon von altersher der Zusammenhang zwischen jedem einzelnen Körperteil / Organ und dem dazugehörenden Reflexpunkt am Fuß erkannt. Hier ist es nun möglich, entweder stimulierend oder beruhigend nur über die Füße den Menschen zu behandeln und die Symptome des Patienten zu lindern.",
            ],
        },
    ],
}

PAGES["aesthetische-medizin"] = {
    "title": "Ästhetische Medizin",
    "lede": "Faltenreduzierende Unterspritzungen mit Hyaluron.",
    "hero": "_v6a2931neu-cropped.jpg",
    "sections": [
        {
            "id": "hyaluron",
            "heading": "Ästhetische Medizin",
            "img": "fotolia_76203397_xs.jpg",
            "tags": ["Falten", "Hyaluron", "Unterspritzung", "Haut"],
            "paras": [
                "Mit der Ästhetischen Medizin werden die Pfade der Gesundheit verlassen; hier geht es primär um Schönheit. Aber ist nicht auch die eigene Wahrnehmung und das Mit-sich-im Reinen-sein ein wichtiger Baustein unseres subjektiven Wohlgefühls? Um dieses zu unterstützen, biete ich in meiner Praxis faltenreduzierende Unterspritzungen und auffüllende Behandlungen an. Eingesetzt wird nur der körpereigene Bausteine Hyaluron.",
                "Hyaluronsäure liegt im Körper als wichtiger Baustein des Bindegewebes vor und bindet viel Wasser. Dadurch erscheint das jugendliche Gesicht weich und gerundet, es liegt kaum Faltenbildung der straffen Haut vor. Leider verliert der Körper im Laufe des Alterungsprozesses auch die Fülle an Hyaluron - mit den unerwünschten Nebenwirkungen von hagerer werdenden, faltenreichen Gesichtern. Hier wird nun der Mangel an körpereigenem Hyaluron lediglich gezielt ausgeglichen, das behandelte Gesicht erscheint wieder frischer und jünger.",
                "Gönnen Sie sich diesen „Urlaub“ für Ihr Wohlbefinden und vereinbaren Sie einen Termin.",
            ],
        },
    ],
}

# The two entries below are the live site's Aktuelles page. Both are from 2017.
AKTUELLES = [
    {
        "id": "winter-spezial",
        "heading": "Winter-Spezial",
        "img": "_v6a3067.jpg",
        "price": "25,- pro 30 Minuten",
        "paras": [
            "Schokolade macht glücklich!!! Gönnen Sie sich das einmalige Erlebnis einer Schokoladenmassage. Dank der reichhaltigen und hochwertigen Kakao-Öle wird die strapazierte Winterhaut reichhaltig genährt und streichelzart. Außerdem setzt der Geruch der Schokolade Glückshormone frei, so dass Sie ohne schlechtes Gewissen und auf eine ganz neue Art schlemmen können.",
            "Zeigen Sie dem Winterblues die rote Karte und vereinbaren Sie einen Termin für Ihre persönliche Auszeit zum Angebotspreis von 25,-pro 30 Minuten.",
        ],
        "dates": [],
    },
    {
        "id": "basenfasten",
        "heading": "Basenfasten",
        "img": "fotolia_103883308_xs1.jpg",
        "price": "85,-€ pro Person",
        "paras": [
            "Nach dem Winter und der Kanrnevalszeit ist der Körper stärker als normalerweise durch säurebildende Lebensmittel belastet. Helfen Sie Ihrem Körper und starten Sie mit einer vier wöchigen Basenfastenkur in den Frühling. Neben der Entgiftung werden sie automatisch auch einige überflüssige Pfunde verlieren!!!",
            "Es finden jeweils vier Treffen von ca. einer Stunde in den Praxisräumen statt. Die Kosten der Kur betragen 85,-€ pro Person, hinzukommen individuell gebuchte Optionen, wie z.B. die Entgiftung über die Haut mittels einer Rügener Kreide Behandlung. In jedem Fall empfehlenswert ist ein zusätzliches Präparat zur Unterstützung der Leber, welches in der ersten Stunde vorgestellt wird.",
        ],
        "dates": [
            ("Termin 1", "Mittwoch 01.03.2017, 08.03.2017, 15.03.2017 und 22.03.2017 jeweils um 19:00 Uhr in meinen Praxisräumen"),
            ("Termin 2", "Donnerstag 02.03.2017, 09.03.2017, 16.03.2017 und 23.03.2016 jeweils um 18:00 Uhr in meinen Praxisräumen"),
        ],
    },
]

IMPRESSUM = {
    "responsible": "Inhaltlich Verantwortlicher gemäß § 10 Absatz 3 MDStV:",
    "lines": [
        "Naturheilpraxis sanare naturalis",
        "Rafia Willemsen",
        "Uerdingerstr.573",
        "47800 Krefeld",
        "Tel.: 0173/ 8628293",
        "web: www.sanare-naturalis.de",
    ],
    "facts": [
        ("Geschäftsform", "Einzelunternehmen"),
        ("Berufsbezeichnung", "Heilpraktikerin, Zulassung seit dem 16.06.2016"),
        ("Aufsichtsbehörde", "Fachbereich Gesundheit der Stadt Krefeld"),
    ],
    "blocks": [
        ("Haftung für Inhalte", "Die Inhalte der Seite wurden mit größter Sorgfalt erstellt. Für die Richtigkeit und Vollständigkeit der Inhalte können wir keine Gewähr übernehmen. Als Dienstanbieter sind wir gemäß §7 Abs.1 TMG für eigene Inhalte nach den allgeminen Gesetzen verantwortlich. Nach §§8-10 TMG sind wir als Dienstanbieter nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Bei Bekanntwerden von Rechtsverletzungen werden wir die Inhalte umgehend entfernen."),
        ("Urheberrecht", "Die durch den Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung ausserhalb der Grenzen des Urhaberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite so wie deren Bild- und Textinhalte sind nicht gestattet."),
    ],
}

CONTACT = {
    "heading": "Hier finden Sie mich",
    "form": [
        ("name", "Name", "text", True),
        ("email", "E-Mail", "email", True),
        ("betreff", "Betreff", "text", False),
        ("nachricht", "Nachricht", "textarea", True),
    ],
    "submit": "Absenden",
}


def all_treatments():
    """Every section of every treatment page as one flat list."""
    out = []
    for slug, page in PAGES.items():
        for s in page["sections"]:
            out.append({
                "slug": slug,
                "page": page["title"],
                "id": s["id"],
                "heading": s["heading"],
                "img": s.get("img", ""),
                "tags": s.get("tags", []),
                "blurb": s["paras"][0],
                "link": s.get("link"),
            })
    return out
