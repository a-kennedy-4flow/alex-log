# Knowledge base

Sources for the reading speed research behind the review time estimate. Each PDF sits beside a plain text copy under `text/`. Downloaded on 2026-09-23.

## Human reading speed

| File | Source | What it supplies |
| --- | --- | --- |
| brysbaert-2019-reading-rate-meta-analysis.pdf | Brysbaert 2019 Journal of Memory and Language | Meta-analysis of 190 studies with 18573 participants. Silent reading rates. Study rates. Maximum rates. |
| rsvp-2016-speed-limits-on-reading-rate.html | Primativo and colleagues 2016 PLoS ONE | Perceptual limits found with rapid serial visual presentation. Decoding ceiling against eye movement ceiling. |

## Reading code against reading prose

| File | Source | What it supplies |
| --- | --- | --- |
| busjahn-2015-eye-movements-code-reading.pdf | Busjahn and colleagues ICPC 2015 | Linearity of reading order. Element coverage. Saccade length. Read-through counts for prose against code. |
| peitek-2020-reading-order-of-programmers.pdf | Peitek Siegmund Apel ICPC 2020 | Replication with 31 participants. Response times per snippet by experience and by identifier naming. |
| peitek-2021-fmri-complexity-metrics.pdf | Peitek and colleagues ICSE 2021 | Brain imaging of comprehension against complexity metrics. |
| maletic-2020-ez-reader-over-code.pdf | Al Madi and Maletic EMIP 2020 | Whether a prose eye movement model predicts fixations over code. Token frequency effects. |
| rodeghero-developer-reading-behavior-java-methods.pdf | Abid and colleagues | Gaze behaviour while summarising Java methods of 9 to 80 lines. |
| wyrich-2022-40-years-code-comprehension-experiments.pdf | Wyrich and colleagues 2022 | Mapping study of code comprehension experiment design over 40 years. |

## Code review rate in industry

| File | Source | What it supplies |
| --- | --- | --- |
| smartbear-cisco-code-review-case-study.pdf | SmartBear and Cisco case study | 2500 reviews over 3.2 million lines. Defect density against review size. Defect density against inspection rate. Evidence that no single rate exists. |
| smartbear-best-practices-peer-code-review.html | SmartBear | The 200 to 400 line and 300 to 500 lines per hour guidance drawn from the case study. |
| wiegers-1995-software-inspections.pdf | Wiegers 1995 | Formal inspection rates of 100 to 200 lines per hour. Defects found per person hour. |
| sadowski-2018-modern-code-review-google.pdf | Sadowski and colleagues ICSE SEIP 2018 | Change sizes at Google. Review latency. Hours per week spent reviewing. |
| sadowski-google-code-review-slides.pdf | Course slides on the above | Condensed figures. |
| bacchelli-bird-2013-expectations-code-review.pdf | Bacchelli and Bird ICSE 2013 | What reviewers actually do. Understanding is the main cost. |
| rigby-bird-2013-convergent-peer-review.pdf | Rigby and Bird FSE 2013 | Median change sizes and review intervals across open source and Microsoft projects. |
| do-small-code-changes-merge-faster.pdf | Kudrjavets and colleagues 2022 | Correlation between change size and time to merge over about 800000 pull requests. |

## Not downloadable

Rayner Schotter Masson Potter and Treiman 2016. "So Much to Read So Little Time". Psychological Science in the Public Interest 17(1). DOI 10.1177/1529100615623267. The publisher blocks automated download. Figures quoted from it are the 200 to 400 words per minute band and the finding that no training raises speed without a comprehension cost. Both also appear in the Brysbaert meta-analysis held here.

## Added by the broad search on 2026-09-23

Two agents searched with open briefs rather than named papers. The code pass added 16 sources. The reading pass added 38 sources and corrected two attributions found in its own first pass. Sources that could not be downloaded are listed with their DOI at the end of each part.

### Part one. Code comprehension and review effort


Downloaded on 2026-09-23. Each PDF sits beside a plain text copy under `text/`. This file lists only sources found in this pass. It does not repeat sources already held in `index.md`.

#### Identifier naming formatting and comments

