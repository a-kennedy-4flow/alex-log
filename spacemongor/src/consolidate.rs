//! Bringing one copy of everything into a new folder.
//!
//! A search says which files hold the same bytes. This turns that into a plan
//! that lays one copy of each down under a new folder and says what can then be
//! taken away.

use crate::dupes::Pair;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Written in the new folder once the copying is done.
pub const REMOVALS: &str = "spacemongor-to-remove.txt";

pub struct Item {
    pub from: PathBuf,
    pub to: PathBuf,
    pub size: u64,
    /// Every path under the old folder holding these bytes, `from` included.
    /// Once `to` is written they can all go.
    pub same: Vec<PathBuf>,
}

pub struct Plan {
    pub items: Vec<Item>,
    /// What laying one copy of each down will take.
    pub bytes: u64,
    /// What taking the old ones away will give back.
    pub frees: u64,
    /// Files that will be listed for removal.
    pub removals: usize,
    /// Names that had to be changed because two different files flattened onto
    /// one place.
    pub renamed: usize,
    pub destination: PathBuf,
    pub levels: usize,
    pub free: Option<u64>,
}

impl Plan {
    pub fn too_big(&self) -> bool {
        self.free.is_some_and(|free| self.bytes > free)
    }
}

/// Every file under `root`, however deep. `only` narrows it to those groups.
///
/// A symlink is never followed and the walk stays on one filesystem, the same
/// as everywhere else. Empty files come too. They hold nothing but they are
/// still files and the point is to bring everything across.
pub fn files_under(
    root: &Path,
    only: Option<&HashSet<crate::cats::Cat>>,
    stop: &std::sync::atomic::AtomicBool,
) -> Vec<(PathBuf, u64)> {
    use std::sync::atomic::Ordering::Relaxed;
    let device = std::fs::metadata(root)
        .ok()
        .map(|md| crate::sys::volume_id(&md));
    let mut out = Vec::new();
    let mut seen: HashSet<(u64, u64)> = HashSet::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if stop.load(Relaxed) || depth > 64 {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(md) = entry.metadata() else {
                continue;
            };
            if md.is_dir() {
                if device.is_some_and(|d| crate::sys::volume_id(&md) != d) {
                    continue;
                }
                stack.push((entry.path(), depth + 1));
                continue;
            }
            if !md.is_file() {
                continue;
            }
            // A search told to look at pictures brings pictures across. Bringing
            // everything would leave a folder of things nobody asked about.
            if let Some(only) = only {
                let leaf = entry.file_name().to_string_lossy().into_owned();
                if !only.contains(&crate::cats::of(&leaf)) {
                    continue;
                }
            }
            // A second name for one file would otherwise come across twice.
            if let Some(key) = crate::sys::hard_link_key(&md)
                && !seen.insert(key)
            {
                continue;
            }
            out.push((entry.path(), md.len()));
        }
    }
    out.sort();
    out
}

/// Works out what would be laid down and what could then go.
///
/// `all` is every file under the old folder. `pairs` is what the search found.
/// A file the search never paired is one of a kind and comes across on its own.
pub fn plan(
    all: &[(PathBuf, u64)],
    pairs: &[Pair],
    root: &Path,
    destination: &Path,
    levels: usize,
) -> Plan {
    // A pair names the copy on the right and the one to keep on the left. The
    // copies are what must not come across a second time.
    let mut copies: HashMap<&Path, &Path> = HashMap::new();
    for pair in pairs {
        copies.insert(pair.b.as_path(), pair.a.as_path());
    }
    let mut also: HashMap<&Path, Vec<PathBuf>> = HashMap::new();
    for pair in pairs {
        also.entry(pair.a.as_path())
            .or_default()
            .push(pair.b.clone());
    }

    let mut taken: HashSet<PathBuf> = HashSet::new();
    let mut items = Vec::new();
    let (mut bytes, mut frees, mut removals, mut renamed) = (0u64, 0u64, 0usize, 0usize);

    for (path, size) in all {
        if copies.contains_key(path.as_path()) {
            // Another file holds these bytes and it is the one coming across.
            continue;
        }
        let under = path.strip_prefix(root).unwrap_or(path);
        let wanted = destination.join(flatten(under, levels));
        let to = free_name(wanted, &mut taken);
        if to.file_name() != path.file_name() {
            renamed += 1;
        }

        let mut same = vec![path.clone()];
        if let Some(rest) = also.get(path.as_path()) {
            same.extend(rest.iter().cloned());
        }
        frees += size * (same.len() as u64 - 1);
        removals += same.len();
        bytes += size;
        items.push(Item {
            from: path.clone(),
            to,
            size: *size,
            same,
        });
    }

    items.sort_by(|x, y| y.size.cmp(&x.size).then_with(|| x.to.cmp(&y.to)));
    Plan {
        items,
        bytes,
        frees,
        removals,
        renamed,
        destination: destination.to_path_buf(),
        levels,
        free: crate::sys::free_space(destination),
    }
}

