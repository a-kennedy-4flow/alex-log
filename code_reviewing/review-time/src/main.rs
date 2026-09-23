//! Approximate how long a code review will take.
//!
//! Reads a unified diff from standard input or asks git for one. The model and its sources are in `model.rs`.

use review_time::model::{Depth, Estimate};
use review_time::{diff, lang, model};
use std::io::{IsTerminal, Read};
use std::process::Command;

const USAGE: &str = "\
review-time — approximate how long a code review will take

USAGE
    review-time [options] [git diff arguments]
    git diff | review-time [options]

OPTIONS
    -d --depth <level>   inspection | standard | fast | skim   (default standard)
       --json            machine readable output
    -h --help            this text

EXAMPLES
    review-time                     estimate the working tree against HEAD
    review-time main...HEAD         estimate a branch
    review-time --depth inspection  estimate a careful read of the working tree
    git show abc123 | review-time   estimate one commit
";

fn main() {
    let mut depth = Depth::Standard;
    let mut json = false;
    let mut git_args: Vec<String> = Vec::new();
    let mut args = std::env::args().skip(1);

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                print!("{USAGE}");
                return;
            }
            "--json" => json = true,
            "-d" | "--depth" => {
                let Some(name) = args.next() else {
                    fail("--depth needs a level. Try standard.");
                };
                let Some(parsed) = Depth::from_name(&name) else {
                    fail(&format!("{name} is not a depth. Try inspection or standard or fast or skim."));
                };
                depth = parsed;
            }
            other => git_args.push(other.to_string()),
        }
    }

    let input = read_diff(&git_args);
    if input.trim().is_empty() {
        println!("No change to review.");
        return;
    }

    let files = diff::parse(&input);
    let estimate = model::estimate(&files, depth);

    if json {
        println!("{}", as_json(&estimate));
    } else {
        print!("{}", as_report(&estimate));
    }
}

fn fail(message: &str) -> ! {
    eprintln!("review-time: {message}");
    std::process::exit(2);
}

/// A pipe wins even when it is empty. Otherwise git is asked.
///
/// Because a pipe means the caller already chose what to estimate an empty one
/// is an answer rather than a reason to go and find a different diff.
fn read_diff(git_args: &[String]) -> String {
    if !std::io::stdin().is_terminal() {
        let mut buffer = String::new();
        if std::io::stdin().read_to_string(&mut buffer).is_ok() {
            return buffer;
        }
    }

    let mut command = Command::new("git");
    command.arg("diff");
    if git_args.is_empty() {
        command.arg("HEAD");
    } else {
        command.args(git_args);
    }

    match command.output() {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).into_owned(),
        Ok(out) => fail(String::from_utf8_lossy(&out.stderr).trim()),
        Err(error) => fail(&format!("git could not be run. {error}")),
    }
}

fn duration(minutes: f64) -> String {
    let whole = minutes.round().max(1.0) as u64;
    if whole < 60 {
        format!("{whole} min")
    } else {
        format!("{} h {:02} min", whole / 60, whole % 60)
    }
}

fn as_report(estimate: &Estimate) -> String {
    let mut out = String::new();
    out.push_str("\nReview time estimate\n\n");
    out.push_str(&row("depth", &format!("{} at {:.0} lines per hour", estimate.depth.label(), estimate.depth.lines_per_hour())));
    out.push_str(&row("files reviewed", &estimate.reviewed_files.to_string()));
    out.push_str(&row("lines added", &estimate.added.to_string()));
    out.push_str(&row("lines deleted", &estimate.removed.to_string()));
    out.push_str(&row("effective lines", &format!("{:.0}", estimate.effective_lines)));
    if estimate.prose_words > 0.0 {
        out.push_str(&row("prose words", &format!("{:.0} at {:.0} words per minute", estimate.prose_words, estimate.depth.words_per_minute())));
    }
    out.push_str(&row("overhead", &duration(estimate.overhead_minutes)));
    out.push('\n');
    out.push_str(&row("estimate", &format!("{}   (range {} to {})", duration(estimate.minutes), duration(estimate.low_minutes), duration(estimate.high_minutes))));
    out.push_str(&row("sittings", &estimate.sittings.to_string()));

    let skipped: Vec<&model::FileEstimate> = estimate.files.iter().filter(|f| f.skipped.is_some()).collect();
    if !skipped.is_empty() {
        out.push_str("\nNot read\n");
        for file in skipped {
            out.push_str(&format!("  {}  ({})\n", file.path, file.skipped.unwrap_or("skipped")));
        }
    }

    let mut costly: Vec<&model::FileEstimate> = estimate.files.iter().filter(|f| f.skipped.is_none()).collect();
    costly.sort_by(|a, b| b.minutes.total_cmp(&a.minutes));
    if costly.len() > 1 {
        out.push_str("\nHeaviest files\n");
        for file in costly.iter().take(5) {
            let mut note = String::new();
            if file.naming_multiplier > 1.05 {
                note.push_str(&format!("  naming {:.2}x", file.naming_multiplier));
            }
            if file.indent_multiplier > 1.0 {
                note.push_str(&format!("  indentation {:.1}x", file.indent_multiplier));
            }
            let size = match file.kind {
                lang::Kind::Prose => format!("{:.0} words", file.prose_words),
                _ => format!("{:.0} lines", file.effective_lines),
            };
            out.push_str(&format!("  {:>9}  {:>12}  {}{}\n", duration(file.minutes), size, file.path, note));
        }
    }

    if !estimate.warnings.is_empty() {
        out.push_str("\nWarnings\n");
        for warning in &estimate.warnings {
            out.push_str(&format!("  - {warning}\n"));
        }
    }

    out.push_str("\nThe range is wide because change size explains little of review time. See ../reading-speed.md\n");
    out
}

