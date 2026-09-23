# Reading speed of humans and of programmers

Research note for the review time estimate described in `readme`. Every figure here comes from a source held in `knowledge_base/`.

## Answer in short

Prose is read for comprehension at about 238 words per minute. The maximum with comprehension intact is about 300 words per minute in sustained reading and about 790 words per minute in bursts of a few seconds. Code has no published words per minute figure. The rate that matters for review is measured in lines per hour. Effective review runs at 150 to 400 lines per hour. Detection of defects collapses above 450 lines per hour. Reading speed is never the limit. Comprehension is the limit.

## 1. Prose sets the upper bound

Brysbaert pooled 190 studies with 18573 participants.

| Task | Rate |
| --- | --- |
| Silent reading of non-fiction | 238 wpm with a standard deviation of 51.2 |
| Silent reading of fiction | 260 wpm |
| Typical adult band for non-fiction | 175 to 300 wpm |
| Reading aloud | 183 wpm |
| Reading with recall expected | 93 to 147 wpm |
| Studying a textbook passage | 39 to 171 wpm |

Individual variation is wide and it swamps the effect of the text. Self-selected slow readers sit at 138 wpm against 303 wpm for fast readers. A standardised text set gives 184 wpm as the mean across 17 languages with a standard deviation of 29. Paper beats screen for comprehension by a small margin of Hedges g of -0.21 measured over 171055 participants.

One study in that set matched the same texts across two tasks. Participants read at 189 wpm and studied at 54 wpm. Study is therefore about three and a half times slower than reading. Code review is a study task rather than a reading task.

## 2. The maximum

| Condition | Rate | Note |
| --- | --- | --- |
| Sustained reading with full comprehension | about 300 wpm | The eye movement system is the constraint. |
| Skimming for ideas | 450 wpm | Carver gear four. |
| Scanning for a word | 650 wpm | No comprehension of the passage. |
| Short paragraph with four comprehension questions | median 790 wpm | Fastest participant reached 1652 wpm. |
| One simple sentence at maximum exposure | up to 16000 wpm | Holds for three or four items drawn from iconic memory. |
| Isolated word decoding without a mask | 1200 wpm | Perceptual ceiling only. |

Two limits sit under those numbers. Because a) the eyes need about 200 to 250 ms per fixation which caps normal reading near 300 wpm and b) isolated decoding falls from 1200 wpm to 800 wpm once the stream exceeds the short-term memory span and memory alone caps the rate between 250 wpm and 500 wpm the burst rates cannot be held. A participant reading a novel chapter by rapid serial presentation for 20 minutes settled at 200 wpm and scored worse than a participant with a book. Rayner and colleagues reviewed the training claims and found no method that raises speed without a comprehension cost.

Training does not lift the ceiling by much. A three arm trial gave a commercial speed reading app against metacognitive training against a control. The gains were 44 wpm and 31 wpm and 1 wpm. Trained Japanese speed readers reach 2600 characters per minute at 68% comprehension where untrained readers sit at 1237 characters per minute at 84%. The eye movement norms behind the ceiling are 225 ms per fixation and 2 degrees per saccade in silent reading against 275 ms and 1.5 degrees when reading aloud.

## 3. Code is not read like prose

Busjahn tracked eyes over short English passages and over Java.

| Measure | Prose | Code |
| --- | --- | --- |
| Linear eye movements for novices | 80% | 70% |
| Linear eye movements for experts | not tested | 60% |
| Elements looked at by novices | 83.46% of words | 52.42% of code elements |
| Elements looked at by experts | not tested | 41.27% |
| Read-throughs of the same text | 6.35 | 3.89 |
| Saccade length for novices | 2.28 degrees | 1.68 degrees |

Three consequences follow. Because a) a reader of code skips half the tokens outright b) a reader of code jumps backwards far more often than the 10 to 15% regression rate of prose and c) an expert follows execution order rather than page order the words per minute measure loses its meaning over code. Expertise makes the reading less linear rather than faster per line.

## 4. Measured comprehension of small snippets

Peitek replicated the above with 31 participants over Java snippets of at most 30 lines.

| Group | Response time per snippet | Accuracy |
| --- | --- | --- |
| Novices | 83.0 s with a standard deviation of 55.1 | 86% |
| Intermediate programmers | 65.4 s with a standard deviation of 49.4 | 91% |
| Intermediate with meaningful names | 55.0 s | 90% |
| Intermediate with obfuscated names | 89.6 s | 93% |

The paper gives no mean snippet size so take 20 lines as the mean. The intermediate rate is then about 18 lines per minute or 1100 lines per hour. That is the ceiling for a self contained snippet held on one screen with one question to answer. Stripping the identifier names costs 63% more time. Naming is worth more than experience here. An intermediate programmer reading obfuscated code falls back to novice speed.

## 5. What changes the rate

These factors move comprehension time further than experience does.

| Factor | Effect | Source |
| --- | --- | --- |
| Identifier names | Stating what a method does took 2 to 7 minutes with meaningful names against 12.5 to 22 minutes with single letters | Avidan and Feitelson 2017 |
| Indentation of control flow | Non-indented nested conditionals cost 179% more time on average with a range of 142% to 269% | Morzeck 2023 |
| Indentation width | Median response time moved only between 85 and 98 seconds across 0 and 2 and 4 and 8 spaces | Bauer 2019 |
| Position in the diff | A defect was 64% less likely to be found when its file was shown last rather than first | Fregnan 2022 |
| Decomposition of the change | The first defect was reached about 14% faster when one change was split into parts | Di Biase 2019 |

