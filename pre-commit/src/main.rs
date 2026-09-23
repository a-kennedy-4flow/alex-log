//! A gate that only fires where it is asked to.
//!
//! Git runs this before the commit message is composed. A non-zero exit stops
//! the commit. Because a) a repo that is not listed exits zero without printing
//! anything b) a merge is left alone and c) a config that cannot be read is
//! reported and then ignored the hook stays out of the way of every repo it was
//! not set up for.

mod config;

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const CONFIG_NAME: &str = "pre-commit.conf";

fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let listing = arguments.iter().any(|argument| argument == "--list");

    let path = config_path();
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let (config, problems) = config::parse(&text);
    for problem in &problems.0 {
        eprintln!("pre-commit: {} in {}", problem, path.display());
    }
    for name in config.dangling() {
        eprintln!("pre-commit: no profile named {name} in {}", path.display());
    }

    let Some(root) = repo_root() else {
        return;
    };

    if listing {
        list(&config, &root, &path);
        return;
    }

    // A merge brings in work this gate never saw. Stopping it helps nobody.
    if Path::new(&root).join(".git/MERGE_HEAD").exists() {
        return;
    }

    let Some(profile) = config.profile_for(&root) else {
        return;
    };

    let places = places(&root, profile);
    if places.is_empty() {
        return;
    }

    println!("pre-commit: {} in {root}", profile.name);
    for place in &places {
        if place != &root {
            println!("  {}", place.trim_start_matches(&root).trim_start_matches('/'));
        }
        for command in &profile.commands {
            if !run(command, place) {
                eprintln!("\npre-commit: {} failed in {place}. The commit was stopped.", command.join(" "));
                eprintln!("pre-commit: to commit anyway use git commit --no-verify");
                std::process::exit(1);
            }
        }
    }
}

/// Where the commands run. A profile with no marker runs once at the root.
fn places(root: &str, profile: &config::Profile) -> Vec<String> {
    let Some(marker) = profile.marker.as_deref() else {
        return vec![root.to_string()];
    };
    let root = Path::new(root);
    let mut found: Vec<String> = Vec::new();
    for staged in staged_paths() {
        let Some(project) = nearest(root, &staged, marker, &|path| path.exists()) else {
            continue;
        };
        let project = project.to_string_lossy().into_owned();
        if !found.contains(&project) {
            found.push(project);
        }
    }
    found.sort();
    found
}

/// The first directory at or above a staged file that holds the marker.
///
/// The walk stops at the repository root so a marker outside the repo is never
/// picked up.
fn nearest(root: &Path, staged: &str, marker: &str, exists: &dyn Fn(&Path) -> bool) -> Option<PathBuf> {
    let mut here = root.join(staged);
    while here.pop() {
        if !here.starts_with(root) {
            return None;
        }
        if exists(&here.join(marker)) {
            return Some(here);
        }
        if here == root {
            return None;
        }
    }
    None
}

fn staged_paths() -> Vec<String> {
    let Ok(out) = Command::new("git")
        .args(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
        .stderr(Stdio::null())
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout).lines().map(str::to_string).collect()
}

fn config_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".config"));
    base.join("git").join("hooks").join(CONFIG_NAME)
}

fn repo_root() -> Option<String> {
    let out = Command::new("git")
        .args(["rev-parse", "--show-toplevel"])
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let root = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if root.is_empty() { None } else { Some(root) }
}

fn run(command: &[String], root: &str) -> bool {
    println!("  running: {}", command.join(" "));
    Command::new(&command[0])
        .args(&command[1..])
        .current_dir(root)
        .status()
        .map(|status| status.success())
        .unwrap_or_else(|error| {
            eprintln!("  {} could not be run. {error}", command[0]);
            false
        })
}

fn list(config: &config::Config, root: &str, path: &Path) {
    println!("config   {}", path.display());
    println!("repo     {root}");
    match config.profile_for(root) {
        Some(profile) => {
            println!("profile  {}", profile.name);
            if let Some(marker) = &profile.marker {
                println!("marker   {marker}");
                for place in places(root, profile) {
                    println!("  would run in {place}");
                }
            }
            for command in &profile.commands {
                println!("  {}", command.join(" "));
            }
        }
        None => println!("profile  none. This repo is not listed so nothing runs."),
    }
    println!("\nall entries");
    for entry in &config.repos {
        println!("  {:<48} {}", entry.pattern, entry.profile);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree<'a>(paths: &'a [&'a str]) -> impl Fn(&Path) -> bool + 'a {
        move |candidate: &Path| paths.iter().any(|path| Path::new(path) == candidate)
    }

    #[test]
    fn the_nearest_marker_above_the_file_wins() {
        let root = Path::new("/repo");
        let exists = tree(&["/repo/tools/api/Cargo.toml", "/repo/Cargo.toml"]);
        let found = nearest(root, "tools/api/src/main.rs", "Cargo.toml", &exists);
        assert_eq!(found, Some(PathBuf::from("/repo/tools/api")));
    }

    #[test]
    fn a_file_with_no_marker_above_it_is_skipped() {
        let root = Path::new("/repo");
        let exists = tree(&["/repo/tools/api/Cargo.toml"]);
        assert_eq!(nearest(root, "docs/plan.md", "Cargo.toml", &exists), None);
    }

    #[test]
    fn a_marker_at_the_repo_root_is_used() {
        let root = Path::new("/repo");
        let exists = tree(&["/repo/Cargo.toml"]);
        // A single crate repo keeps its manifest at the root so the checks belong there.
        assert_eq!(nearest(root, "src/main.rs", "Cargo.toml", &exists), Some(PathBuf::from("/repo")));
    }

    #[test]
    fn a_marker_outside_the_repo_is_never_used() {
        let root = Path::new("/repo");
        let exists = tree(&["/Cargo.toml"]);
        assert_eq!(nearest(root, "src/main.rs", "Cargo.toml", &exists), None);
    }

    #[test]
    fn a_profile_without_a_marker_runs_at_the_root() {
        let profile = config::Profile { name: "gradle".into(), marker: None, commands: Vec::new() };
        assert_eq!(places("/repo", &profile), vec!["/repo".to_string()]);
    }
}