| File | Citation | Numbers supplied | URL |
| --- | --- | --- | --- |
| code-avidan-2017-variable-names-comprehension.pdf | Avidan and Feitelson ICPC 2017 "Effects of Variable Names on Comprehension: An Empirical Study" | Meaningful names let participants state method functionality in 2 to 7 minutes. Meaningless single letter names took 12.5 to 22 minutes on the same task. A second task showed 4.5 to 10 minutes against 8 to 12 minutes. A third task showed 6 to 15 minutes against 15 to 18 minutes with one participant giving up after 21 minutes. | https://www.cs.huji.ac.il/~feit/papers/Names17ICPC.pdf |
| code-munozbaron-2020-cognitive-complexity-understandability.pdf | Muñoz Barón Wyrich and Wagner ESEM 2020 "An Empirical Validation of Cognitive Complexity as a Measure of Source Code Understandability" | Meta-analysis of about 24000 understandability evaluations across 427 code snippets drawn from prior studies. Cognitive Complexity correlates positively with comprehension time and negatively with perceived ease of understanding. Lines of code showed the weakest correlations among the metrics tested. | https://arxiv.org/pdf/2007.12520 |
| code-bauer-2019-indentation-program-comprehension.pdf | Bauer Schaible and colleagues 2019 "Indentation: Simply a Matter of Style or Support for Program Comprehension?" | Median response time was 95.00 seconds with no indentation against 97.55 seconds at two space indent 93.42 seconds at four space indent and 85.08 seconds at eight space indent. Correct answers ranged from 55 percent to 77 percent across the four indentation levels. A five minute time limit was set per task and no participant exceeded it. | https://www.infosun.fim.uni-passau.de/publications/docs/Bauer19.pdf |
| code-morzeck-2023-indentation-controlflow.pdf | Morzeck Hanenberg Werger and Gruhn ICSOFT 2023 "Indentation in Source Code: A Randomized Control Trial on the Readability of Control Flows in Java Code with Large Effects" | Participants required on average 179 percent more time to answer questions on non-indented nested if code than on indented code. Some task variants required between 142 percent and 269 percent more time on non-indented code. | https://drive.google.com/uc?export=download&id=1UACm8yWCVVdghZw9m6x79fivRzixDubs |
| code-abdelsalam-2025-comments-eye-tracking.pdf | Abdelsalam Peitek Bergum and Apel Empirical Software Engineering 2026 "The Effect of Comments on Program Comprehension: An Eye-tracking Study" | Eye tracking study with 20 computer science students across 12 Java snippets shown with and without comments. The effect of comments on comprehension performance ranged from a 30 percent decrease to a 34 percent increase depending on the snippet. Comments accounted for up to 23 percent of all fixations and produced a more linear reading order. | https://www.se.cs.uni-saarland.de/publications/docs/APB+25.pdf |
| code-nguyen-2026-code-obfuscation-comprehension.pdf | Nguyen Le Lahnstein Coronado and Nguyen 2026 "The Effect of Code Obfuscation on Human Program Comprehension" | Output prediction task in Python and JavaScript under identifier renaming adversarial renaming and control flow obfuscation. Obfuscation increases response time and reduces prediction accuracy. Accuracy peaks in a moderate response time band and falls at the longest response times which the authors read as confusion rather than careful deliberation. | https://arxiv.org/pdf/2603.07668 |

#### Program comprehension experiments and task duration

| File | Citation | Numbers supplied | URL |
| --- | --- | --- | --- |
| code-burkhardt-2002-oo-program-comprehension.pdf | Burkhardt Détienne and Wiedenbeck Empirical Software Engineering 2002 "Object-Oriented Program Comprehension: Effect of Expertise Task and Phase" | Each session lasted about 4 hours. Participants studied the program for 35 minutes in phase 1. Comprehension questionnaires were capped at 45 minutes. Individual questions were capped at 30 seconds. Phase 2 task performance was capped at 90 minutes. | https://arxiv.org/pdf/cs/0612004 |

#### Code review effort defect lifetime and file order