/// Cuts a path down to `levels` parts while keeping what it says.
///
/// The first parts say broadly where a file lived. The part just above it says
/// what it sat with. Those two are what make a flattened tree still readable so
/// the middle is what goes.
pub fn flatten(under: &Path, levels: usize) -> PathBuf {
    let parts: Vec<_> = under.iter().collect();
    let levels = levels.max(1);
    if parts.len() <= levels {
        return under.to_path_buf();
    }
    let leaf = parts[parts.len() - 1];
    if levels == 1 {
        return PathBuf::from(leaf);
    }
    // One place goes to the folder the file sat in. The rest go to the front.
    let lead = levels - 2;
    let mut out = PathBuf::new();
    for part in parts.iter().take(lead) {
        out.push(part);
    }
    out.push(parts[parts.len() - 2]);
    out.push(leaf);
    out
}

/// Finds a name nothing else has taken.
fn free_name(wanted: PathBuf, taken: &mut HashSet<PathBuf>) -> PathBuf {
    if taken.insert(wanted.clone()) {
        return wanted;
    }
    let stem = wanted
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let tail = wanted
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let folder = wanted.parent().map(Path::to_path_buf).unwrap_or_default();
    for n in 2..100_000 {
        let next = folder.join(format!("{stem} ({n}){tail}"));
        if taken.insert(next.clone()) {
            return next;
        }
    }
    wanted
}

/// Writes the list of what can go, naming only what really arrived.
///
/// A file is listed only once its copy is standing in the new folder. Because
/// a list that names something whose copy never landed is a list that loses it.
pub fn write_removals(plan: &Plan) -> std::io::Result<(PathBuf, usize)> {
    let at = plan.destination.join(REMOVALS);
    let mut file = std::fs::File::create(&at)?;
    writeln!(
        file,
        "# Every file below is held under {} and can be removed.",
        plan.destination.display()
    )?;
    writeln!(file, "# Only files whose copy really arrived are named.\n")?;
    let mut named = 0;
    for item in &plan.items {
        if !item.to.exists() {
            continue;
        }
        for path in &item.same {
            writeln!(file, "{}", path.display())?;
            named += 1;
        }
    }
    Ok((at, named))
}

/// A listing and a plan being worked out away from the window.
pub struct Working {
    pub stop: std::sync::atomic::AtomicBool,
    pub done: std::sync::atomic::AtomicBool,
    pub found: std::sync::atomic::AtomicU64,
    pub plan: std::sync::Mutex<Option<std::sync::Arc<Plan>>>,
}

impl Working {
    pub fn plan(&self) -> Option<std::sync::Arc<Plan>> {
        self.plan.lock().unwrap().clone()
    }
}

/// Lists the folder afresh and works the plan out from it.
///
/// The folder is walked again rather than the search being trusted for it.
/// Because a search only names what it found twice and this has to bring across
/// everything, one of a kind included.
pub fn start(
    root: PathBuf,
    pairs: Vec<Pair>,
    only: Option<HashSet<crate::cats::Cat>>,
    destination: PathBuf,
    levels: usize,
    ctx: eframe::egui::Context,
) -> std::sync::Arc<Working> {
    use std::sync::atomic::Ordering::Relaxed;
    let working = std::sync::Arc::new(Working {
        stop: std::sync::atomic::AtomicBool::new(false),
        done: std::sync::atomic::AtomicBool::new(false),
        found: std::sync::atomic::AtomicU64::new(0),
        plan: std::sync::Mutex::new(None),
    });
    let handle = std::sync::Arc::clone(&working);
    std::thread::spawn(move || {
        let all = files_under(&root, only.as_ref(), &handle.stop);
        handle.found.store(all.len() as u64, Relaxed);
        if !handle.stop.load(Relaxed) {
            let made = plan(&all, &pairs, &root, &destination, levels);
            *handle.plan.lock().unwrap() = Some(std::sync::Arc::new(made));
        }
        handle.done.store(true, Relaxed);
        ctx.request_repaint();
    });
    working
}

#[cfg(test)]
mod tests {
    use super::{flatten, plan, write_removals};
    use crate::dupes::Pair;
    use std::path::{Path, PathBuf};

    fn pair(a: &str, b: &str, size: u64) -> Pair {
        Pair {
            a: PathBuf::from(a),
            b: PathBuf::from(b),
            size,
        }
    }

    #[test]
    fn a_deep_path_keeps_its_ends_and_loses_its_middle() {
        let deep = Path::new("V Old Backups/Alex Backup 2/Alex/My Documents/new/game.mdf");
        assert_eq!(
            flatten(deep, 3),
            PathBuf::from("V Old Backups/new/game.mdf"),
            "it kept the wrong parts"
        );
        assert_eq!(flatten(deep, 2), PathBuf::from("new/game.mdf"));
        assert_eq!(flatten(deep, 1), PathBuf::from("game.mdf"));
    }

