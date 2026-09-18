//! Walking to a folder and asking what is in it.
//!
//! The treemap shows a whole filesystem. This is for going straight to one
//! folder and reading it on its own.

use crate::cats::{self, Cat};
use eframe::egui;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, Mutex};

/// Largest files named. Enough to see what is taking the room.
const BIGGEST: usize = 20;

/// Deepest folder the measure will enter.
const MAX_DEPTH: usize = 64;

/// What a folder holds.
pub struct Facts {
    pub root: PathBuf,
    pub files: u64,
    pub folders: u64,
    pub bytes: u64,
    /// Every file type group present with what it holds. Fullest first.
    pub by_cat: Vec<(Cat, u64, u64)>,
    pub biggest: Vec<(PathBuf, u64)>,
    /// Folders that could not be opened. Their contents are missing.
    pub denied: u64,
}

pub struct Measure {
    pub cancel: AtomicBool,
    pub done: AtomicBool,
    pub files: AtomicU64,
    pub bytes: AtomicU64,
    pub current: Mutex<String>,
    pub facts: Mutex<Option<Arc<Facts>>>,
}

impl Measure {
    pub fn stop(&self) {
        self.cancel.store(true, Relaxed);
    }

    pub fn facts(&self) -> Option<Arc<Facts>> {
        self.facts.lock().unwrap().clone()
    }

    pub fn current(&self) -> String {
        self.current.lock().unwrap().clone()
    }
}

/// The folders directly inside `at`, in name order.
///
/// Only one level. A picker that walked the whole tree to draw a list would
/// take as long as the thing it is meant to save.
pub fn children(at: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(at) else {
        return Vec::new();
    };
    let mut out: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.metadata().map(|m| m.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .collect();
    out.sort();
    out
}

pub fn start(root: PathBuf, ctx: egui::Context) -> Arc<Measure> {
    let measure = Arc::new(Measure {
        cancel: AtomicBool::new(false),
        done: AtomicBool::new(false),
        files: AtomicU64::new(0),
        bytes: AtomicU64::new(0),
        current: Mutex::new(String::new()),
        facts: Mutex::new(None),
    });
    let handle = Arc::clone(&measure);
    std::thread::spawn(move || {
        let facts = walk(&root, &handle);
        *handle.facts.lock().unwrap() = Some(Arc::new(facts));
        handle.done.store(true, Relaxed);
        handle.current.lock().unwrap().clear();
        ctx.request_repaint();
    });
    measure
}

fn walk(root: &Path, measure: &Measure) -> Facts {
    let device = std::fs::metadata(root)
        .ok()
        .map(|md| crate::sys::volume_id(&md));
    let mut totals: std::collections::HashMap<Cat, (u64, u64)> = std::collections::HashMap::new();
    let mut biggest: Vec<(PathBuf, u64)> = Vec::new();
    let mut folders = 0u64;
    let mut denied = 0u64;
    let mut bytes = 0u64;
    let mut files = 0u64;

    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if measure.cancel.load(Relaxed) || depth > MAX_DEPTH {
            continue;
        }
        *measure.current.lock().unwrap() = dir.display().to_string();
        let Ok(entries) = std::fs::read_dir(&dir) else {
            denied += 1;
            continue;
        };
        for entry in entries.flatten() {
            let Ok(md) = entry.metadata() else {
                continue;
            };
            // A symlink reports false here so nothing is followed.
            if md.is_dir() {
                if device.is_some_and(|d| crate::sys::volume_id(&md) != d) {
                    continue;
                }
                folders += 1;
                stack.push((entry.path(), depth + 1));
                continue;
            }
            let size = crate::sys::used_bytes(&md);
            let leaf = entry.file_name().to_string_lossy().into_owned();
            let seen = totals.entry(cats::of(&leaf)).or_insert((0, 0));
            seen.0 += 1;
            seen.1 += size;
            files += 1;
            bytes += size;

            // Only the largest are kept so a folder of millions costs nothing
            // to hold.
            if biggest.len() < BIGGEST {
                biggest.push((entry.path(), size));
                biggest.sort_by_key(|(_, s)| std::cmp::Reverse(*s));
            } else if biggest.last().is_some_and(|(_, least)| size > *least) {
                biggest.pop();
                biggest.push((entry.path(), size));
                biggest.sort_by_key(|(_, s)| std::cmp::Reverse(*s));
            }
        }
        measure.files.store(files, Relaxed);
        measure.bytes.store(bytes, Relaxed);
    }

    let mut by_cat: Vec<(Cat, u64, u64)> = totals
        .into_iter()
        .map(|(cat, (count, held))| (cat, count, held))
        .collect();
    by_cat.sort_by_key(|(_, _, held)| std::cmp::Reverse(*held));

    Facts {
        root: root.to_path_buf(),
        files,
        folders,
        bytes,
        by_cat,
        biggest,
        denied,
    }
}