| File | Citation | Numbers supplied | URL |
| --- | --- | --- | --- |
| code-kononenko-2016-code-review-quality.pdf | Kononenko Baysal Guerrouj Cao and Godfrey ICSE 2016 "Code Review Quality: How Developers See It" | Analysis of 28127 Mozilla code reviews. 54 percent of reviewed changes that were approved still introduced a bug later attributed to that change. | https://plg.uwaterloo.ca/~migod/papers/2016/icse16.pdf |
| code-bosu-2015-useful-code-reviews-microsoft.pdf | Bosu Greiler and Bird ICSE SEIP 2015 "Characteristics of Useful Code Reviews: An Empirical Study at Microsoft" | Survey and comment classification study at Microsoft with over 50000 employees at the company at the time of survey. The proportion of useful review comments from a reviewer rises sharply in that reviewer's first year then plateaus. More files in a change lowers the proportion of comments that the change author finds useful. | https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf |
| code-dibiase-2019-change-decomposition-code-review.pdf | Di Biase Bruntink van Deursen and Bacchelli PeerJ Computer Science 2019 "The effects of change decomposition on code review a controlled experiment" | Controlled experiment with 28 professional and graduate student developers reviewing pull requests. Mean time to address the first defect was about 14 percent faster when the change was decomposed than when it was not. Decomposition did not significantly change overall defect lifetime or the count of defects found. | https://arxiv.org/pdf/1805.10978 |
| code-fregnan-2022-file-position-code-review.pdf | Fregnan Braz D'Ambros Çalikli and Bacchelli ESEC FSE 2022 "First Come First Served: The Impact of File Position on Code Review" | Mined 219476 pull requests from 138 Java projects on GitHub. Files shown earlier in a pull request receive more review comments than files shown later. In a 106 participant controlled experiment reviewers had 64 percent lower odds of identifying a seeded defect when its file was shown last rather than first. | https://arxiv.org/pdf/2208.04259 |
| not downloadable | Papotti Tuma and Massacci Empirical Software Engineering 2025 "On the effects of program slicing for vulnerability detection during code inspection" DOI 10.1007/s10664-025-10636-y | Multi year controlled experiment 2017 to 2023 with 236 MSc students given a maximum of 100 minutes per session and about 25 minutes per vulnerability assessment after 1.5 hours of training. Probability of finding the exact vulnerable line was 29 percent on the original file against 61 percent on the sliced file. Probability of finding the vulnerable area was 42 percent on the original file against 71 percent on the sliced file. | https://doi.org/10.1007/s10664-025-10636-y |

#### Reviewing machine generated code and industry telemetry

| File | Citation | Numbers supplied | URL |
| --- | --- | --- | --- |
| code-becker-2025-metr-ai-developer-productivity.pdf | Becker and colleagues METR 2025 "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity" | Randomised controlled trial with 16 experienced open source developers completing 246 tasks averaging 2 hours each in codebases they already knew. Developers were 19 percent slower on tasks where AI tool use was allowed than on tasks where it was not. Developers had expected AI to speed them up by 24 percent and still believed after the study that it had sped them up by 20 percent. | https://metr.org/Early_2025_AI_Experienced_OS_Devs_Study-paper.pdf |
| code-he-2025-cursor-speed-quality-complexity.pdf | He Miller Agarwal Kästner and Vasilescu Carnegie Mellon University MSR 2026 "Speed at the Cost of Quality: How Cursor AI Increases Short-Term Velocity and Long-Term Complexity in Open-Source Projects" | Difference in differences study of 807 GitHub repositories that adopted Cursor each matched against a similar repository that did not. Static analysis warnings rose about 30 percent and code complexity rose about 41.6 percent after adoption and both stayed elevated for the rest of the study period. Lines added rose 3 to 5 times in the first month then faded within two months while the quality effect did not fade. | https://arxiv.org/pdf/2511.04427 |
| code-adalsteinsson-2025-llm-code-review-wirelesscar.pdf | Aðalsteinsson Magnússon Milicevic Davidsson and Cheng ESEM 2025 industry track "Rethinking Code Review Workflows with LLM Assistance: An Empirical Study" | Field study and field experiment at WirelessCar Sweden AB. Interviews continued to a seventh interview at which point thematic saturation was reached. Named challenges include frequent context switching insufficient contextual information reviewer fatigue and inconsistent review depth. | https://arxiv.org/pdf/2505.16339 |
| code-gitclear-2025-ai-copilot-code-quality.pdf | GitClear 2025 "AI Copilot Code Quality" report | Analysis of commit data over 2020 to 2024. Copy pasted lines rose from 8.3 percent of changed lines in 2020 to 12.3 percent in 2024. Moved that is refactored lines fell from 24.1 percent in 2020 to 9.5 percent in 2024. Churn defined as code revised within two weeks of being written rose from 3.1 percent in 2020 to 5.7 percent in 2024. 2024 was the first year on record in which copy pasted line count exceeded moved line count. | https://gitclear-public.s3.us-west-2.amazonaws.com/GitClear-AI-Copilot-Code-Quality-2025.pdf |
| code-faros-2026-ai-acceleration-whiplash.pdf | Faros AI 2026 "The AI Engineering Report 2026: The Acceleration Whiplash" | Telemetry drawn from two years of data across 22000 developers and 4000 teams on the Faros platform comparing each organisation's lowest and highest periods of AI adoption. Median time to first pull request review rose 156.6 percent. Median time in pull request review rose 441.5 percent with a 199.6 percent rise in the mean. 31 percent more pull requests merged with no review at all. | https://pages.faros.ai/hubfs/AI_Engineering_Report_2026_The_Acceleration_Whiplash_Faros.pdf |

