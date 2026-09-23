# review-time

Approximates how long a code review will take. Reads a unified diff. Prints a range and the number of sittings it needs.

It is also a library. The global `prepare-commit-msg` hook in `../../commit-message` calls it so the estimate prints beside the line counts of a staged change.

## Build and run

```
cargo build --release
git diff HEAD | target/release/review-time
```

With no piped input the tool asks git itself.

```
review-time                       the working tree against HEAD
review-time main...HEAD           a branch
review-time --depth inspection    a careful read
git show abc123 | review-time     one commit
review-time --json                machine readable output
```

Depths are `inspection` at 150 lines per hour and `standard` at 300 and `fast` at 500 and `skim` at 1000.

## The model

`minutes = overhead + work / rate` with a multiplier for the state of the diff.

| Element | Value | Source |
| --- | --- | --- |
| Base overhead | 5 min | Cisco reviews of one or two lines ran past 15 minutes when the change had wide consequences. |
| Per file | 1.5 min | Orienting inside another file. |
| Code rate | 150 to 1000 lines per hour | Wiegers puts inspection at 100 to 200. Cisco puts the detection limit at 450. |
| Prose rate | 90 to 300 words per minute | Reading for recall runs at 93 to 147 words per minute. |
| Comment line | 0.5 | Comments drew up to 23% of fixations in eye tracking. |
| Deleted line | 0.25 | Judgement. A deletion is checked for what it breaks. |
| Data line | 0.2 | Judgement. A data file is sampled rather than read. |
| Opaque naming | up to 1.6x | Obfuscated identifiers cost 1.63x on the Peitek snippet task. |
| Language density | 0.95 on the JVM | Measured at 9.44 tokens a line against about 10.2 for rust and typescript and vue. |
| Missing indentation | 2.1x | Morzeck measured 179% more time. The replication measured 113%. |
| Sitting | 60 min or 400 lines | Reviewers stop finding defects after 60 minutes. |
| Range | 0.5x to 2.0x | Change size explains little of review time. |

Binary files and lock files and anything under `node_modules` or `dist` or `vendor` are not read.

## Language profiles

A file is read through the profile its extension selects. The profile holds the
comment markers and the keywords that declare a name and whether indentation is
forced by the language and whether a single capital is a type parameter. It also
holds a density.

Density was measured on 2026-09-23 over your own code. polaris-backend gives 9.44
tokens a line across 4503 java files. polaris-frontend gives 10.20 for typescript
over 1646 files and 10.24 for vue over 464. alex-log gives 10.16 for rust. Because
a) the four sit within 5% of each other b) the rates in the table above were
measured on java and C family code in the first place and c) inventing a spread
the measurement does not show would be worse than having none only the JVM moves
and it moves to 0.95.

So the profiles earn their place through rules rather than through speed.

## Naming

The multiplier counts distinct names the change introduces rather than every
mention. A name counts as introduced when it follows a declaring keyword for that
language or when the next character binds it. Because a) a name is chosen once
and read many times b) a loop mentioning `q` ten times is one naming decision and
not ten and c) an imported name was somebody else's choice the count belongs at
the declaration.

A diff of pure call sites declares nothing of its own. There the names it
mentions stand in.

A single capital is a type parameter rather than a bad name so `T` and `K` and
`V` never count against a language that uses them. A language that does not such
as python still counts them.

## Machine written files

A path under `node_modules` or `dist` or `storybook-static` or a lock file is
skipped by name. Anything else whose changed lines average over 200 characters is
skipped as well. The storybook bundles in polaris-frontend run to 20604
characters on one line against a hand written mean of about 35.

## Why a range

Because a) the Cisco case study found no inspection rate at all and fits a single reviewer at an R squared of 0.29 b) the correlation between change size and time to merge runs from 0.20 to 0.37 across about 826000 pull requests and c) the fixed cost of loading context dominates any small change a single number would be false precision.

## Warnings

The tool reports the conditions under which the estimate stops meaning much.

- Past 200 effective lines defect density falls away.
- Past 60 minutes or 400 lines the review needs another sitting.
- Past 5 files a defect in the last file is 64% less likely to be found than one in the first.
- Opaque short names and missing indentation raise the cost of every line they touch.

## Evidence

`../reading-speed.md` holds the figures and their limits. The papers sit in `../knowledge_base/`.
