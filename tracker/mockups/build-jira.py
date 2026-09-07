#!/usr/bin/env python3
"""
Emits one page per layout of the Jira screen.

Because a) three hand-copied shells drift apart. b) the shell already lives in
f-board.css and the screen styles in h-jira.css so each page here is its own
delta. c) every figure below is computed rather than typed so the rounding rule
the pages show is the rule the code will hold.

The seven tickets are the real ones. They were read from 4flow.atlassian.net on
2026-09-07 with the JQL in docs/jira.md. The hours are not real. Jira holds no
worklogs on that site so a user types them.
"""

from math import ceil
from pathlib import Path

HERE = Path(__file__).parent

# ---------------------------------------------------------------- the data

# key, summary, epic, resolved, project, workday id, hours
TICKETS = [
    ("PLRS-1141", "Add TO/Load identification or subsequent emails, not just the first one",
     "User group feedback/Additional Scope", "26 Aug", "PLRS", "4100782", 14),
    ("PLRS-1115", "Set up roles throughout the front and backend.",
     "", "13 Aug", "PLRS", "4100782", 11),
    ("PLRS-995", "Bring frontend in line with date time recommendations",
     "Release 2 technical tasks", "13 Aug", "PLRS", "4100782", 9),
    ("PLRS-1099", "Add ability to customize reopen status (when a new email comes into a closed ticket)",
     "Customization Abilities", "13 Aug", "PLRS", "4100782", 6),
    ("PLRS-1117", "Email templates page should not kill the preview just because the subject is missing.",
     "", "13 Aug", "PLRS", "4100782", 5),
    ("PLRS-1116", "Add role requirements to openapi documention",
     "Release 2 technical tasks", "13 Aug", "PLRS", "4100782", 3),
    ("DEVH-4887", "Create WebProxy 4FL-APP-167v",
     "", "13 Aug", "DEVH", "4100915", 2),
]

TITLES = {"4100782": "LP Polaris build", "4100915": "Team DevOps platform"}

# The month. August 2026 in DE_BERLIN holds 21 working days and no bank holiday.
WORKING_DAYS = 21
CONTRACT = 80
TARGET = round(WORKING_DAYS * CONTRACT / 100, 1)

HOURS_PER_HALF_DAY = 4
HOURS_PER_DAY = HOURS_PER_HALF_DAY * 2


def days_from_hours(hours):
    """The rule the screen shows. Four hours is half a day and it rounds up."""
    return ceil(hours / HOURS_PER_HALF_DAY) / 2


def grouped():
    out = {}
    for key, _s, _e, _r, _p, wid, hours in TICKETS:
        row = out.setdefault(wid, {"wid": wid, "keys": [], "hours": 0})
        row["keys"].append(key)
        row["hours"] += hours
    for row in out.values():
        row["true_days"] = row["hours"] / HOURS_PER_DAY
        row["days"] = days_from_hours(row["hours"])
    return sorted(out.values(), key=lambda r: -r["days"])


GROUPS = grouped()
TOTAL_HOURS = sum(r["hours"] for r in GROUPS)
TRUE_DAYS = TOTAL_HOURS / HOURS_PER_DAY
ROUND_DAYS = sum(r["days"] for r in GROUPS)
INFLATION = round(ROUND_DAYS - TRUE_DAYS, 2)


def num(value):
    """No trailing zero on a whole number. The tracker prints days that way."""
    return f"{value:g}"


# ---------------------------------------------------------------- the parts

def ticket_rows(with_input=True):
    out = []
    for key, summary, epic, resolved, _p, wid, hours in TICKETS:
        field = (f'<input class="hrs" value="{hours}" aria-label="Hours on {key}">'
                 if with_input else f'<b>{hours}</b>')
        out.append(f"""      <tr>
        <td class="key">{key}</td>
        <td class="sum">{summary}<br><span class="src">{epic or "no epic"}</span></td>
        <td>{resolved}</td>
        <td><span class="wid"><span class="chip cc-{wid}">{wid}</span></span></td>
        <td class="num">{field}<span class="src">typed</span></td>
      </tr>""")
    return "\n".join(out)


TICKET_TABLE = f"""<table>
  <thead>
    <tr>
      <th class="key">Ticket</th><th>Summary and epic</th><th>Closed</th>
      <th>Workday ID</th><th class="num">Hours</th>
    </tr>
  </thead>
  <tbody>
{ticket_rows()}
    <tr class="total">
      <td class="lab" colspan="4">{len(TICKETS)} tickets closed in August 2026</td>
      <td class="num">{TOTAL_HOURS} h</td>
    </tr>
  </tbody>
</table>"""


def group_rows():
    out = []
    for row in GROUPS:
        out.append(f"""      <tr>
        <td class="key"><span class="chip cc-{row['wid']}">{row['wid']}</span></td>
        <td>{TITLES[row['wid']]}</td>
        <td class="num">{len(row['keys'])}</td>
        <td class="num">{row['hours']} h</td>
      </tr>""")
    return "\n".join(out)