#### Not downloadable

Basili and Perricone 1984 is now held. See `code-basili-1984-software-errors-and-complexity.pdf`. The file is a 300 dpi scan with no text layer so `text/` holds a note rather than a transcript. Reading the pages settles a misattribution that runs through the inspection literature. The paper contains no inspection rate and no lines per hour and no fault detection rate. It is a change data study of about 90000 lines of Fortran in the NASA Software Engineering Laboratory over 33 months. Table VII gives errors per 1000 executable lines against module size in lines. The values are 16.0 at module size 50 and 12.6 at 100 and 12.4 at 150 and 7.6 at 200 and 6.4 above 200. Those are the numbers that the secondary literature restates as 1.6 percent falling to 0.6 percent while relabelling the module size axis as an inspection rate in lines per hour. The paper concludes the opposite of what the relabelled version implies. Its words are that module size did not account for error proneness and that the larger the module the less error prone it was.

Rodeghero Liu McBurney and McMillan IEEE Transactions on Software Engineering 2015 "An Eye-Tracking Study of Java Programmers and Application to Source Code Summarization" DOI 10.1109/TSE.2015.2416533. Three attempts were made against ACM Digital Library the author's Notre Dame www3 page and the author's Notre Dame academicweb page and all were blocked. Secondary reporting of this study gives an average of 26.54 seconds of gaze time per Java method with an average of 94.92 fixations per method and an average fixation duration of 0.114 seconds during summarisation.

Hanenberg Morzeck and Gruhn Empirical Software Engineering 2024 "Indentation and reading time: a randomized control trial on the differences between generated indented and non-indented if-statements" DOI 10.1007/s10664-024-10531-y. Three attempts were made against Springer direct and two ResearchGate URLs and all were blocked. This is the replication of the ICSOFT 2023 Morzeck study held above as code-morzeck-2023-indentation-controlflow.pdf. Secondary reporting gives a 113 percent increase in reading time for non-indented code in this replication against the 179 percent figure in the original.

Saddler Peterson Peachock and Sharif 2019 "Reading Behavior and Comprehension of C++ Source Code - A Classroom Study" in Augmented Cognition Springer DOI 10.1007/978-3-030-22419-6_43. Three attempts were made against ResearchGate an Academia.edu guessed link and the author's Academia.edu profile and all were blocked. Secondary reporting describes a classroom eye tracking study with 17 students split into 12 novice first year undergraduates and 5 non-novice masters students answering one comprehension question per program across 13 C++ programs. No numeric comprehension time or accuracy figure could be confirmed from an accessible source so no such figure is claimed here.

### Part two. Human reading and comprehension speed


This manifest extends `index.md`. It does not repeat Brysbaert 2019 or Primativo 2016 or Rayner 2016 "So Much to Read So Little Time" because those three are already held. Every number below was checked against the downloaded file itself either by grep against the plain text copy in `text/` or by opening the PDF. Every citation below was checked against a Crossref record. Two figures found during the search turned out to be misattributed by an earlier pass and have been corrected here. Gould and colleagues 1987 not Ziefle 1998 is the paper behind the CRT proofreading figures. Piolat and colleagues is dated 2004 not 2005. The prose in this file follows the project grammar rules. British English. No commas. One statement per sentence.

#### Reading rate by age and by grade

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-pinnell-1995-naep-oral-reading-fluency.pdf | Pinnell and colleagues 1995 National Assessment of Educational Progress oral reading study | Fourth grade mean 119 wpm on the full passage. 61 percent of fourth graders scored at the two higher fluency levels. | https://files.eric.ed.gov/fulltext/ED378550.pdf |
| read-daane-2005-naep-fourth-grade-oral-reading.pdf | Daane and colleagues 2005 National Center for Education Statistics report 2006-469 | Fourth grade average reading rate 119 wpm across the full passage and 198 words read in 105 wpm during the first minute. | https://nces.ed.gov/nationsreportcard/pdf/studies/2006469.pdf |
| read-hiebert-2012-silent-reading-rates.pdf | Hiebert Samuels and Rasinski 2014 TextProject article series (file is named 2012 on disk the paper itself is dated February 2014) | Silent reading rate rises roughly 10 to 20 wpm per school grade. College silent reading fell from about 280 wpm in 1960 to about 190 wpm now. Explicit rate training can raise silent reading to about 480 wpm. | https://textproject.org/paper/comprehension-based-silent-reading-rates |
| read-hasbrouck-2017-oral-reading-fluency-norms.pdf | Hasbrouck and Tindal 2017 Behavioral Research and Teaching Technical Report 1702 | Grade 4 fall 50th percentile 94 words correct per minute. Grade 6 spring 90th percentile 204 words correct per minute. | https://brt.uoregon.edu/wp-content/uploads/2017/03/ORF_2017_Technical-Report.pdf |
| read-liu-2017-age-crowding-reading-speed.pdf | Liu Patel and Kwon 2017 Scientific Reports | Younger adults 570.95 wpm standard error 29.03. Older adults 401.30 wpm standard error 21.03. | https://doi.org/10.1038/s41598-017-08652-0 |

