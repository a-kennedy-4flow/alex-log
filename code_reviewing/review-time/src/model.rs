//! The estimate model.
//!
//! Every constant traces to a measurement recorded in `../reading-speed.md`. The papers sit in `../knowledge_base/`.
//! The model is `minutes = overhead + work / rate` with a multiplier for the state of the diff. Because a) the Cisco data finds no single inspection rate and fits one reviewer at an R squared of 0.29 b) the correlation between change size and time to merge runs only from 0.20 to 0.37 across about 826000 pull requests and c) a review of one line ran past 15 minutes in that same data the output is a range and never a single number.

use crate::diff::FileChange;
use crate::lang::{self, Kind};

/// How carefully the code is being read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Depth {
    Inspection,
    Standard,
    Fast,
    Skim,
}

impl Depth {
    /// Wiegers puts formal inspection at 100 to 200 lines per hour. Cisco finds defect detection above average below 400 lines per hour and below average above 450. Anything past 1000 lines per hour is a skim.
    pub fn lines_per_hour(self) -> f64 {
        match self {
            Depth::Inspection => 150.0,
            Depth::Standard => 300.0,
            Depth::Fast => 500.0,
            Depth::Skim => 1000.0,
        }
    }

    pub fn lines_per_minute(self) -> f64 {
        self.lines_per_hour() / 60.0
    }

    /// Prose is read for recall at 93 to 147 words per minute. The middle of that band scales with the depth of the read.
    pub fn words_per_minute(self) -> f64 {
        match self {
            Depth::Inspection => 90.0,
            Depth::Standard => 120.0,
            Depth::Fast => 180.0,
            Depth::Skim => 300.0,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Depth::Inspection => "inspection",
            Depth::Standard => "standard",
            Depth::Fast => "fast",
            Depth::Skim => "skim",
        }
    }

    pub fn from_name(name: &str) -> Option<Depth> {
        match name.to_ascii_lowercase().as_str() {
            "inspection" | "formal" => Some(Depth::Inspection),
            "standard" | "normal" => Some(Depth::Standard),
            "fast" | "quick" => Some(Depth::Fast),
            "skim" | "triage" => Some(Depth::Skim),
            _ => None,
        }
    }
}

/// Loading the context of the change before any line is read.
const BASE_OVERHEAD_MINUTES: f64 = 5.0;
/// Orienting inside one more file.
const PER_FILE_MINUTES: f64 = 1.5;

/// A deleted line is checked for what it breaks rather than read for what it does. This weight is a judgement and not a measurement.
const DELETED_WEIGHT: f64 = 0.25;
/// A comment line carries intent the reviewer needs. Comments drew up to 23% of fixations in the eye tracking data.
const COMMENT_WEIGHT: f64 = 0.5;
/// A data file is sampled rather than read. This weight is a judgement and not a measurement.
const DATA_WEIGHT: f64 = 0.2;

/// Obfuscated identifiers cost 1.63x on the snippet task of Peitek 2020. Avidan 2017 measured far worse on a harder task. The lower figure is used.
const NAMING_MAX_MULTIPLIER: f64 = 1.6;
/// Below this share of opaque short names no penalty applies.
const NAMING_FLOOR_RATIO: f64 = 0.05;
/// At this share the full penalty applies.
const NAMING_CEILING_RATIO: f64 = 0.30;

/// Missing indentation on nested control flow cost 179% more time in Morzeck 2023 and 113% more in the 2024 replication. The replication is used.
const INDENT_MULTIPLIER: f64 = 2.1;

/// Reviewers stop finding defects after 60 minutes.
const SITTING_MINUTES: f64 = 60.0;
/// A reviewer will not cover more than 300 to 400 lines before performance drops.
const SITTING_LINES: f64 = 400.0;
/// Defect density falls away past this size.
const DENSITY_LIMIT_LINES: f64 = 200.0;
/// Past this rate defect density was below average in 87% of the Cisco reviews.
const DETECTION_LIMIT_PER_HOUR: f64 = 450.0;
/// One file this large cannot be held in a single sitting whatever the rest of the diff looks like.
const OVERSIZED_FILE_LINES: f64 = 1000.0;

/// Size explains little of the variance so the band is wide on both sides.
const RANGE_LOW: f64 = 0.5;
const RANGE_HIGH: f64 = 2.0;

#[derive(Debug, Clone)]
pub struct FileEstimate {
    pub path: String,
    pub kind: Kind,
    pub effective_lines: f64,
    pub prose_words: f64,
    pub naming_multiplier: f64,
    pub indent_multiplier: f64,
    pub minutes: f64,
    pub skipped: Option<&'static str>,
}

