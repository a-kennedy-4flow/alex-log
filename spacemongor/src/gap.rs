//! Working out where the unaccounted space went.
//!
//! The outer box stands for what the operating system reports as occupied. The
//! walk rarely reaches all of it. This asks the machine what it can about the
//! difference rather than leaving the reader to guess.

use eframe::egui;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::{Arc, Mutex};

/// Names listed under one cause before the rest are only counted.
const MAX_NAMED: usize = 200;

pub struct Finding {
    pub cause: &'static str,
    /// Bytes this accounts for. `None` when it cannot be measured from here.
    pub bytes: Option<u64>,
    /// False when the figure is worked out rather than counted.
    pub sure: bool,
    pub note: String,
    pub detail: Vec<String>,
    /// Items beyond the ones named.
    pub more: usize,
}

pub struct Answer {
    pub gap: u64,
    pub findings: Vec<Finding>,
    /// What none of the findings account for.
    pub left: u64,
}

pub struct Ask {
    pub root: PathBuf,
    pub done: AtomicBool,
    pub answer: Mutex<Option<Arc<Answer>>>,
}

impl Ask {
    pub fn answer(&self) -> Option<Arc<Answer>> {
        self.answer.lock().unwrap().clone()
    }
}

/// What the walk knows before the question is asked.
pub struct Seen {
    pub root: PathBuf,
    pub gap: u64,
    pub denied: u64,
    /// Each folder with what the host said about it.
    pub denied_paths: Vec<(PathBuf, String)>,
    pub files: u64,
}

pub fn start(seen: Seen, ctx: egui::Context) -> Arc<Ask> {
    let ask = Arc::new(Ask {
        root: seen.root.clone(),
        done: AtomicBool::new(false),
        answer: Mutex::new(None),
    });
    let handle = Arc::clone(&ask);
    std::thread::spawn(move || {
        let answer = explain(&seen);
        *handle.answer.lock().unwrap() = Some(Arc::new(answer));
        handle.done.store(true, Relaxed);
        ctx.request_repaint();
    });
    ask
}

fn explain(seen: &Seen) -> Answer {
    let mut findings = Vec::new();

    if seen.denied > 0 {
        // Grouped by what the host said. One reason repeated a thousand times
        // is one thing to deal with rather than a thousand.
        let mut why: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for (_, said) in &seen.denied_paths {
            *why.entry(said.as_str()).or_insert(0) += 1;
        }
        let mut reasons: Vec<(&str, usize)> = why.into_iter().collect();
        reasons.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
        let summary = reasons
            .iter()
            .map(|(said, n)| format!("{said} ({n})"))
            .collect::<Vec<_>>()
            .join("  ·  ");

        let named: Vec<String> = seen
            .denied_paths
            .iter()
            .take(MAX_NAMED)
            .map(|(path, said)| format!("{said}  ·  {}", path.display()))
            .collect();
        let more = (seen.denied as usize).saturating_sub(named.len());
        findings.push(Finding {
            cause: "Folders the walk could not open",
            bytes: None,
            sure: true,
            note: format!(
                "{summary}. Everything below these is missing from the total. \
                 Being an administrator is not always enough. A folder the host \
                 keeps for itself refuses an administrator until its ownership is \
                 taken, and a folder another program holds open refuses everyone."
            ),
            detail: named,
            more,
        });
    }

    let (bytes, holders, blind) = deleted_but_open(&seen.root);
    if bytes > 0 || !holders.is_empty() {
        let mut note = "A program still holds these open so the space is not free. \
                        Closing the program or restarting it releases them."
            .to_string();
        if blind > 0 {
            note.push_str(&format!(
                " {blind} programs belong to another user and could not be asked."
            ));
        }
        findings.push(Finding {
            cause: "Deleted files a program still holds open",
            bytes: Some(bytes),
            sure: true,
            note,
            detail: holders,
            more: 0,
        });
    }

    let covered = mounted_over(&seen.root);
    if !covered.is_empty() {
        let more = covered.len().saturating_sub(MAX_NAMED);
        findings.push(Finding {
            cause: "Folders with another filesystem mounted over them",
            bytes: None,
            sure: true,
            note: "Anything that sat in these folders before the mount is still on \
                   the disk and cannot be reached while the mount is there."
                .to_string(),
            detail: covered.into_iter().take(MAX_NAMED).collect(),
            more,
        });
    }

    if let Some(cluster) = crate::sys::cluster_size(&seen.root)
        && seen.files > 0
    {
        // Space is handed out a cluster at a time. The walk reads the length of
        // a file. On average half a cluster of every file is unread.
        let slack = seen.files.saturating_mul(cluster / 2);
        findings.push(Finding {
            cause: "The tail of the last cluster of every file",
            bytes: Some(slack),
            sure: false,
            note: format!(
                "This filesystem hands space out {} at a time and the walk reads the \
                 length of each file rather than the room it takes. The figure is \
                 half a cluster for each of {} files.",
                crate::fmt::bytes(cluster),
                crate::fmt::count(seen.files)
            ),
            detail: Vec::new(),
            more: 0,
        });
    }

    let counted: u64 = findings.iter().filter_map(|f| f.bytes).sum();
    Answer {
        gap: seen.gap,
        left: seen.gap.saturating_sub(counted),
        findings,
    }
}