#### Individual variation and dyslexia

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-hawelka-2015-fast-and-slow-readers.pdf | Hawelka and colleagues 2015 Scientific Reports | Self selected slow readers 138 wpm. Self selected fast readers 303 wpm. | https://doi.org/10.1038/srep08432 |
| read-jordan-2016-fast-slow-readers-spatial-frequency.pdf | Jordan Dixon McGowan Kurtev and Paterson 2016 Frontiers in Psychology | Fast readers 325 to 443 wpm depending on spatial filtering. Slow readers 226 to 318 wpm under the same filtering. | https://doi.org/10.3389/fpsyg.2016.01433 |
| read-gerth-2021-slow-and-fast-young-readers.pdf | Gerth and Festman 2021 Frontiers in Communication | 101 children mean 111.4 wpm standard deviation 30.9. Slow readers defined below 100 wpm. Fast readers defined above 125 wpm. | https://doi.org/10.3389/fcomm.2021.743113 |
| read-conforti-2024-dyslexia-reading-speed.pdf | Conforti and colleagues 2024 Scientific Reports | One minute reading test 56.5 wpm standard deviation 16.8 for dyslexic readers against 102.4 wpm standard deviation 12.7 for controls. A separate syllable timed test gave 0.41 seconds per syllable standard deviation 0.15 for dyslexic readers against 0.21 seconds standard deviation 0.02 for controls. | https://doi.org/10.1038/s41598-024-52330-x |
| read-mousinho-2026-dyslexia-intervention-wpm.pdf | Mousinho and colleagues 2026 Frontiers in Pediatrics | Dyslexia group rose from 37.0 to 55.1 wpm after intervention. ADHD group rose from 56.9 to 79.8 wpm after the same intervention. | https://doi.org/10.3389/fped.2026.1737520 |
| read-schneps-2013-e-readers-dyslexia.pdf | Schneps and colleagues 2013 PLOS ONE | Short line self paced display raised reading speed by 27 percent for high school students with dyslexia with no loss of comprehension against a longer line tablet display. | https://doi.org/10.1371/journal.pone.0075634 |

#### Reading in a second language

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-shimono-2018-l2-reading-fluency.pdf | Shimono 2018 Reading in a Foreign Language 30(1) | Timed reading group rose 141 to 214 wpm over the study. Untrained comparison groups rose far less over the same period. | https://doi.org/10.64152/10125/66743 |
| read-kramer-2019-l2-reading-rate-character-based.pdf | Kramer and McLean 2019 Reading in a Foreign Language 31(2) | 27 Japanese learners of English took 129.29 seconds and 134.49 seconds on two timed passages of about 300 words each against a constant reference rate of 600 characters per minute. | https://doi.org/10.64152/10125/66930 |
| read-draper-2015-l2-oral-reading-fluency-rural.pdf | Draper and Spaull 2015 South African Journal of Childhood Education | 41 percent of rural grade 5 second language English readers scored below 40 words correct per minute. A benchmark of 90 to 100 words correct per minute is proposed for adequate comprehension. | https://doi.org/10.4102/sajce.v5i2.382 |
| read-spaull-2020-comprehension-iceberg-benchmarks.pdf | Spaull Pretorius and Mohohlwane 2020 South African Journal of Childhood Education | Comprehension threshold found at 51 words correct per minute in Northern Sotho and 31 in Xitsonga against a United States grade 3 median of 107 words correct per minute in English. | https://doi.org/10.4102/sajce.v10i1.773 |