    #[test]
    fn a_path_already_short_enough_is_left_alone() {
        let shallow = Path::new("music/song.mp3");
        assert_eq!(flatten(shallow, 3), PathBuf::from("music/song.mp3"));
        assert_eq!(
            flatten(Path::new("loose.txt"), 3),
            PathBuf::from("loose.txt")
        );
    }

    #[test]
    fn only_one_of_each_comes_across() {
        let root = Path::new("/disk");
        let all = vec![
            (PathBuf::from("/disk/a/song.mp3"), 100),
            (PathBuf::from("/disk/b/song.mp3"), 100),
            (PathBuf::from("/disk/c/song.mp3"), 100),
            (PathBuf::from("/disk/d/alone.txt"), 7),
        ];
        let pairs = [
            pair("/disk/a/song.mp3", "/disk/b/song.mp3", 100),
            pair("/disk/a/song.mp3", "/disk/c/song.mp3", 100),
        ];

        let made = plan(&all, &pairs, root, Path::new("/new"), 3);
        assert_eq!(made.items.len(), 2, "one of each and no more");
        assert_eq!(made.bytes, 107, "only what is laid down is counted");
        assert_eq!(made.frees, 200, "the two extra copies come back");
        assert_eq!(made.removals, 4, "every old file can go once it is across");

        let song = made
            .items
            .iter()
            .find(|i| i.from.ends_with("a/song.mp3"))
            .unwrap();
        assert_eq!(song.same.len(), 3, "all three places are named");
        assert!(song.same.contains(&PathBuf::from("/disk/c/song.mp3")));
    }

    #[test]
    fn two_different_files_flattening_onto_one_place_are_held_apart() {
        let root = Path::new("/disk");
        let all = vec![
            (PathBuf::from("/disk/one/deep/x/notes.txt"), 1),
            (PathBuf::from("/disk/one/other/x/notes.txt"), 2),
        ];
        let made = plan(&all, &[], root, Path::new("/new"), 3);

        assert_eq!(made.items.len(), 2);
        assert_ne!(
            made.items[0].to, made.items[1].to,
            "one landed on the other"
        );
        assert_eq!(made.renamed, 1, "the change was not counted");
        let names: Vec<String> = made
            .items
            .iter()
            .map(|i| i.to.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert!(names.contains(&"notes (2).txt".to_string()), "{names:?}");
    }

    #[test]
    fn every_file_under_the_folder_is_found() {
        let root = std::env::temp_dir().join(format!("spacemongor-walk-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("a/b/c")).unwrap();
        std::fs::write(root.join("top.txt"), b"1").unwrap();
        std::fs::write(root.join("a/mid.txt"), b"22").unwrap();
        std::fs::write(root.join("a/b/c/deep.txt"), b"333").unwrap();
        std::fs::write(root.join("a/empty.txt"), b"").unwrap();

        let stop = std::sync::atomic::AtomicBool::new(false);
        let found = super::files_under(&root, None, &stop);

        assert_eq!(found.len(), 4, "an empty file is still a file: {found:?}");
        assert!(
            found
                .iter()
                .any(|(p, s)| p.ends_with("deep.txt") && *s == 3)
        );
        assert!(
            found
                .iter()
                .any(|(p, s)| p.ends_with("empty.txt") && *s == 0)
        );
        assert!(found.windows(2).all(|w| w[0].0 <= w[1].0), "not in order");

        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_list_names_only_what_really_arrived() {
        let ground = std::env::temp_dir().join(format!("spacemongor-cons-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ground);
        std::fs::create_dir_all(ground.join("new")).unwrap();

        let all = vec![
            (PathBuf::from("/disk/a/here.mp3"), 10),
            (PathBuf::from("/disk/b/here.mp3"), 10),
            (PathBuf::from("/disk/c/never.mp3"), 20),
        ];
        let pairs = [pair("/disk/a/here.mp3", "/disk/b/here.mp3", 10)];
        let made = plan(&all, &pairs, Path::new("/disk"), &ground.join("new"), 3);

        // Only one of the two copies is standing in the new folder.
        let arrived = made
            .items
            .iter()
            .find(|i| i.from.ends_with("a/here.mp3"))
            .unwrap();
        std::fs::create_dir_all(arrived.to.parent().unwrap()).unwrap();
        std::fs::write(&arrived.to, b"x").unwrap();

        let (at, named) = write_removals(&made).unwrap();
        let text = std::fs::read_to_string(&at).unwrap();
        assert_eq!(named, 2, "both places holding those bytes are named");
        assert!(text.contains("/disk/a/here.mp3"), "{text}");
        assert!(text.contains("/disk/b/here.mp3"), "{text}");
        assert!(
            !text.contains("never.mp3"),
            "it named a file whose copy never landed"
        );

        std::fs::remove_dir_all(&ground).unwrap();
    }
}
