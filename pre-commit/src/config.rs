//! The list of repos and what to run in each.
//!
//! One directive per line. A line is `profile <name> <command>` or
//! `profile <name> marker <file>` or `repo <path> <profile>`. Blank lines and
//! lines opening with `#` are ignored.
//!
//! A marker names the file that sits at the root of one project. The commands
//! then run once in each project holding a staged change rather than once at the
//! root of the repository. A repo holding many crates is the reason it exists.
//! Because a) a line holds one command with no quoting rules b) a repo not
//! named in the file is never touched and c) an unreadable line is reported and
//! skipped rather than failing the commit the format stays editable by hand.

#[derive(Debug, Default, PartialEq)]
pub struct Config {
    pub profiles: Vec<Profile>,
    pub repos: Vec<Entry>,
}

#[derive(Debug, PartialEq)]
pub struct Profile {
    pub name: String,
    pub marker: Option<String>,
    pub commands: Vec<Vec<String>>,
}

#[derive(Debug, PartialEq)]
pub struct Entry {
    pub pattern: String,
    pub profile: String,
}

/// Lines that could not be read. The caller reports them and carries on.
#[derive(Debug, Default, PartialEq)]
pub struct Problems(pub Vec<String>);

pub fn parse(text: &str) -> (Config, Problems) {
    let mut config = Config::default();
    let mut problems = Problems::default();

    for (number, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut words = line.split_whitespace();
        match words.next() {
            Some("profile") => {
                let Some(name) = words.next() else {
                    problems.0.push(complaint(number, raw, "a profile needs a name"));
                    continue;
                };
                let rest: Vec<String> = words.map(str::to_string).collect();
                if rest.is_empty() {
                    problems.0.push(complaint(number, raw, "a profile line needs a command or a marker"));
                    continue;
                }
                let marker = match rest.first().map(String::as_str) {
                    Some("marker") if rest.len() == 2 => Some(rest[1].clone()),
                    Some("marker") => {
                        problems.0.push(complaint(number, raw, "a marker names one file"));
                        continue;
                    }
                    _ => None,
                };
                let slot = match config.profiles.iter().position(|profile| profile.name == name) {
                    Some(at) => at,
                    None => {
                        config.profiles.push(Profile {
                            name: name.to_string(),
                            marker: None,
                            commands: Vec::new(),
                        });
                        config.profiles.len() - 1
                    }
                };
                match marker {
                    Some(file) => config.profiles[slot].marker = Some(file),
                    None => config.profiles[slot].commands.push(rest),
                }
            }
            Some("repo") => {
                let (Some(pattern), Some(profile)) = (words.next(), words.next()) else {
                    problems.0.push(complaint(number, raw, "a repo needs a path and a profile"));
                    continue;
                };
                config.repos.push(Entry {
                    pattern: pattern.to_string(),
                    profile: profile.to_string(),
                });
            }
            _ => problems.0.push(complaint(number, raw, "expected profile or repo")),
        }
    }

    (config, problems)
}

fn complaint(number: usize, line: &str, why: &str) -> String {
    format!("line {}: {} — {}", number + 1, why, line.trim())
}

impl Config {
    /// The commands for one repository. None means this repo is not listed.
    ///
    /// A pattern closing with `/*` covers every repo under that directory. The
    /// first entry that matches wins so a specific line can sit above a wide one.
    pub fn profile_for(&self, root: &str) -> Option<&Profile> {
        let entry = self.repos.iter().find(|entry| matches(&entry.pattern, root))?;
        self.profiles.iter().find(|profile| profile.name == entry.profile)
    }

    /// A listed repo naming a profile that was never defined.
    pub fn dangling(&self) -> Vec<&str> {
        self.repos
            .iter()
            .filter(|entry| !self.profiles.iter().any(|profile| profile.name == entry.profile))
            .map(|entry| entry.profile.as_str())
            .collect()
    }
}

fn matches(pattern: &str, root: &str) -> bool {
    match pattern.strip_suffix("/*") {
        Some(parent) => root.starts_with(parent) && root[parent.len()..].starts_with('/'),
        None => pattern.trim_end_matches('/') == root.trim_end_matches('/'),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
# checks
profile rust marker Cargo.toml
profile rust cargo fmt --all --check
profile rust cargo clippy --all-targets -- -D warnings

profile gradle ./gradlew spotlessCheck

repo /home/alex/repos/alex-log rust
repo /home/alex/repos/work/* gradle
";

    #[test]
    fn commands_keep_their_order() {
        let (config, problems) = parse(SAMPLE);
        assert_eq!(problems, Problems::default());
        let profile = config.profile_for("/home/alex/repos/alex-log").unwrap();
        assert_eq!(profile.name, "rust");
        assert_eq!(profile.commands.len(), 2);
        assert_eq!(profile.commands[0], vec!["cargo", "fmt", "--all", "--check"]);
        assert_eq!(profile.commands[1].last().unwrap(), "warnings");
    }

    #[test]
    fn a_marker_is_not_a_command() {
        let (config, _) = parse(SAMPLE);
        let rust = config.profile_for("/home/alex/repos/alex-log").unwrap();
        assert_eq!(rust.marker.as_deref(), Some("Cargo.toml"));
        let gradle = config.profile_for("/home/alex/repos/work/api").unwrap();
        assert_eq!(gradle.marker, None);
        assert_eq!(gradle.commands.len(), 1);
    }

    #[test]
    fn a_marker_needs_exactly_one_file() {
        let (_, problems) = parse("profile rust marker Cargo.toml extra\n");
        assert_eq!(problems.0.len(), 1);
    }

    #[test]
    fn an_unlisted_repo_has_nothing_to_run() {
        let (config, _) = parse(SAMPLE);
        assert!(config.profile_for("/home/alex/repos/other").is_none());
    }

    #[test]
    fn a_star_covers_everything_underneath() {
        let (config, _) = parse(SAMPLE);
        assert!(config.profile_for("/home/alex/repos/work/api").is_some());
        assert!(config.profile_for("/home/alex/repos/work").is_none());
        assert!(config.profile_for("/home/alex/repos/workshop").is_none());
    }

    #[test]
    fn a_trailing_slash_changes_nothing() {
        let (config, _) = parse(SAMPLE);
        assert!(config.profile_for("/home/alex/repos/alex-log/").is_some());
    }

    #[test]
    fn a_bad_line_is_reported_and_skipped() {
        let (config, problems) = parse("profile\nrepo /tmp/x\nnonsense here\nrepo /tmp/y rust\nprofile rust cargo test\n");
        assert_eq!(problems.0.len(), 3);
        assert!(config.profile_for("/tmp/y").is_some());
    }

    #[test]
    fn a_missing_profile_is_named() {
        let (config, _) = parse("repo /tmp/x ghost\n");
        assert_eq!(config.dangling(), vec!["ghost"]);
        assert!(config.profile_for("/tmp/x").is_none());
    }
}