GROUP_TABLE = f"""<table>
  <thead>
    <tr><th class="key">Workday ID</th><th>Title</th><th class="num">Tickets</th><th class="num">Hours</th></tr>
  </thead>
  <tbody>
{group_rows()}
    <tr class="total">
      <td class="lab" colspan="2">Total</td>
      <td class="num">{len(TICKETS)}</td>
      <td class="num">{TOTAL_HOURS} h</td>
    </tr>
  </tbody>
</table>"""


def day_rows():
    out = []
    for row in GROUPS:
        out.append(f"""      <tr>
        <td class="key"><span class="chip cc-{row['wid']}">{row['wid']}</span></td>
        <td class="num">{row['hours']} h</td>
        <td class="num">{num(row['true_days'])}</td>
        <td class="num"><b>{num(row['days'])}</b></td>
      </tr>""")
    return "\n".join(out)


DAY_TABLE = f"""<table>
  <thead>
    <tr>
      <th class="key">Workday ID</th><th class="num">Hours</th>
      <th class="num">True days</th><th class="num">Booked days</th>
    </tr>
  </thead>
  <tbody>
{day_rows()}
    <tr class="total">
      <td class="lab">Total</td>
      <td class="num">{TOTAL_HOURS} h</td>
      <td class="num">{num(TRUE_DAYS)}</td>
      <td class="num">{num(ROUND_DAYS)}</td>
    </tr>
  </tbody>
</table>"""

STRIP = f"""<div class="band" style="display:flex;align-items:flex-end;flex-wrap:wrap;gap:18px">
  <div>
    <h2>August 2026 from Jira</h2>
    <p class="sub" style="margin:0">{len(TICKETS)} tickets across {len(GROUPS)} Workday IDs.
    The figures follow the hours as they are typed below.</p>
  </div>
  <dl class="stats">
    <div class="stat"><dt>Hours</dt><dd>{TOTAL_HOURS}</dd></div>
    <div class="stat"><dt>True days</dt><dd>{num(TRUE_DAYS)}</dd></div>
    <div class="stat"><dt>Booked days</dt><dd>{num(ROUND_DAYS)}</dd></div>
    <div class="stat"><dt>Target</dt><dd class="off">{num(TARGET)}</dd></div>
  </dl>
</div>"""

NO_WORKLOGS = """<div class="note">
  <strong>No hours came from Jira</strong>
  <p>The site holds no worklog for this user in August 2026 and every ticket has
  an empty <code>timespent</code>. So every figure above was typed here. A value
  read from a worklog would say so instead.</p>
</div>"""

ROUNDING = f"""<div class="note">
  <strong>Rounding up runs per Workday ID</strong>
  <p>{TOTAL_HOURS} hours is {num(TRUE_DAYS)} days. Booking rounds each Workday ID
  up to the nearest half day on its own so the month takes
  {num(ROUND_DAYS)} days. That is {num(INFLATION)} of a day more than was worked.
  The gap grows with the number of Workday IDs.</p>
</div>"""

FILL_BAR = f"""<div class="download">
  <div class="fig"><span>Jira covers</span><b>{num(ROUND_DAYS)} of {num(TARGET)} days</b></div>
  <p>The rest of August is yours to book. This writes the days and puts each
  ticket summary in the tasks column. It submits nothing.</p>
  <button type="button" class="primary">Fill the month timesheet</button>
</div>"""

SHARES = "\n".join(
    f"""      <div class="row">
        <span class="chip cc-{r['wid']}">{r['wid']}</span>
        <div class="bar"><i style="width:{round(r['hours'] / TOTAL_HOURS * 100)}%"></i></div>
        <span class="rule">{round(r['hours'] / TOTAL_HOURS * 100)} per cent</span>
      </div>""" for r in GROUPS)

# ---------------------------------------------------------------- the shell

SHELL = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tracker — {title}</title>
<link rel="stylesheet" href="f-board.css">
<link rel="stylesheet" href="h-jira.css">
{style}
</head>
<body class="edge">

<header class="top">
  <div class="area">
    <div class="bar">
      <span class="mark">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <circle cx="9" cy="9" r="8" fill="#00263C"/><circle cx="17" cy="17" r="8" fill="#FF4D06"/>
        </svg>
        <span>4<em>flow</em> Tracker</span>
      </span>
      <nav>
        <a href="#">Month view</a><a href="#">Quick fill</a><a href="#" class="on">Jira</a><a href="#">My settings</a><a href="#">Cost centres</a>
      </nav>
      <div class="who"><span>Alexander Kennedy</span><button type="button">Sign out</button></div>
    </div>
  </div>
</header>

<div class="area">
  <div class="title">
    <h1>Jira — August 2026</h1>
    <span class="pill">DE_BERLIN</span>
    <span class="pill light">{contract} per cent contract</span>
    <p>{standfirst}</p>
  </div>

{main}

  <footer>
    <b>{name}.</b> {footnote} The seven tickets are the real ones read from
    <b>4flow.atlassian.net</b> on 2026-09-07. The hours are not. That site holds
    no worklogs so a user types them. Mockup only. No component in the Vue
    application was changed.
  </footer>
</div>

