---
name: ui-design
description: Use when a UI choice has more than one defensible answer and someone has to pick. It fits comparing layouts or surfaces or colour treatments. It fits deciding how a control behaves. It fits blending two designs into one. Builds every option as a working page against one dataset. Proves the colour maths. Records what was chosen and what it cost. Triggers on "which design" and "compare these options" and "mockup" and "design decision" and "how should this look" and "pick a layout" and "colour code" and "contrast".
---

# Evaluating a UI decision

A UI decision is not settled by describing options. It is settled by looking at
them. This skill builds every option so the choice is made from the thing
itself.

## Terms

**Option.** One answer to one question. It is always a page that runs.

**Shell.** The markup and styling every option shares. Only the thing under
test sits outside it.

**Cost.** What an option takes away. Every option has one. An option with no
stated cost has not been thought about.

## 1. Never ask which option. Build them all.

Do not present a list of approaches and wait. Build each one. Because a) a
described option is judged on the description rather than the design. b) the
cost of an option usually only appears once it is built. c) picking from pages
takes the user a minute and picking from prose takes an argument.

Ask the user only what you cannot derive. A brand approval is such a question.
A layout preference is not.

## 2. One shell. One dataset.

Every option reads the same data and sits in the same shell. A comparison where
two things differ proves nothing about either.

Put the shell in a shared stylesheet and the data in a shared script. The option
then differs in one class or one component and nothing else.

An option sometimes has to hold a second variable steady. Say which value it
holds. Write that in the page footer.

## 3. Generate the pages. Do not copy them.

Once there are more than three options write a builder that emits them from one
template. Because a) six hand-copied shells drift within a day. b) a drifted
shell silently ruins the comparison. c) a builder makes adding a seventh option
free.

Keep the builder next to the pages it emits.

## 4. State the cost in the page.

Each option page ends with what it is and what it costs. Plain sentences. No
hedging. The user reads the cost while looking at the design rather than in a
separate document.

Say what an option gives up. "Costs 340 px of width." "A sixth cost centre has
no fill left." "Needs a focus trap." That sentence is what the decision turns
on.

## 5. Prove the colour before asserting it.

Never quote a contrast ratio from memory. Run `contrast.py` in this directory.

```
python3 contrast.py "#007EFF" "#FFFFFF"
python3 contrast.py --pairs palette.json
```

Body text needs 4.5 to 1. Large text needs 3. A colour that fails carries no
text. It may still draw a line because a line carries no text. That distinction
is usually the way out of a palette that cannot colour code.

Check every pair the design actually uses. A colour that passes on white often
fails on a tint of the same hue.

## 6. Verify before showing.

Do all four. Skipping one of these has caught a defect every time.

- Parse each page for an unclosed tag.
- Check every link resolves to a file.
- Run any shared renderer against a stubbed document and assert the totals
  match the dataset.
- Screenshot each page and look at it. A page that parses can still lay out
  wrongly. A legend that stacks vertically is invisible to a parser.

## 7. Close the decision in writing.

Do three things once the user picks.

- Mark the chosen option on the comparison page. Keep the pages that lost.
  Because a decision is only readable beside what it beat.
- Turn the open question into build tasks. A chosen popover brings a focus trap
  and an edge flip with it. Those are now work.
- Write the reason as "Because a) b) c)" with the cost stated. Six months later
  the reason is the only part anyone needs.

## Checklist

- [ ] Every option is a page that runs.
- [ ] One shell and one dataset across all of them.
- [ ] More than three options come from a builder.
- [ ] Each page states its own cost.
- [ ] Every contrast ratio was computed rather than recalled.
- [ ] Pages parse. Links resolve. Totals agree. Screenshots seen.
- [ ] The chosen option is marked and the losers are kept.
- [ ] The decision is written with its reason and its cost.