#### Multilingual eye tracking corpora

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-cop-2017-geco-bilingual-eyetracking-corpus.pdf | Cop Dirix Drieghe and Duyck 2017 Behavior Research Methods | Ghent Eye Tracking Corpus of 14 monolinguals and 19 bilinguals reading a full novel selected to take about four hours. | https://doi.org/10.3758/s13428-016-0734-0 |
| read-siegelman-2025-meco-wave2-multilingual.pdf | Siegelman and colleagues 2025 Scientific Data | Multilingual Eye Movement Corpus wave 2 adds eye tracking data from 654 participants across 13 languages collected in 16 labs. | https://doi.org/10.1038/s41597-025-05453-3 |
| read-trauzettel-klosinski-2012-irest-17-languages.pdf | Trauzettel-Klosinski and Dietz 2012 Investigative Ophthalmology and Visual Science | International Reading Speed Texts mean across 17 languages 184 wpm standard deviation 29. | https://doi.org/10.1167/iovs.11-8284 |
| read-lamoureux-2023-irest-canadian-cohort.pdf | Lamoureux Yeo and Bhambhwani 2023 Cureus | Canadian cohort of 112 adult readers scored 211 wpm standard deviation 33 against the international reading speed texts standard of 236 wpm standard deviation 29. | https://doi.org/10.7759/cureus.38196 |
| read-nachtnebel-2024-norwegian-irest.pdf | Nachtnebel and Falkenberg 2024 Scandinavian Journal of Optometry and Visual Science | Norwegian validation of the international reading speed texts gave a spread of 18.8 wpm across the ten texts with the fastest text at 215 wpm. | https://doi.org/10.15626/sjovs.v17i1.4102 |

#### Screen against paper

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-delgado-2018-printed-books-vs-screens.pdf | Delgado Vargas Ackerman and Salmeron 2018 Educational Research Review | Meta-analysis of 171055 participants. Paper advantage Hedges g minus 0.21 with 95 percent confidence interval minus 0.28 to minus 0.14. | https://doi.org/10.1016/j.edurev.2018.09.003 |
| read-hermena-2017-tablet-versus-paper-arabic.pdf | Hermena and colleagues 2017 Frontiers in Psychology | Arabic passage reading took 255.2 seconds on paper against 262.5 seconds on tablet with no significant difference. Comprehension 96.5 percent in both conditions. | https://doi.org/10.3389/fpsyg.2017.00257 |

#### Note taking and studying

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-mueller-2014-longhand-versus-laptop-notes.pdf | Mueller and Oppenheimer 2014 Psychological Science | Longhand note takers wrote 173.4 words standard deviation 70.7 per lecture. Laptop note takers wrote 309.6 words standard deviation 116.5 per lecture. Laptop notes showed 14.6 percent verbatim overlap with the lecture and scored worse on delayed recall. | https://doi.org/10.1177/0956797614524581 |

#### Speed reading under controlled test

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-miyata-2012-japanese-speed-reading.pdf | Miyata and colleagues 2012 PLOS ONE | Untrained readers 1236.6 characters per minute at 83.8 percent accuracy. Trainees after a speed reading course 2600.2 characters per minute at 68.1 percent accuracy. One expert reader 5644.0 characters per minute at 77.5 percent accuracy against an untrained control at 1193.4 characters per minute and 84.9 percent accuracy. | https://doi.org/10.1371/journal.pone.0036091 |
| read-klimovich-2023-speed-reading-training-wpm-data.csv | Klimovich Tiffin-Richards and Richter 2023 Journal of Research in Reading (paper paywalled the per participant data below is the open dataset underlying the paper and the means are computed here from that data) | 30 participants in three arms all starting near 193 wpm. App based speed reading training arm rose 193.1 to 237.1 wpm. Metacognitive training arm rose 193.8 to 224.5 wpm. Control arm rose 193.5 to 194.8 wpm. | https://doi.org/10.1111/1467-9817.12417 |

#### Eye movement norms

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-rayner-1998-eye-movements-20-years.pdf | Rayner 1998 Psychological Bulletin (this is the 20 year review it is a different paper from the 2016 Rayner source already held) | Silent reading mean fixation 225 milliseconds and mean saccade 2 degrees. Oral reading mean fixation 275 milliseconds and mean saccade 1.5 degrees. Regressions occur on 10 to 15 percent of saccades. Ten skilled readers averaged 308 wpm with a range of 230 to 382 wpm. | https://doi.org/10.1037/0033-2909.124.3.372 |
| read-strandberg-2023-eye-movements-young-readers.pdf | Strandberg Nilsson Östberg and Öqvist Seimyr 2023 Frontiers in Education | Grade 1 sample mean fixation 519 milliseconds standard deviation 185. Grade 2 sample mean fixation 349 milliseconds standard deviation 102. | https://doi.org/10.3389/feduc.2023.1077882 |

