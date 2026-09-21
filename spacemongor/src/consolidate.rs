//! Bringing one copy of everything into a new folder.
//!
//! A search says which files hold the same bytes. This turns that into a plan
//! that lays one copy of each down under a new folder and says what can then be
//! taken away. The files can come from any number of folders so a set of
//! backups is reorganised in one go.

use crate::cats::Pick;
use crate::dupes::Pair;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Written in the new folder once the copying is done.
pub const REMOVALS: &str = "spacemongor-to-remove.txt";

/// The folder a file lands in before its own flattened path.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Top {
    /// None. The flattened path sits straight under the new folder.
    Nothing,
    /// One for each of the nine groups.
    Group,
    /// One for each bundle. Photos and video share one.
    Bundle,
}

impl Top {
    /// What a file of this name lands under.
    pub fn folder(self, name: &str) -> Option<&'static str> {
        match self {
            Top::Nothing => None,
            Top::Group => Some(crate::cats::of(name).label()),
            Top::Bundle => Some(crate::cats::of(name).bundle().label),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Top::Nothing => "keep the old paths",
            Top::Group => "a folder for each group",
            Top::Bundle => "a folder for each bundle",
        }
    }
}

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
    /// What taking away everything the removal list names will give back. The
    /// new copy costs `bytes` of it.
    pub frees: u64,
    /// Files that will be listed for removal.
    pub removals: usize,
    /// Names that had to be changed because two different files flattened onto
    /// one place.
    pub renamed: usize,
    /// The folders the files came from.
    pub roots: Vec<PathBuf>,
    pub destination: PathBuf,
    pub levels: usize,
    pub top: Top,
    pub free: Option<u64>,
}

impl Plan {
    pub fn too_big(&self) -> bool {
        self.free.is_some_and(|free| self.bytes > free)
    }
}

/// Every file under the folders given however deep they sit. `pick` narrows it
/// to the files asked for.
///
/// A symlink is never followed and each walk stays on one filesystem, the same
/// as everywhere else. Empty files come too. They hold nothing but they are
/// still files and the point is to bring everything across.
pub fn files_under(
    roots: &[PathBuf],
    pick: &Pick,
    stop: &std::sync::atomic::AtomicBool,
) -> Vec<(PathBuf, u64)> {
    use std::sync::atomic::Ordering::Relaxed;
    let mut out = Vec::new();
    // One file reached under two of the folders comes across once.
    let mut seen: HashSet<(u64, u64)> = HashSet::new();
    for root in roots {
        let device = std::fs::metadata(root)
            .ok()
            .map(|md| crate::sys::volume_id(&md));
        let mut stack = vec![(root.clone(), 0usize)];
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
                // A search told to look at pictures brings pictures across.
                // Bringing everything would leave a folder of things nobody
                // asked about.
                if !pick.everything() && !pick.holds(&entry.file_name().to_string_lossy()) {
                    continue;
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
    }
    out.sort();
    out
}

/// The part of `path` below whichever folder it was found under.
///
/// The longest match wins so a folder named alongside the folder above it still
/// lands where it says. A path none of them holds comes back as its name alone.
/// Because joining a path that still names its old folder onto the new one
/// writes outside the new one.
pub fn under<'a>(path: &'a Path, roots: &[PathBuf]) -> &'a Path {
    roots
        .iter()
        .filter_map(|root| path.strip_prefix(root).ok())
        .min_by_key(|rest| rest.as_os_str().len())
        .unwrap_or_else(|| Path::new(path.file_name().unwrap_or_default()))
}