fn row(label: &str, value: &str) -> String {
    format!("  {label:<18}{value}\n")
}

fn as_json(estimate: &Estimate) -> String {
    let files: Vec<String> = estimate
        .files
        .iter()
        .map(|file| {
            format!(
                "{{\"path\":\"{}\",\"effective_lines\":{:.2},\"prose_words\":{:.2},\"naming_multiplier\":{:.3},\"indent_multiplier\":{:.3},\"minutes\":{:.2},\"skipped\":{}}}",
                escape(&file.path),
                file.effective_lines,
                file.prose_words,
                file.naming_multiplier,
                file.indent_multiplier,
                file.minutes,
                match file.skipped {
                    Some(reason) => format!("\"{reason}\""),
                    None => "null".to_string(),
                }
            )
        })
        .collect();
    let warnings: Vec<String> = estimate.warnings.iter().map(|w| format!("\"{}\"", escape(w))).collect();

    format!(
        "{{\"depth\":\"{}\",\"lines_per_hour\":{:.0},\"files_reviewed\":{},\"lines_added\":{},\"lines_deleted\":{},\"effective_lines\":{:.2},\"prose_words\":{:.2},\"overhead_minutes\":{:.2},\"minutes\":{:.2},\"low_minutes\":{:.2},\"high_minutes\":{:.2},\"sittings\":{},\"opaque_name_ratio\":{:.4},\"files\":[{}],\"warnings\":[{}]}}",
        estimate.depth.label(),
        estimate.depth.lines_per_hour(),
        estimate.reviewed_files,
        estimate.added,
        estimate.removed,
        estimate.effective_lines,
        estimate.prose_words,
        estimate.overhead_minutes,
        estimate.minutes,
        estimate.low_minutes,
        estimate.high_minutes,
        estimate.sittings,
        estimate.opaque_ratio,
        files.join(","),
        warnings.join(",")
    )
}

fn escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn durations_read_as_hours_past_sixty_minutes() {
        assert_eq!(duration(0.2), "1 min");
        assert_eq!(duration(47.4), "47 min");
        assert_eq!(duration(85.0), "1 h 25 min");
    }

    #[test]
    fn json_quotes_are_escaped() {
        assert_eq!(escape("a\"b\\c"), "a\\\"b\\\\c");
    }

    #[test]
    fn the_report_names_the_range_and_the_sittings() {
        let files = diff::parse("diff --git a/src/a.rs b/src/a.rs\n+++ b/src/a.rs\n@@ -0,0 +1,2 @@\n+let total = 1;\n+let other = 2;\n");
        let report = as_report(&model::estimate(&files, Depth::Standard));
        assert!(report.contains("estimate"));
        assert!(report.contains("range"));
        assert!(report.contains("sittings"));
    }

    #[test]
    fn json_output_parses_as_one_object() {
        let files = diff::parse("diff --git a/a.rs b/a.rs\n+++ b/a.rs\n@@\n+let q = 1;\n");
        let json = as_json(&model::estimate(&files, Depth::Fast));
        assert!(json.starts_with('{') && json.ends_with('}'));
        assert!(json.contains("\"depth\":\"fast\""));
        assert!(json.contains("\"sittings\":1"));
    }
}