#### Subtitle and caption reading rate

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-bisson-2014-subtitle-eye-tracking.pdf | Bisson Van Heuven Conklin and Tunney 2014 Applied Psycholinguistics | Normalised fixations per word 0.92 for intralingual subtitles against 0.59 for the reversed language condition. | https://doi.org/10.1017/S0142716412000434 |
| read-szarkowska-2018-fast-subtitles-eye-movements.pdf | Szarkowska and Gerber-Moron 2018 PLOS ONE | 74 viewers tested at 12 16 and 20 characters per second. Comprehension held steady across those speeds. Comprehension was 80 percent for a clip in an unfamiliar language soundtrack against 88 percent for a familiar language soundtrack. | https://doi.org/10.1371/journal.pone.0199331 |
| read-jensema-1999-caption-speed-comprehension.html | Jensema and Burch 1999 Described and Captioned Media Program (formerly Caption Center) research report | Median television caption speed 141 wpm in 1996 and 145 wpm in 1998. Viewers reported the most comfortable caption speed near 220 wpm. | https://dcmp.org/learn/135 |
| read-schneider-2024-caption-speed-childrens-tv.html | Schneider 2024 First Monday | 337 episodes of children's television sampled. Captions for the 8 to 11 age band averaged 116.3 wpm. Captions for the older band averaged 135.2 wpm. | https://doi.org/10.5210/fm.v29i5.13301 |

#### Listening and time compressed speech

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-sticht-1972-time-compressed-listening.pdf | Sticht 1972 Human Resources Research Organization report on time compressed speech | Normal speech comprehension held at 165 wpm. Comprehension held to 206 wpm at 20 percent compression and to 275 wpm at 40 percent compression. Comprehension began to fall past about 300 wpm. | https://files.eric.ed.gov/fulltext/ED066080.pdf |
| read-massoud-2026-time-compressed-speech.html | Massoud and El Khoury-Malhame 2026 BMC Psychology | Recall score 6.125 out of 9 standard deviation 1.471 at normal speed against 3.7 out of 9 standard deviation 1.843 at double speed. That is 68.1 percent against 41.1 percent. | https://doi.org/10.1186/s40359-026-04398-5 |
| read-song-2018-podcast-playback-speed.pdf | Song and colleagues 2018 Western Journal of Emergency Medicine | Quiz score mean 61.4 at 1.5 times speed against 72.7 at normal speed on one quiz with p value 0.0188. A second quiz in the same trial showed no significant difference. | https://doi.org/10.5811/westjem.2017.10.36027 |
| read-rodriguez-2026-playback-speed-comprehension.pdf | Rodriguez and colleagues 2026 Frontiers in Education | 328 participants tested at 1.0 1.5 and 2.0 times speed. Perceived clarity fell at 2.0 times speed with beta minus 0.311 p less than 0.001. Objective comprehension showed no significant effect of speed. | https://doi.org/10.3389/feduc.2026.1790320 |

#### What happens to comprehension as speed rises

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-carver-1997-rauding-gears.pdf | Carver 1997 "Reading For One Second One Minute Or One Year" in Scientific Studies of Reading (published version of the gears model) | Five reading gears. Scanning 600 wpm. Skimming 450 wpm. Rauding 300 wpm. Learning 200 wpm. Memorising 138 wpm. Comprehension is reported to hold only at the rauding gear and below. | https://readinghalloffame.org/sites/default/files/carver_97.pdf |
| read-oconnor-2018-how-fast-is-fast-enough.pdf | O'Connor 2017 (print 2018) Journal of Learning Disabilities | Faster reading improved comprehension only between 35 and 75 words correct per minute in grade 2 and only between 40 and 90 words correct per minute in grade 4 for struggling readers. Rate gains above those bands gave no further comprehension gain. | https://doi.org/10.1177/0022219417691835 |

#### Proofreading and editing rates

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| read-panko-proofreading-error-rates.html | Panko "Human Error in Proofreading for Spelling Errors" research synthesis page University of Hawaii (draws on peer reviewed proofreading experiments including Haber and Schindler 1981 listed below) | Proofreaders caught 81 percent of nonword spelling errors and only 66 percent of word spelling errors when working alone. | http://panko.com/HumanErr/Proof.html |
| read-efa-2026-editorial-rates.html | Editorial Freelancers Association 2026 rate chart survey of its membership (professional association survey not peer reviewed kept here because peer reviewed proofreading throughput data could not be found) | Over 1100 respondents. Academic humanities copyediting throughput 5.0 to 8.5 pages per hour at 250 words per page. Academic STEM copyediting throughput 5.0 to 8.0 pages per hour. | https://www.the-efa.org/rates/ |

#### Not downloadable