#[cfg(test)]
mod tests {
    use super::{Facts, children, start};
    use crate::cats::Cat;
    use eframe::egui;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::Ordering::Relaxed;
    use std::time::{Duration, Instant};

    fn ground(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("spacemongor-browse-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("music/albums")).unwrap();
        fs::create_dir_all(root.join("pictures")).unwrap();
        fs::write(root.join("music/albums/song.mp3"), vec![b'm'; 40_000]).unwrap();
        fs::write(root.join("music/other.mp3"), vec![b'n'; 10_000]).unwrap();
        fs::write(root.join("pictures/cover.jpg"), vec![b'p'; 5_000]).unwrap();
        fs::write(root.join("notes.txt"), vec![b't'; 100]).unwrap();
        root
    }

    fn measured(root: &std::path::Path) -> std::sync::Arc<Facts> {
        let job = start(root.to_path_buf(), egui::Context::default());
        let deadline = Instant::now() + Duration::from_secs(20);
        while !job.done.load(Relaxed) {
            assert!(Instant::now() < deadline, "the measure never finished");
            std::thread::sleep(Duration::from_millis(10));
        }
        job.facts().expect("facts once it is done")
    }

    #[test]
    fn only_the_folders_one_level_down_are_listed() {
        let root = ground("children");
        let found = children(&root);

        assert_eq!(found.len(), 2, "{found:?}");
        assert!(found.contains(&root.join("music")));
        assert!(found.contains(&root.join("pictures")));
        assert!(
            !found.iter().any(|p| p.ends_with("albums")),
            "it went a level too deep"
        );
        assert!(
            !found.iter().any(|p| p.ends_with("notes.txt")),
            "a file was listed as a folder"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_folder_is_measured_all_the_way_down() {
        let root = ground("measure");
        let facts = measured(&root);

        assert_eq!(facts.files, 4);
        assert_eq!(facts.folders, 3, "music, albums and pictures");
        assert_eq!(facts.denied, 0);
        assert!(facts.bytes >= 55_100, "{}", facts.bytes);

        let groups: Vec<Cat> = facts.by_cat.iter().map(|(c, _, _)| *c).collect();
        assert_eq!(groups[0], Cat::Audio, "the fullest group comes first");
        assert!(groups.contains(&Cat::Image));
        assert!(groups.contains(&Cat::Document));

        let audio = facts
            .by_cat
            .iter()
            .find(|(c, _, _)| *c == Cat::Audio)
            .unwrap();
        assert_eq!(audio.1, 2, "two files in the audio group");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_largest_files_are_named_in_order() {
        let root = ground("biggest");
        let facts = measured(&root);

        assert_eq!(facts.biggest.len(), 4);
        assert!(facts.biggest[0].0.ends_with("song.mp3"));
        assert!(
            facts.biggest.windows(2).all(|w| w[0].1 >= w[1].1),
            "not in order"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_folder_that_is_not_there_measures_to_nothing() {
        let facts = measured(&PathBuf::from("/definitely/not/here"));
        assert_eq!(facts.files, 0);
        assert_eq!(facts.bytes, 0);
        assert_eq!(facts.denied, 1, "it says it could not be opened");
    }
}