/// Files with no name left that a running program still holds open. Their
/// blocks stay taken until the last program lets go.
#[cfg(unix)]
fn deleted_but_open(root: &Path) -> (u64, Vec<String>, usize) {
    use std::collections::HashSet;
    use std::os::unix::fs::MetadataExt;

    let Ok(device) = std::fs::metadata(root).map(|m| m.dev()) else {
        return (0, Vec::new(), 0);
    };
    let Ok(procs) = std::fs::read_dir("/proc") else {
        return (0, Vec::new(), 0);
    };

    let mut seen: HashSet<(u64, u64)> = HashSet::new();
    let mut total = 0u64;
    let mut holders: Vec<String> = Vec::new();
    let mut blind = 0usize;

    for entry in procs.flatten() {
        let name = entry.file_name();
        let Some(pid) = name
            .to_str()
            .filter(|n| n.bytes().all(|b| b.is_ascii_digit()))
        else {
            continue;
        };
        let Ok(fds) = std::fs::read_dir(entry.path().join("fd")) else {
            blind += 1;
            continue;
        };
        let who = std::fs::read_to_string(entry.path().join("comm"))
            .map(|c| c.trim().to_string())
            .unwrap_or_else(|_| "a program".to_string());

        for fd in fds.flatten() {
            let Ok(points_at) = std::fs::read_link(fd.path()) else {
                continue;
            };
            let shown = points_at.to_string_lossy();
            let Some(gone) = shown.strip_suffix(" (deleted)") else {
                continue;
            };
            if !Path::new(gone).starts_with(root) {
                continue;
            }
            let Ok(md) = std::fs::metadata(fd.path()) else {
                continue;
            };
            if md.dev() != device || !seen.insert((md.dev(), md.ino())) {
                continue;
            }
            total += md.blocks() * 512;
            if holders.len() < MAX_NAMED {
                holders.push(format!(
                    "{}  ·  {who} [{pid}]  ·  {gone}",
                    crate::fmt::bytes(md.blocks() * 512)
                ));
            }
        }
    }
    holders.sort();
    (total, holders, blind)
}

/// Windows gives no equivalent of `/proc` without opening the kernel handle
/// table so the question cannot be put here.
#[cfg(windows)]
fn deleted_but_open(_root: &Path) -> (u64, Vec<String>, usize) {
    (0, Vec::new(), 0)
}

/// Folders inside the walked tree that something else is mounted over.
#[cfg(unix)]
fn mounted_over(root: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string("/proc/mounts") else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for line in text.lines() {
        let Some(at) = line.split(' ').nth(1) else {
            continue;
        };
        let at = Path::new(at);
        if at != root && at.starts_with(root) {
            out.push(at.display().to_string());
        }
    }
    out.sort();
    out.dedup();
    out
}

#[cfg(windows)]
fn mounted_over(_root: &Path) -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::{Seen, explain};
    use std::path::PathBuf;

    fn seen(root: PathBuf, gap: u64) -> Seen {
        Seen {
            root,
            gap,
            denied: 0,
            denied_paths: Vec::new(),
            files: 0,
        }
    }

    #[test]
    fn folders_that_could_not_be_opened_are_named() {
        let mut ask = seen(PathBuf::from("/"), 1024);
        ask.denied = 4;
        ask.denied_paths = vec![
            (PathBuf::from("/root"), "the host refused".to_string()),
            (PathBuf::from("/lost+found"), "the host refused".to_string()),
            (
                PathBuf::from("/var/x"),
                "another program is holding it".to_string(),
            ),
        ];

        let found = explain(&ask);
        let first = found
            .findings
            .iter()
            .find(|f| f.cause.starts_with("Folders the walk"))
            .expect("the denied folders are reported");
        assert_eq!(first.detail.len(), 3);
        assert_eq!(first.more, 1, "the fourth is counted but not named");
        assert_eq!(first.bytes, None, "their size cannot be known from outside");
        // The reasons are gathered so one repeated many times reads as one.
        assert!(
            first
                .note
                .starts_with("the host refused (2)  ·  another program is holding it (1)"),
            "{}",
            first.note
        );
        assert!(
            first.detail[0].starts_with("the host refused  ·  /root"),
            "{:?}",
            first.detail[0]
        );
    }

    #[test]
    fn what_nothing_accounts_for_is_stated_plainly() {
        let found = explain(&seen(std::env::temp_dir(), 900_000_000));
        let counted: u64 = found.findings.iter().filter_map(|f| f.bytes).sum();
        assert_eq!(found.left, 900_000_000 - counted);
        assert_eq!(found.gap, 900_000_000);
    }

    /// The classic case where the free space figure and a file walk disagree.
    #[test]
    #[cfg(unix)]
    fn a_deleted_file_a_program_still_holds_is_found() {
        use std::io::Write;

        let root = std::env::temp_dir().join(format!("spacemongor-gap-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("ghost.bin");

        let mut held = std::fs::File::create(&path).unwrap();
        held.write_all(&vec![b'g'; 400_000]).unwrap();
        held.sync_all().unwrap();
        std::fs::remove_file(&path).unwrap();

        let found = explain(&seen(root.clone(), 10_000_000));
        let ghost = found
            .findings
            .iter()
            .find(|f| f.cause.starts_with("Deleted files"))
            .expect("the held file is reported");
        assert!(ghost.bytes.unwrap() >= 400_000, "{:?}", ghost.bytes);
        assert!(
            ghost.detail.iter().any(|d| d.contains("ghost.bin")),
            "{:?}",
            ghost.detail
        );
        assert!(found.left < found.gap, "it accounts for part of the gap");

        drop(held);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