| File | Citation | Numbers | URL |
| --- | --- | --- | --- |
| not downloadable | Kuperman Kyröläinen Porretta Brysbaert and Yang 2021 Journal of Experimental Psychology Human Perception and Performance DOI 10.1037/xhp0000932 | Reported finding is that the most efficient listening rate and the most efficient reading rate are highly similar. Publisher blocked every download attempt. | https://doi.org/10.1037/xhp0000932 |
| not downloadable | Piolat Olive and Kellogg 2004 Applied Cognitive Psychology "Cognitive effort during note taking" DOI 10.1002/acp.1086 | Note taking is reported to demand less cognitive effort than composing original text while still loading working memory heavily. No wpm figure could be confirmed from the abstract alone. | https://doi.org/10.1002/acp.1086 |
| not downloadable | Peverly Vekaria Reddington Sumowski Johnson and Ramsay 2013 Applied Cognitive Psychology | Paper concerns handwriting speed as a predictor of lecture note taking quality and test performance in college students. Publisher blocked every download attempt. | https://doi.org/10.1002/acp.2881 |
| not downloadable | Haber and Schindler 1981 Journal of Experimental Psychology Human Perception and Performance "Error in proofreading evidence of syntactic control of letter processing" | This is the primary study behind the 81 percent and 66 percent detection rates reported on the Panko page above. Publisher blocked every download attempt. | https://doi.org/10.1037/0096-1523.7.3.573 |
| not downloadable | Gould Alfaro Barnes Finn Grischkowsky and Minuto 1987 Human Factors "Reading is slower from CRT displays than from paper" | Secondary sources attribute reading rates near 201 wpm on paper against 182 wpm on a high resolution CRT and 179 wpm on a low resolution CRT to this paper. This could not be confirmed against the full text because the publisher blocked every download attempt and an earlier search pass had wrongly attributed the same figures to Ziefle 1998 which is a different paper about display resolution and visual performance in general. | https://doi.org/10.1177/001872088702900303 |
| not downloadable | Gould and Grischkowsky 1984 Human Factors "Doing the same work with hard copy and with cathode ray tube computer terminals" | Companion study to the 1987 Gould paper above covering proofreading on paper against CRT terminals. Publisher blocked every download attempt. | https://doi.org/10.1177/001872088402600308 |
| not downloadable | Layes Lalonde and Rebaï 2014 (print 2015) Dyslexia "Reading speed and phonological awareness deficits among Arabic speaking children with dyslexia" | Title states reading speed is measured directly against phonological awareness in Arabic speaking dyslexic children. Publisher blocked every download attempt. | https://doi.org/10.1002/dys.1491 |
| not downloadable | Masson and Waldron 1994 Applied Cognitive Psychology "Comprehension of legal contracts by non-experts effectiveness of plain language redrafting" | Only source found anywhere in this search that measures comprehension of legal text against a plain language redraft. Publisher blocked every download attempt. | https://doi.org/10.1002/acp.2350080107 |
| not downloadable | de Chambrier Pedrotti Ruggeri Dewi Atzemian Thevenot Martinet and Terrier 2023 Acta Psychologica "Reading numbers is harder than reading words an eye tracking study" | Only source found anywhere in this search that measures reading of numerals against number words with eye tracking. Publisher blocked every download attempt. | https://doi.org/10.1016/j.actpsy.2023.103942 |

#### Dead ends

No peer reviewed words per minute figure exists for reading legal or mathematical or scientific text as a category on its own. The two papers found for that ground either measure recall after a redraft (Masson and Waldron) or measure fixation counts rather than a rate (de Chambrier). No peer reviewed wpm figure exists for proofreading throughput either. The only quantified proofreading throughput found is the Editorial Freelancers Association member survey which is not peer reviewed. Queries built around "legal text reading speed comprehension" and "mathematical notation reading rate wpm" and "scientific article reading speed study" returned nothing usable. Direct guesses at ERIC and university mirror URLs for several blocked papers mostly returned 404. Publisher domains that blocked every attempt in this search include Sage Springer Wiley Elsevier Cambridge Hogrefe Taylor and Francis MDPI HAL PMC and ResearchGate. A BBC subtitle style guide and a Netflix subtitle style guide were both found and both downloaded and both were rejected from this manifest because neither cites the research behind its stated word rate limit. A National Court Reporters Association certification page was found and downloaded and was rejected because it measures stenographic transcription speed rather than reading speed.

## Held but not used

These three files were downloaded during the broad search and then rejected. They stay on disk so the rejection is checkable.

| File | Reason |
| --- | --- |
| read-bbc-subtitle-guidelines.html | States a word rate limit without citing the research behind it. |
| read-netflix-timed-text-style-guide.html | States a character rate limit without citing the research behind it. |
| read-ncra-reporter-certification-speeds.html | Measures stenographic transcription speed rather than reading speed. |