#[derive(Debug, Clone)]
pub struct Estimate {
    pub depth: Depth,
    pub files: Vec<FileEstimate>,
    pub reviewed_files: usize,
    pub added: usize,
    pub removed: usize,
    pub effective_lines: f64,
    pub prose_words: f64,
    pub overhead_minutes: f64,
    pub minutes: f64,
    pub low_minutes: f64,
    pub high_minutes: f64,
    pub sittings: usize,
    pub opaque_ratio: f64,
    pub warnings: Vec<String>,
}

pub fn estimate(files: &[FileChange], depth: Depth) -> Estimate {
    let mut out = Estimate {
        depth,
        files: Vec::new(),
        reviewed_files: 0,
        added: 0,
        removed: 0,
        effective_lines: 0.0,
        prose_words: 0.0,
        overhead_minutes: BASE_OVERHEAD_MINUTES,
        minutes: 0.0,
        low_minutes: 0.0,
        high_minutes: 0.0,
        sittings: 1,
        opaque_ratio: 0.0,
        warnings: Vec::new(),
    };

    let mut opaque_names = 0usize;
    let mut all_names = 0usize;
    let mut unindented: Vec<String> = Vec::new();
    let mut oversized: Vec<String> = Vec::new();

    for file in files {
        out.added += file.added.len();
        out.removed += file.removed.len();

        if let Some(reason) = skip_reason(file) {
            out.files.push(FileEstimate {
                path: file.path.clone(),
                kind: lang::kind(&file.path),
                effective_lines: 0.0,
                prose_words: 0.0,
                naming_multiplier: 1.0,
                indent_multiplier: 1.0,
                minutes: 0.0,
                skipped: Some(reason),
            });
            continue;
        }

        let kind = lang::kind(&file.path);
        let mut naming = 1.0;
        let mut indent = 1.0;
        let mut lines = 0.0;
        let mut words = 0.0;

        let minutes = match kind {
            Kind::Prose => {
                words = prose_words(file);
                PER_FILE_MINUTES + words / depth.words_per_minute()
            }
            Kind::Data | Kind::Code => {
                lines = effective_lines(file, kind);
                if kind == Kind::Code {
                    let (opaque, total) = name_counts(file);
                    opaque_names += opaque;
                    all_names += total;
                    naming = naming_multiplier(ratio(opaque, total));
                    if lacks_indentation(file) {
                        unindented.push(file.path.clone());
                        indent = INDENT_MULTIPLIER;
                    }
                }
                PER_FILE_MINUTES + lines / depth.lines_per_minute() * naming * indent
            }
        };

        if lines > OVERSIZED_FILE_LINES {
            oversized.push(file.path.clone());
        }

        out.reviewed_files += 1;
        out.effective_lines += lines;
        out.prose_words += words;
        out.minutes += minutes;
        out.files.push(FileEstimate {
            path: file.path.clone(),
            kind,
            effective_lines: lines,
            prose_words: words,
            naming_multiplier: naming,
            indent_multiplier: indent,
            minutes,
            skipped: None,
        });
    }

    out.minutes += out.overhead_minutes;
    out.low_minutes = out.minutes * RANGE_LOW;
    out.high_minutes = out.minutes * RANGE_HIGH;
    out.opaque_ratio = ratio(opaque_names, all_names);
    out.sittings = sittings(out.minutes, out.effective_lines);
    out.warnings = warnings(&out, &unindented, &oversized);
    out
}

fn skip_reason(file: &FileChange) -> Option<&'static str> {
    if file.binary {
        return Some("binary");
    }
    if lang::is_generated(&file.path) {
        return Some("generated");
    }
    None
}

fn line_weight(line: &str, path: &str) -> f64 {
    if lang::is_blank(line) {
        0.0
    } else if lang::is_comment(line, path) {
        COMMENT_WEIGHT
    } else {
        1.0
    }
}

fn effective_lines(file: &FileChange, kind: Kind) -> f64 {
    let added: f64 = file.added.iter().map(|l| line_weight(l, &file.path)).sum();
    let removed: f64 = file.removed.iter().map(|l| line_weight(l, &file.path)).sum();
    let total = added + removed * DELETED_WEIGHT;
    match kind {
        Kind::Data => total * DATA_WEIGHT,
        _ => total,
    }
}

fn prose_words(file: &FileChange) -> f64 {
    let added: usize = file.added.iter().map(|l| lang::word_count(l)).sum();
    let removed: usize = file.removed.iter().map(|l| lang::word_count(l)).sum();
    added as f64 + removed as f64 * DELETED_WEIGHT
}

fn name_counts(file: &FileChange) -> (usize, usize) {
    let mut opaque = 0;
    let mut total = 0;
    for line in &file.added {
        if lang::is_comment(line, &file.path) || lang::is_blank(line) {
            continue;
        }
        for name in lang::identifiers(line) {
            total += 1;
            if lang::is_opaque_short_name(&name) {
                opaque += 1;
            }
        }
    }
    (opaque, total)
}

