#!/usr/bin/env python3
"""
Builds the ten Tracker marks and the showcase page from one definition.

Every mark is a 64 unit square with a 6 unit margin so they share an optical
size. The primary shape takes currentColor so one file serves a light and a
dark ground. The colour attribute on the root is a presentation attribute so
any CSS rule beats it.
"""

import json
import pathlib

ORANGE = '#FF4D06'
BLUE = '#00263C'

MARKS = [
    ('half-day', 'Half day', 'The unit the tracker books. A day split in two.',
     '<path d="M8 22a14 14 0 0 1 14-14h20a14 14 0 0 1 14 14v20a14 14 0 0 1-14 14H22A14 14 0 0 1 8 42Z" fill="currentColor"/>'
     f'<path d="M32 8h10a14 14 0 0 1 14 14v20a14 14 0 0 1-14 14H32Z" fill="{ORANGE}"/>'),

    ('month-grid', 'Month grid', 'Four cells. Three booked and one open.',
     '<rect x="10" y="10" width="20" height="20" rx="6" fill="currentColor"/>'
     '<rect x="34" y="10" width="20" height="20" rx="6" fill="currentColor"/>'
     '<rect x="10" y="34" width="20" height="20" rx="6" fill="currentColor"/>'
     f'<rect x="34" y="34" width="20" height="20" rx="6" fill="{ORANGE}"/>'),

    ('clock-arc', 'Progress ring', 'The month against its target. The gap is what is left.',
     '<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="7" opacity=".28"/>'
     f'<path d="M32 12a20 20 0 1 1-17.32 10" fill="none" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round"/>'),

    # The track runs the full width at a thinner weight. A short bar behind the
    # circles read as ears rather than as a line.
    ('flow-dots', 'Connected dots', 'The 4flow connected shape set on a track.',
     '<rect x="3" y="29.5" width="58" height="5" rx="2.5" fill="currentColor" opacity=".3"/>'
     '<circle cx="25" cy="32" r="12" fill="currentColor"/>'
     f'<circle cx="41" cy="32" r="12" fill="{ORANGE}"/>'),

    ('stopwatch', 'Stopwatch', 'Time being measured rather than time passing.',
     '<rect x="28" y="7" width="8" height="10" rx="3" fill="currentColor"/>'
     '<circle cx="32" cy="36" r="19" fill="currentColor"/>'
     f'<path d="M32 36 42 27" fill="none" stroke="{ORANGE}" stroke-width="5.5" stroke-linecap="round"/>'),

    ('bars', 'Split bars', 'The month divided across cost centres.',
     '<rect x="11" y="15" width="42" height="10" rx="5" fill="currentColor"/>'
     f'<rect x="11" y="27" width="26" height="10" rx="5" fill="{ORANGE}"/>'
     '<rect x="11" y="39" width="34" height="10" rx="5" fill="currentColor"/>'),

    ('monogram-t', 'Monogram T', 'The letter built from a stem and a track.',
     '<rect x="26.5" y="14" width="11" height="38" rx="5.5" fill="currentColor"/>'
     f'<rect x="10" y="14" width="44" height="11" rx="5.5" fill="{ORANGE}"/>'),

    ('check-day', 'Day done', 'One day closed. The clearest mark at a small size.',
     '<path d="M8 22a14 14 0 0 1 14-14h20a14 14 0 0 1 14 14v20a14 14 0 0 1-14 14H22A14 14 0 0 1 8 42Z" fill="currentColor"/>'
     f'<path d="M20 33 28.5 41.5 44 24" fill="none" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),

    ('hourglass', 'Hourglass', 'Time running out. The month has a deadline.',
     '<rect x="13" y="7" width="38" height="7" rx="3.5" fill="currentColor"/>'
     '<path d="M17 14h30L34.2 31a2.7 2.7 0 0 1-4.4 0Z" fill="currentColor"/>'
     f'<path d="M17 50h30L34.2 33a2.7 2.7 0 0 0-4.4 0Z" fill="{ORANGE}"/>'
     '<rect x="13" y="50" width="38" height="7" rx="3.5" fill="currentColor"/>'),

    ('calendar-day', 'Marked day', 'A calendar with the day you are on picked out.',
     '<rect x="19" y="6" width="7" height="13" rx="3.5" fill="currentColor"/>'
     '<rect x="38" y="6" width="7" height="13" rx="3.5" fill="currentColor"/>'
     '<rect x="8" y="14" width="48" height="42" rx="11" fill="currentColor"/>'
     f'<rect x="33" y="33" width="13" height="13" rx="4" fill="{ORANGE}"/>'),

    # The mark already running in the five mockups. The original sits in a 26
    # unit box as circles at 9,9 and 17,17 with r8 so the offset equals the
    # radius. That ratio is held here at the 64 unit size.
    ('flow-bubbles', 'Bubbles', 'The mark already running across the five mockups.',
     '<circle cx="23.3" cy="23.3" r="17.3" fill="currentColor"/>'
     f'<circle cx="40.7" cy="40.7" r="17.3" fill="{ORANGE}"/>'),

    # The bubble behind becomes the dial. It carries the crown clear of the
    # front bubble so the whole group still reads as the 4flow shape.
    ('bubble-watch', 'Bubble stopwatch', 'The same two bubbles. The one behind becomes the dial.',
     '<rect x="20" y="5" width="8" height="8" rx="4" fill="currentColor"/>'
     '<circle cx="24" cy="26" r="16" fill="currentColor"/>'
     f'<path d="M24 26 35 20" fill="none" stroke="{ORANGE}" stroke-width="5" stroke-linecap="round"/>'
     f'<circle cx="40" cy="42" r="16" fill="{ORANGE}"/>'),

    # 13 to 15 come from the motifs 4flow.com actually uses. Connected pathways
    # with nodes. Chevrons as progression indicators. Horizontal flow patterns.
    ('lane-nodes', 'Lane nodes', 'A route with its stops. The leading node is where you are.',
     '<rect x="14" y="29.5" width="34" height="5" rx="2.5" fill="currentColor"/>'
     '<circle cx="14" cy="32" r="6" fill="currentColor"/>'
     '<circle cx="31" cy="32" r="6" fill="currentColor"/>'
     f'<circle cx="48" cy="32" r="9" fill="{ORANGE}"/>'),

    ('chevron-pair', 'Chevrons', 'The progression indicator the site uses. Forward and on time.',
     '<path d="M16 15 32 32 16 49" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'
     f'<path d="M32 15 48 32 32 49" fill="none" stroke="{ORANGE}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>'),

    ('flow-arc', 'Flow arc', 'The flow curve with the node it is heading for.',
     '<path d="M10 48Q10 16 42 16" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>'
     f'<circle cx="44" cy="16" r="11" fill="{ORANGE}"/>'),

    # 16 to 19 are permutations of marks already in the set.
    ('half-day-stack', 'Half day stacked', 'Half day split the way the grid stacks it. Two rows to a day.',
     '<path d="M8 22a14 14 0 0 1 14-14h20a14 14 0 0 1 14 14v20a14 14 0 0 1-14 14H22A14 14 0 0 1 8 42Z" fill="currentColor"/>'
     f'<path d="M8 32h48v10a14 14 0 0 1-14 14H22A14 14 0 0 1 8 42Z" fill="{ORANGE}"/>'),

    ('bubbles-three', 'Three bubbles', 'Bubbles carried to three. End to end rather than a pair.',
     '<circle cx="19" cy="19" r="13" fill="currentColor"/>'
     '<circle cx="32" cy="32" r="13" fill="currentColor"/>'
     f'<circle cx="45" cy="45" r="13" fill="{ORANGE}"/>'),

    ('ring-check', 'Ring check', 'Progress ring crossed with Day done. The month closed.',
     '<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="7"/>'
     f'<path d="M22 32 29 39 42 25" fill="none" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),

    # The crown can only sit on a bubble whose top edge is clear. On the front
    # bubble that means angling it out to 1 oclock rather than standing it at 12.
    ('bubble-watch-front', 'Bubble stopwatch reversed', 'The dial moved to the front bubble. The crown has to angle out.',
     '<circle cx="24" cy="26" r="16" fill="currentColor"/>'
     '<rect x="47" y="25.5" width="12" height="7" rx="3.5" fill="currentColor" transform="rotate(-45 53 29)"/>'
     f'<circle cx="40" cy="42" r="16" fill="{ORANGE}"/>'
     '<path d="M40 42 31 33" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>'),

    # 20 and 21 are asked for crosses of the bubble pair with other marks.
    ('bubble-check', 'Bubble check', 'Bubble stopwatch with Ring check standing in for the dial.',
     '<circle cx="25" cy="26" r="15.5" fill="none" stroke="currentColor" stroke-width="6"/>'
     f'<path d="M17.25 26 22.68 31.43 32.75 20.58" fill="none" stroke="{ORANGE}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>'
     f'<circle cx="40" cy="42" r="16" fill="{ORANGE}"/>'),

    ('bubble-four', 'Bubble four', 'Bubble stopwatch with the 4 set into the front bubble.',
     '<rect x="20" y="5" width="8" height="8" rx="4" fill="currentColor"/>'
     '<circle cx="24" cy="26" r="16" fill="currentColor"/>'
     f'<path d="M24 26 35 20" fill="none" stroke="{ORANGE}" stroke-width="5" stroke-linecap="round"/>'
     f'<circle cx="40" cy="42" r="16" fill="{ORANGE}"/>'
     '<path d="M44 32 44 52M44 32 32 46 50 46" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),

    # 22 to 24 riff on the Roman four. A clock dial has always cut it as IIII
    # rather than IV and four strokes is also how you tally.
    ('tally-four', 'Tally four', 'IIII. The four a clock dial uses and the way you tally at once.',
     '<rect x="6" y="15" width="7" height="34" rx="3.5" fill="currentColor"/>'
     '<rect x="21" y="15" width="7" height="34" rx="3.5" fill="currentColor"/>'
     '<rect x="36" y="15" width="7" height="34" rx="3.5" fill="currentColor"/>'
     f'<rect x="51" y="15" width="7" height="34" rx="3.5" fill="{ORANGE}"/>'),

    ('dial-four', 'Four o clock', 'The hand resting on the four. A quiet way to carry the number.',
     '<circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="7"/>'
     f'<path d="M32 32 42.4 38" fill="none" stroke="{ORANGE}" stroke-width="6" stroke-linecap="round"/>'),

    ('numeral-iv', 'Numeral IV', 'The Roman four drawn as two rounded strokes.',
     '<rect x="14" y="16" width="8" height="32" rx="4" fill="currentColor"/>'
     f'<path d="M28 16 37 48 46 16" fill="none" stroke="{ORANGE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'),

    # 25 to 27 are the symbols for flowing and for tracking.
    ('wave-flow', 'Wave', 'The flow symbol. One crest up and one down.',
     '<path d="M10 32A11 8 0 0 1 32 32" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>'
     f'<path d="M32 32A11 8 0 0 0 54 32" fill="none" stroke="{ORANGE}" stroke-width="9" stroke-linecap="round"/>'),

    ('pulse-track', 'Pulse', 'The tracking line. Flat until something happens.',
     '<path d="M10 32H24" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>'
     f'<path d="M24 32 30 17 38 47 44 32" fill="none" stroke="{ORANGE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
     '<path d="M44 32H54" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>'),

    ('map-pin', 'Map pin', 'The location indicator the site puts on its maps.',
     '<path d="M32 8a16 16 0 0 1 16 16c0 11-16 32-16 32S16 35 16 24A16 16 0 0 1 32 8Z" fill="currentColor"/>'
     f'<circle cx="32" cy="24" r="6.5" fill="{ORANGE}"/>'),
]


CHOSEN = 'bubble-watch'


def tag(mark, size, cls=''):
    return (f'<svg class="{cls}" viewBox="0 0 64 64" width="{size}" height="{size}" '
            f'aria-label="Tracker {mark["name"]}" role="img">{mark["body"]}</svg>')


def main():
    here = pathlib.Path(__file__).parent
    marks = [{'slug': s, 'name': n, 'note': o, 'body': b} for s, n, o, b in MARKS]

    for m in marks:
        (here / f'{m["slug"]}.svg').write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" '
            f'color="{BLUE}" role="img" aria-label="Tracker — {m["name"]}">\n  {m["body"]}\n</svg>\n')

    (here / 'marks.json').write_text(json.dumps(marks, indent=1))

    template = (here / 'page.template').read_text()
    (here / 'index.html').write_text(
        template
        .replace('{{CARDS}}', '\n'.join(
            f'''    <figure class="card{" chosen" if m["slug"] == CHOSEN else ""}">
      <div class="stage">{tag(m, 92)}</div>
      <div class="grounds">
        <span class="g white">{tag(m, 30)}</span>
        <span class="g warm">{tag(m, 30)}</span>
        <span class="g blue dark">{tag(m, 30)}</span>
      </div>
      <div class="ladder">{tag(m, 24)}{tag(m, 16)}<em>24 and 16 px</em></div>
      <figcaption>
        <b>{i + 1}. {m["name"]}{" — in use" if m["slug"] == CHOSEN else ""}</b>
        <span>{m["note"]}</span>
        <code>{m["slug"]}.svg</code>
      </figcaption>
    </figure>''' for i, m in enumerate(marks)))
        .replace('{{REVERSED}}', '\n'.join(f'      <span title="{m["name"]}">{tag(m, 52)}</span>' for m in marks))
        .replace('{{TINY}}', '\n'.join(f'      <span title="{m["name"]}">{tag(m, 16)}</span>' for m in marks))
        .replace('{{LOCKUPS}}', '\n'.join(
            f'      <div class="lock">{tag(m, 34)}<span class="word">Tracker</span></div>' for m in marks))
        .replace('{{LOCKUPS_FULL}}', '\n'.join(
            f'      <div class="lock small">{tag(m, 26)}<span class="word"><em>4flow</em> Tracker</span></div>'
            for m in marks)))
    print(f'{len(marks)} marks and index.html written')


if __name__ == '__main__':
    main()