</body>
</html>
"""

# ---------------------------------------------------------------- the pages

PAGES = [
    dict(
        file="h1-stacked.html",
        name="H1 — Stacked",
        title="Jira screen — H1 stacked",
        standfirst="Three tables down one sheet. The chosen design.",
        footnote="Every table keeps the full width and the reading order is the working order. The strip in the head is what pays for the summaries scrolling away while the hours are typed.",
        style="""<style>
/* The head strip is sticky so a long ticket list never hides the figures. That
   is the one cost this layout carries. */
.sheet>.band:first-child{position:sticky;top:0;z-index:2;background:var(--white)}
</style>""",
        main=f"""  <div class="sheet">
    {STRIP}
    <div class="band">
      <h2>Closed last month</h2>
      <p class="sub">Read as you. Nothing is written back to Jira. Type the hours
      you spent on each one.</p>
      {TICKET_TABLE}
    </div>
    <div class="band">
      <h2>Grouped by Workday ID</h2>
      <p class="sub">A ticket carries a Jira project. A timesheet carries a
      Workday ID. This is the join.</p>
      {GROUP_TABLE}
    </div>
    <div class="band">
      <h2>Days to book</h2>
      <p class="sub">Four hours is half a day. Each Workday ID rounds up on its
      own.</p>
      {DAY_TABLE}
      <div style="display:grid;gap:14px;margin-top:18px">{ROUNDING}{NO_WORKLOGS}</div>
    </div>
    {FILL_BAR}
  </div>""",
    ),
    dict(
        file="h2-rail.html",
        name="H2 — Rail",
        title="Jira screen — H2 rail",
        standfirst="The tickets take the width. Both summaries ride a sticky rail.",
        footnote="Typing an hour moves a figure that never scrolls away. It costs the ticket table 320 px.",
        style="""<style>
/* The rail is narrower than the board rail because it holds two tables. */
.cols{grid-template-columns:minmax(0,1fr) 340px}
</style>""",
        main=f"""  <div class="cols">
    <div class="sheet">
      <div class="band">
        <h2>Closed last month</h2>
        <p class="sub">Read as you. Type the hours you spent on each one and
        watch the rail.</p>
        {TICKET_TABLE}
      </div>
      <div class="band">{NO_WORKLOGS}</div>
    </div>
    <aside>
      <div class="box">
        <h2>Grouped by Workday ID</h2>
        {GROUP_TABLE}
      </div>
      <div class="box">
        <h2>Days to book</h2>
        {DAY_TABLE}
        <p class="foot">{num(TOTAL_HOURS / HOURS_PER_DAY)} days worked and
        {num(ROUND_DAYS)} booked. Rounding up runs per Workday ID.</p>
        <p class="foot">{num(ROUND_DAYS)} of {num(TARGET)} days for August.</p>
        <button type="button" class="primary">Fill the month timesheet</button>
      </div>
    </aside>
  </div>""",
    ),
    dict(
        file="h3-steps.html",
        name="H3 — Steps",
        title="Jira screen — H3 steps",
        standfirst="One decision at a time. Step 2 carries the way out of typing hours.",
        footnote="It is the only one of the three that offers the percentage split beside the hours.",
        style="""<style>
/* One column. Nothing competes with the step being worked on. */
.sheet{max-width:1000px}
</style>""",
        main=f"""  <div class="sheet">
    <div class="step done">
      <div class="no">1</div>
      <div>
        <h2>Check the tickets</h2>
        <p class="sub">{len(TICKETS)} closed in August 2026. Read as you and
        never written back.</p>
        {TICKET_TABLE}
      </div>
    </div>
    <div class="step">
      <div class="no">2</div>
      <div>
        <h2>Say how the month divided</h2>
        <p class="sub">Hours are the request. The percentage is there because
        Jira supplies neither.</p>
        <div class="switch">
          <button type="button" class="on">Hours per ticket</button>
          <button type="button">Percentage per Workday ID</button>
        </div>
        {GROUP_TABLE}
        <p class="sub" style="margin:18px 0 8px">The percentage version of the
        same answer. It needs no arithmetic you have to trust.</p>
        <div class="shares">
{SHARES}
        </div>
        {NO_WORKLOGS}
      </div>
    </div>
    <div class="step">
      <div class="no">3</div>
      <div>
        <h2>Book the days</h2>
        <p class="sub">Four hours is half a day. Each Workday ID rounds up on its
        own.</p>
        {DAY_TABLE}
        {ROUNDING}
      </div>
    </div>
    {FILL_BAR}
  </div>""",
    ),
]


def main():
    for page in PAGES:
        html = SHELL.format(
            title=page["title"], style=page["style"], contract=CONTRACT,
            standfirst=page["standfirst"], main=page["main"],
            name=page["name"], footnote=page["footnote"],
        )
        (HERE / page["file"]).write_text(html, encoding="utf-8")
        print(f"wrote {page['file']}")
    print(f"{TOTAL_HOURS} h -> {num(TRUE_DAYS)} true days -> {num(ROUND_DAYS)} booked "
          f"against a target of {num(TARGET)}")


if __name__ == "__main__":
    main()