fn ratio(part: usize, whole: usize) -> f64 {
    if whole == 0 {
        0.0
    } else {
        part as f64 / whole as f64
    }
}

fn naming_multiplier(opaque_ratio: f64) -> f64 {
    let span = NAMING_CEILING_RATIO - NAMING_FLOOR_RATIO;
    let above = (opaque_ratio - NAMING_FLOOR_RATIO).clamp(0.0, span);
    1.0 + (NAMING_MAX_MULTIPLIER - 1.0) * (above / span)
}

/// Nested lines that carry no leading whitespace.
fn lacks_indentation(file: &FileChange) -> bool {
    if lang::indentation_is_forced(&file.path) {
        return false;
    }
    let mut depth = 0i32;
    let mut nested = 0usize;
    let mut nested_with_whitespace = 0usize;

    for line in &file.added {
        if lang::is_blank(line) {
            continue;
        }
        let opens_here = lang::brace_delta(line);
        let closing_first = line.trim_start().starts_with(['}', ')', ']']);
        let level = if closing_first { depth - 1 } else { depth };
        if level >= 2 {
            nested += 1;
            if lang::leading_whitespace(line) > 0 {
                nested_with_whitespace += 1;
            }
        }
        depth = (depth + opens_here).max(0);
    }

    nested >= 5 && ratio(nested_with_whitespace, nested) < 0.2
}

fn sittings(minutes: f64, effective_lines: f64) -> usize {
    let by_time = (minutes / SITTING_MINUTES).ceil();
    let by_size = (effective_lines / SITTING_LINES).ceil();
    by_time.max(by_size).max(1.0) as usize
}