/// Works out what would be laid down and what could then go.
///
/// `all` is every file under the old folders. `pairs` is what the search found.
/// A file the search never paired is one of a kind and comes across on its own.
pub fn plan(
    all: &[(PathBuf, u64)],
    pairs: &[Pair],
    roots: &[PathBuf],
    destination: &Path,
    levels: usize,
    top: Top,
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

    // A pair can name a file the listing never brought across. A hard link
    // read under one of its names by the search and under another by the
    // listing is the case that does it. Deferring to a file that is not coming
    // would lose the content altogether.
    let present: HashSet<&Path> = all.iter().map(|(path, _)| path.as_path()).collect();

    let mut taken: HashSet<PathBuf> = HashSet::new();
    let mut items = Vec::new();
    let (mut bytes, mut frees, mut removals, mut renamed) = (0u64, 0u64, 0usize, 0usize);

    for (path, size) in all {
        if copies
            .get(path.as_path())
            .is_some_and(|keeper| present.contains(keeper))
        {
            // Another file holds these bytes and it is the one coming across.
            continue;
        }
        let leaf = path.file_name().unwrap_or_default().to_string_lossy();
        let mut wanted = destination.to_path_buf();
        if let Some(folder) = top.folder(&leaf) {
            wanted.push(folder);
        }
        wanted.push(flatten(under(path, roots), levels));
        let to = free_name(wanted, &mut taken);
        if to.file_name() != path.file_name() {
            renamed += 1;
        }

        let mut same = vec![path.clone()];
        if let Some(rest) = also.get(path.as_path()) {
            same.extend(rest.iter().cloned());
        }
        // Every path in `same` goes on the removal list once the copy is
        // standing. The figure has to cover the same set or the two numbers
        // shown side by side describe different things.
        frees += size * same.len() as u64;
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
        roots: roots.to_vec(),
        destination: destination.to_path_buf(),
        levels,
        top,
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
pub fn free_name(wanted: PathBuf, taken: &mut HashSet<PathBuf>) -> PathBuf {
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
    // Unbounded because a bound here hands back a name already taken and two
    // files then land on one place.
    for n in 2.. {
        let next = folder.join(format!("{stem} ({n}){tail}"));
        if taken.insert(next.clone()) {
            return next;
        }
    }
    unreachable!("the counter has no end")
}

/// Writes the list of what can go, naming only what really arrived.
///
/// `arrived` is every destination the copying really put our bytes at. It is
/// asked for rather than read off the disk. Because a) a destination holding
/// someone else's file of the same name exists and is not our copy b) the
/// copying already refused that case and knows it did and c) a list naming a
/// file whose copy never landed is a list that loses it.
pub fn write_removals(
    plan: &Plan,
    arrived: &HashSet<PathBuf>,
) -> std::io::Result<(PathBuf, usize)> {
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
        if !arrived.contains(&item.to) {
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

/// Lists the folders afresh and works the plan out from them.
///
/// They are walked again rather than the search being trusted for it. Because a
/// search only names what it found twice and this has to bring across
/// everything, one of a kind included.
pub fn start(
    roots: Vec<PathBuf>,
    pairs: Vec<Pair>,
    pick: Pick,
    destination: PathBuf,
    levels: usize,
    top: Top,
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
        let all = files_under(&roots, &pick, &handle.stop);
        handle.found.store(all.len() as u64, Relaxed);
        if !handle.stop.load(Relaxed) {
            let made = plan(&all, &pairs, &roots, &destination, levels, top);
            *handle.plan.lock().unwrap() = Some(std::sync::Arc::new(made));
        }
        handle.done.store(true, Relaxed);
        ctx.request_repaint();
    });
    working
}

#[cfg(test)]
mod tests {
    use super::{Top, flatten, plan, write_removals};
    use crate::cats::Pick;
    use crate::dupes::Pair;
    use std::collections::HashSet;
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

        let made = plan(
            &all,
            &pairs,
            &[root.to_path_buf()],
            Path::new("/new"),
            3,
            Top::Nothing,
        );
        assert_eq!(made.items.len(), 2, "one of each and no more");
        assert_eq!(made.bytes, 107, "only what is laid down is counted");
        assert_eq!(
            made.frees, 307,
            "the figure must cover every file the list names"
        );
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
        let made = plan(
            &all,
            &[],
            &[root.to_path_buf()],
            Path::new("/new"),
            3,
            Top::Nothing,
        );

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

    /// The whole point of the extractor. Several backups read as one pool and
    /// one copy of each file laid down under the new folder.
    #[test]
    fn one_copy_of_each_comes_out_of_every_folder_read() {
        let one = PathBuf::from("/backup one");
        let two = PathBuf::from("/backup two");
        let all = vec![
            (PathBuf::from("/backup one/photos/cat.jpg"), 100),
            (PathBuf::from("/backup one/photos/dog.jpg"), 50),
            (PathBuf::from("/backup two/old/photos/cat.jpg"), 100),
            (PathBuf::from("/backup two/rare.jpg"), 7),
        ];
        let pairs = [pair(
            "/backup one/photos/cat.jpg",
            "/backup two/old/photos/cat.jpg",
            100,
        )];

        let made = plan(
            &all,
            &pairs,
            &[one.clone(), two.clone()],
            Path::new("/one of each"),
            2,
            Top::Nothing,
        );

        assert_eq!(made.items.len(), 3, "the cat came across twice");
        assert_eq!(made.bytes, 157, "only what is laid down is counted");
        assert_eq!(
            made.frees, 257,
            "the figure must cover every file the list names"
        );
        assert_eq!(made.roots, vec![one, two]);

        // Each file is laid out below the folder it was found under rather than
        // below whichever folder came first.
        let rare = made
            .items
            .iter()
            .find(|i| i.from.ends_with("rare.jpg"))
            .expect("the one held in the second backup only");
        assert_eq!(rare.to, PathBuf::from("/one of each/rare.jpg"));
        let dog = made
            .items
            .iter()
            .find(|i| i.from.ends_with("dog.jpg"))
            .unwrap();
        assert_eq!(dog.to, PathBuf::from("/one of each/photos/dog.jpg"));
    }

    /// Picking pictures and music out of a set of backups is worth nothing if
    /// they all land in one heap.
    #[test]
    fn each_file_type_can_have_a_folder_of_its_own() {
        let root = PathBuf::from("/disk");
        let all = vec![
            (PathBuf::from("/disk/holiday/beach.jpg"), 10),
            (PathBuf::from("/disk/holiday/song.mp3"), 20),
            (PathBuf::from("/disk/holiday/notes"), 30),
        ];

        let made = plan(&all, &[], &[root], Path::new("/sorted"), 1, Top::Group);

        let where_ = |name: &str| {
            made.items
                .iter()
                .find(|i| i.from.ends_with(name))
                .map(|i| i.to.clone())
                .unwrap()
        };
        assert_eq!(
            where_("beach.jpg"),
            PathBuf::from("/sorted/Image/beach.jpg")
        );
        assert_eq!(where_("song.mp3"), PathBuf::from("/sorted/Audio/song.mp3"));
        assert_eq!(
            where_("notes"),
            PathBuf::from("/sorted/Other/notes"),
            "a file the name says nothing about still lands somewhere"
        );
        assert_eq!(made.top, Top::Group, "the plan forgot how it was laid out");
    }

    /// The point of a bundle. Photos and video land together rather than in a
    /// folder each.
    #[test]
    fn a_bundle_puts_photos_and_video_in_one_folder() {
        let root = PathBuf::from("/disk");
        let all = vec![
            (PathBuf::from("/disk/holiday/beach.jpg"), 10),
            (PathBuf::from("/disk/holiday/film.mp4"), 20),
            (PathBuf::from("/disk/holiday/song.mp3"), 30),
        ];

        let made = plan(&all, &[], &[root], Path::new("/sorted"), 1, Top::Bundle);

        let where_ = |name: &str| {
            made.items
                .iter()
                .find(|i| i.from.ends_with(name))
                .map(|i| i.to.clone())
                .unwrap()
        };
        assert_eq!(
            where_("beach.jpg"),
            PathBuf::from("/sorted/Photos and video/beach.jpg")
        );
        assert_eq!(
            where_("film.mp4"),
            PathBuf::from("/sorted/Photos and video/film.mp4"),
            "the film landed apart from the photo"
        );
        assert_eq!(where_("song.mp3"), PathBuf::from("/sorted/Music/song.mp3"));
    }

    /// A pair may name a file the listing never brought across. Deferring to it
    /// would lose the content.
    #[test]
    fn a_file_whose_keeper_is_not_coming_comes_across_itself() {
        let all = vec![(PathBuf::from("/disk/b/shot.jpeg"), 10)];
        let pairs = [pair("/disk/a/shot.jpg", "/disk/b/shot.jpeg", 10)];

        let made = plan(
            &all,
            &pairs,
            &[PathBuf::from("/disk")],
            Path::new("/new"),
            3,
            Top::Nothing,
        );

        assert_eq!(
            made.items.len(),
            1,
            "the only copy of the bytes was dropped"
        );
        assert_eq!(made.items[0].from, PathBuf::from("/disk/b/shot.jpeg"));
    }

    /// A path that none of the folders holds must never be written outside the
    /// new folder.
    #[test]
    fn a_path_from_nowhere_lands_under_the_new_folder_by_its_name() {
        assert_eq!(
            super::under(Path::new("/elsewhere/loose.txt"), &[PathBuf::from("/disk")]),
            Path::new("loose.txt")
        );
        assert_eq!(
            super::under(
                Path::new("/disk/deep/x.txt"),
                &[PathBuf::from("/disk"), PathBuf::from("/disk/deep")]
            ),
            Path::new("x.txt"),
            "the folder nearest the file is the one it sits under"
        );
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
        let found = super::files_under(std::slice::from_ref(&root), &Pick::default(), &stop);

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
    fn every_folder_given_is_walked_and_read_once() {
        let ground = std::env::temp_dir().join(format!("spacemongor-walk2-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ground);
        let one = ground.join("one");
        let two = ground.join("two");
        std::fs::create_dir_all(one.join("pics")).unwrap();
        std::fs::create_dir_all(&two).unwrap();
        std::fs::write(one.join("pics/a.jpg"), b"1").unwrap();
        std::fs::write(one.join("notes.txt"), b"22").unwrap();
        std::fs::write(two.join("b.jpg"), b"333").unwrap();

        let stop = std::sync::atomic::AtomicBool::new(false);
        let found = super::files_under(&[one.clone(), two.clone()], &Pick::default(), &stop);
        assert_eq!(found.len(), 3, "{found:?}");

        let pictures = Pick::of_cats([crate::cats::Cat::Image]);
        let only = super::files_under(&[one.clone(), two.clone()], &pictures, &stop);
        assert_eq!(only.len(), 2, "the text file came across: {only:?}");
        assert!(
            only.iter()
                .all(|(p, _)| p.extension().is_some_and(|e| e == "jpg"))
        );

        // Named extensions narrow it again inside the groups ticked.
        let raw = Pick {
            cats: pictures.cats.clone(),
            exts: crate::cats::extensions("png"),
        };
        assert!(
            super::files_under(&[one, two], &raw, &stop).is_empty(),
            "a jpg came across a png only pick"
        );

        std::fs::remove_dir_all(&ground).unwrap();
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
        let made = plan(
            &all,
            &pairs,
            &[PathBuf::from("/disk")],
            &ground.join("new"),
            3,
            Top::Nothing,
        );

        // Only one of the two copies really arrived.
        let landed = made
            .items
            .iter()
            .find(|i| i.from.ends_with("a/here.mp3"))
            .unwrap();
        let arrived: HashSet<PathBuf> = [landed.to.clone()].into_iter().collect();

        let (at, named) = write_removals(&made, &arrived).unwrap();
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

    /// The case that loses a file. Something else already sits where the copy
    /// would go so the copying refuses it. The destination exists and holds
    /// someone else's bytes. Naming the source would be naming its only copy.
    #[test]
    fn a_refused_destination_is_never_named() {
        let ground =
            std::env::temp_dir().join(format!("spacemongor-refused-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ground);
        let new = ground.join("new");
        std::fs::create_dir_all(&new).unwrap();

        let all = vec![(PathBuf::from("/disk/a/notes.txt"), 12)];
        let made = plan(&all, &[], &[PathBuf::from("/disk")], &new, 3, Top::Nothing);

        // A stranger of the same name is standing there. The copying leaves it
        // alone and reports it refused so nothing arrived.
        let to = &made.items[0].to;
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::write(to, b"a stranger").unwrap();
        assert!(to.exists(), "the fixture did not stand the stranger up");

        let (at, named) = write_removals(&made, &HashSet::new()).unwrap();
        let text = std::fs::read_to_string(&at).unwrap();
        assert_eq!(named, 0, "it named a file whose copy was refused");
        assert!(
            !text.contains("notes.txt"),
            "the only copy was listed for removal: {text}"
        );

        std::fs::remove_dir_all(&ground).unwrap();
    }
}