Read those rows together. Because a) the presence of indentation matters while its width does not b) naming outweighs experience since an intermediate programmer on obfuscated code falls back to novice speed and c) a defect late in a diff is missed at a rate no per line estimate can express the shape of the diff sets the cost as much as its size does.

Quality of the review is not high even at the right pace. 54% of reviewed Mozilla changes still introduced bugs. That figure reaches us second hand. Kononenko 2016 is held here and states it as a back reference to an earlier study by the same authors which is not held.

## 6. What review actually costs

| Source | Setting | Rate |
| --- | --- | --- |
| Wiegers | Formal inspection | 100 to 200 lines per hour |
| Wiegers observed | Formal inspection | about 200 lines per hour with 18 defects per kLOC |
| Cisco and SmartBear | 2500 tool based reviews over 3.2 million lines | Most reviews under 150 lines and slower than 500 lines per hour |
| Cisco and SmartBear | Defect finding above average | slower than 400 lines per hour |
| Cisco and SmartBear | Defect finding below average in 87% of cases | faster than 450 lines per hour |

Supporting figures from the same case study. Average defect density was 32 defects per 1000 lines. 61% of reviews found nothing. Any review under 200 lines returned several times the average density. No review above 250 lines returned more than 37 defects per 1000 lines. Reviewers stop finding defects after 60 minutes.

The lineage of those rates needs care. The 100 to 200 lines per hour rule is repeated everywhere and is usually traced to Basili and Perricone 1984. That paper is now held here and it contains no inspection rate and no lines per hour figure at all. Its Table VII plots errors per 1000 executable lines against module size in lines. The values run 16.0 at size 50 and 12.6 at 100 and 12.4 at 150 and 7.6 at 200 and 6.4 above 200. The secondary literature restates those as 1.6 percent falling to 0.6 percent and relabels the axis as lines inspected per hour. The paper concludes that the larger the module the less error prone it was. Nothing in it speaks to reading pace. Treat the 100 to 200 figure as practitioner guidance from Wiegers rather than as a measured result.

Sizes in practice are small. The median change at Google modifies 24 lines. Over 35% of changes touch one file. Median change size across open source projects runs from 11 to 32 lines. Chrome sits higher at 78 lines and Lucent at 263 lines. The Microsoft projects sit between those two without a published median. A Google developer spends a mean of 3.2 hours per week reviewing against a self reported 6.4 hours per week in open source.

## 7. Lines do not predict time

This is the finding that matters most for the estimate in `readme`.

The Cisco data shows no inspection rate at all. A plot of size against time does not cluster around any line. A single reviewer fitted alone gives an R squared of 0.29. Four reviews of one or two lines each took over 15 minutes. Every one of those was genuine and each involved a change with wide consequences.

The same paper undermines one step in the Cisco argument. Cisco reads falling defect density above 200 lines as reviewers becoming less effective. Its own footnote flags the assumption underneath which is that true defect density stays constant across change sizes. Basili and Perricone measured that assumption on 90000 lines of Fortran and found it false. Error density per 1000 lines fell by a factor of two and a half from the smallest modules to the largest. Part of the Cisco curve is therefore a property of the code rather than a property of the reviewer.

Pull request data agrees. Across about 800000 merged pull requests the Spearman correlation between size and time to merge runs from 0.20 to 0.37 by language. Median time to merge is 10 to 22 hours while median size is 8 to 43 lines. Calendar latency is dominated by waiting rather than by reading.

## 8. Why the gap is so wide

Code in this repository carries 4.97 identifier words per non-blank line and 10.89 tokens and 35.4 characters. That was measured over 166 files and 34789 non-blank lines in `../tracker`. At the prose rate of 238 words per minute those lines would pass the eye at about 48 lines per minute or 2870 lines per hour. Effective review runs at a tenth of that.

The missing time is not reading. Because a) the reader must skip and revisit rather than sweep b) the reader must build a model of behaviour rather than absorb a statement c) the reader must check that model against an intent that is not written down and d) the reader must reach outside the diff for callers and types the cost per line is set by comprehension and verification.

## 9. Numbers to use in the estimate

| Depth | Rate | Seconds per line |
| --- | --- | --- |
| Formal inspection of critical code | 150 lines per hour | 24 |
| Normal careful review | 300 lines per hour | 12 |
| Fast pass or familiar or repetitive code | 500 lines per hour | 7 |
| Skim with no defect finding expected | above 1000 lines per hour | under 4 |

Three corrections belong on top of any per line rate. Because a) a review carries a fixed cost of roughly 5 to 15 minutes for loading context which dominates any change under 20 lines b) attention fails after 60 minutes so a single sitting caps at 300 to 400 lines and c) defect density falls away above 200 lines a linear model will underestimate small reviews and overestimate large ones.

Apply a multiplier for the state of the diff. Obfuscated identifiers cost 1.6x on snippet tasks. Avidan measured single letter names against meaningful names at 4.5 minutes against 17.25 minutes on midpoints which is 3.8x. Missing indentation on nested control flow costs 2.8x in the original trial and 2.1x in the replication. Take 2.1x as the working figure. A diff spread over many files costs accuracy rather than time so it needs splitting rather than a longer estimate.

A workable form is `minutes = overhead + lines / rate` with the rate in lines per minute. Cap one sitting at 60 minutes. Split anything above 400 lines into separate sittings.

## 10. Gaps in the evidence

No study measures a words per minute rate for source code. The snippet studies use at most 30 lines on one screen with no scrolling. No study measures review of a diff spread across files. The industry rates come from defect density curves rather than from timing experiments. One of those curves rests on a source that does not contain it. The Cisco data is from one company and one tool over 10 months.

No rate exists for legal or mathematical or scientific prose as a category either. The searches for one returned recall scores and fixation counts rather than words per minute.