fn warnings(estimate: &Estimate, unindented: &[String], oversized: &[String]) -> Vec<String> {
    let mut out = Vec::new();

    if estimate.effective_lines > DENSITY_LIMIT_LINES {
        out.push(format!(
            "{:.0} effective lines is past the {:.0} line point where defect density falls away. Split the change.",
            estimate.effective_lines, DENSITY_LIMIT_LINES
        ));
    }
    if estimate.depth.lines_per_hour() > DETECTION_LIMIT_PER_HOUR {
        out.push(format!(
            "{} runs at {:.0} lines per hour. Above {:.0} the Cisco reviews were below average at finding defects in 87% of cases.",
            estimate.depth.label(),
            estimate.depth.lines_per_hour(),
            DETECTION_LIMIT_PER_HOUR
        ));
    }
    if estimate.sittings > 1 {
        out.push(format!(
            "Needs {} sittings. Reviewers stop finding defects after 60 minutes.",
            estimate.sittings
        ));
    }
    if estimate.reviewed_files > 5 {
        out.push(format!(
            "{} files. A defect in the last file was 64% less likely to be found than one in the first.",
            estimate.reviewed_files
        ));
    }
    if estimate.opaque_ratio > NAMING_FLOOR_RATIO {
        out.push(format!(
            "{:.0}% of the new identifiers are one or two opaque characters. Naming cost 1.6x on the snippet task.",
            estimate.opaque_ratio * 100.0
        ));
    }
    for path in unindented {
        out.push(format!("{path} has nested code without indentation. That cost 2.1x in the replication trial."));
    }
    for path in oversized {
        out.push(format!("{path} alone is past {:.0} effective lines. Review it on its own or exclude it.", OVERSIZED_FILE_LINES));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, added: &[&str], removed: &[&str]) -> FileChange {
        FileChange {
            path: path.to_string(),
            added: added.iter().map(|s| s.to_string()).collect(),
            removed: removed.iter().map(|s| s.to_string()).collect(),
            binary: false,
            new_file: false,
        }
    }

    #[test]
    fn overhead_dominates_a_one_line_change() {
        let files = vec![file("src/a.rs", &["    let total = compute_total();"], &[])];
        let out = estimate(&files, Depth::Standard);
        assert!(out.minutes > 6.0 && out.minutes < 8.0, "got {}", out.minutes);
        assert_eq!(out.sittings, 1);
    }

    #[test]
    fn blank_and_comment_lines_weigh_less_than_code() {
        let files = vec![file("src/a.rs", &["", "// explain the guard", "    let ready = true;"], &[])];
        assert_eq!(estimate(&files, Depth::Standard).effective_lines, 1.5);
    }

    #[test]
    fn deleted_lines_are_cheaper_than_added() {
        let line = "let value = compute(input);";
        let added = vec![file("src/a.rs", &[line; 100], &[])];
        let deleted = vec![file("src/a.rs", &[], &[line; 100])];
        assert!(estimate(&added, Depth::Standard).minutes > estimate(&deleted, Depth::Standard).minutes);
    }

    #[test]
    fn prose_is_costed_in_words_and_not_in_lines() {
        let sentence = "The reviewer reads this line of the design note carefully.";
        let prose = estimate(&[file("docs/plan.md", &[sentence; 120], &[])], Depth::Standard);
        let code = estimate(&[file("src/a.rs", &[sentence; 120], &[])], Depth::Standard);
        assert_eq!(prose.effective_lines, 0.0);
        assert_eq!(prose.prose_words, 1200.0);
        assert!(prose.minutes > 15.0 && prose.minutes < 18.0, "got {}", prose.minutes);
        assert!(code.effective_lines == 120.0);
    }

    #[test]
    fn data_files_are_sampled_rather_than_read() {
        let row = "{\"id\": 41, \"total\": 12}";
        let data = estimate(&[file("fixtures/orders.json", &[row; 100], &[])], Depth::Standard);
        assert_eq!(data.effective_lines, 20.0);
    }

    #[test]
    fn a_large_change_needs_more_than_one_sitting() {
        let lines = vec!["    let value = compute_value(input);"; 500];
        let out = estimate(&[file("src/a.rs", &lines, &[])], Depth::Standard);
        assert!(out.sittings >= 2, "got {}", out.sittings);
        assert!(out.warnings.iter().any(|w| w.contains("defect density")));
    }

    #[test]
    fn generated_and_binary_files_are_not_read() {
        let mut binary = file("logo.png", &[], &[]);
        binary.binary = true;
        let files = vec![file("pnpm-lock.yaml", &["  resolution: abc"; 900], &[]), binary];
        let out = estimate(&files, Depth::Standard);
        assert_eq!(out.reviewed_files, 0);
        assert_eq!(out.effective_lines, 0.0);
        assert!(out.files.iter().all(|f| f.skipped.is_some()));
    }

    #[test]
    fn opaque_names_raise_the_estimate() {
        let plain = vec![file("src/a.rs", &["    let customer_total = order_value + shipping_cost;"; 50], &[])];
        let opaque = vec![file("src/a.rs", &["    let q = w + e;"; 50], &[])];
        let plain_minutes = estimate(&plain, Depth::Standard).minutes;
        let opaque_minutes = estimate(&opaque, Depth::Standard).minutes;
        assert!(opaque_minutes > plain_minutes * 1.3, "{opaque_minutes} against {plain_minutes}");
    }

    #[test]
    fn the_naming_multiplier_is_bounded() {
        assert_eq!(naming_multiplier(0.0), 1.0);
        assert_eq!(naming_multiplier(1.0), NAMING_MAX_MULTIPLIER);
        assert!(naming_multiplier(0.175) > 1.2 && naming_multiplier(0.175) < 1.4);
    }

    #[test]
    fn missing_indentation_is_detected() {
        let flat = file(
            "src/a.rs",
            &["fn run(input: &str) {", "if ready(input) {", "for item in input.chars() {", "handle(item);", "count += 1;", "total += count;", "log(total);", "}", "}", "}"],
            &[],
        );
        assert!(lacks_indentation(&flat));

        let tidy = file(
            "src/a.rs",
            &["fn run(input: &str) {", "    if ready(input) {", "        for item in input.chars() {", "            handle(item);", "            count += 1;", "            total += count;", "            log(total);", "        }", "    }", "}"],
            &[],
        );
        assert!(!lacks_indentation(&tidy));
    }

    #[test]
    fn python_is_never_flagged_for_indentation() {
        assert!(!lacks_indentation(&file("run.py", &["def go():", "pass"], &[])));
    }

    #[test]
    fn depth_changes_the_time_but_not_the_lines() {
        let lines = vec!["    let value = compute_value(input);"; 300];
        let files = vec![file("src/a.rs", &lines, &[])];
        let slow = estimate(&files, Depth::Inspection);
        let quick = estimate(&files, Depth::Fast);
        assert!(slow.minutes > quick.minutes * 2.0);
        assert_eq!(slow.effective_lines, quick.effective_lines);
        assert!(quick.warnings.iter().any(|w| w.contains("below average")));
    }

    #[test]
    fn one_huge_file_is_called_out() {
        let out = estimate(&[file("src/a.rs", &["let value = compute(input);"; 1200], &[])], Depth::Standard);
        assert!(out.warnings.iter().any(|w| w.contains("on its own")));
    }

    #[test]
    fn the_range_brackets_the_estimate() {
        let out = estimate(&[file("src/a.rs", &["let value = 1;"; 40], &[])], Depth::Standard);
        assert!(out.low_minutes < out.minutes && out.minutes < out.high_minutes);
    }
}
