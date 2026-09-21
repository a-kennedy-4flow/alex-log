//! Copying the redundant copies to one place.
//!
//! This is the only part of the program that writes anywhere other than its own
//! cache. It copies. It never moves and it never deletes and it never writes
//! over anything that is already there.

use crate::cats::{self, Cat};
use crate::dupes::Pair;
use eframe::egui;
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, Mutex};

/// Written beside what is copied so every copy can be traced back.
const MANIFEST: &str = "spacemongor-gathered.tsv";

/// What to gather and where to put it.
pub struct Choice {
    pub cats: HashSet<Cat>,
    pub destination: PathBuf,
}

/// One file the plan would copy.
pub struct Item {
    pub from: PathBuf,
    pub to: PathBuf,
    pub size: u64,
    pub cat: Cat,
    /// True when something already sits where this would go.
    pub taken: bool,
}

pub struct Plan {
    pub items: Vec<Item>,
    pub bytes: u64,
    /// Places already holding something. None is written over.
    pub taken: usize,
    /// Names changed because two different files reached one place.
    pub renamed: usize,
    pub free: Option<u64>,
    pub destination: PathBuf,
}

impl Plan {
    /// True when what is to be written will not fit.
    pub fn too_big(&self) -> bool {
        self.free.is_some_and(|free| self.bytes > free)
    }
}

/// Works out what would be copied without copying anything.
///
/// Only the redundant copy of a pair is ever offered. The one being kept is
/// never touched because a gather that could move the original is how someone
/// loses a file.
pub fn plan(pairs: &[Pair], roots: &[PathBuf], choice: &Choice) -> Plan {
    let mut items = Vec::new();
    let mut bytes = 0;
    let mut taken = 0;
    let mut renamed = 0;
    let mut offered: HashSet<PathBuf> = HashSet::new();
    let mut placed: HashSet<PathBuf> = HashSet::new();

    for pair in pairs {
        let cat = cats::of(&name_of(&pair.b));
        if !choice.cats.contains(&cat) {
            continue;
        }
        // One file offered twice is one file. Held apart from the collision
        // below because two different files reaching one place is not that.
        if !offered.insert(pair.b.clone()) {
            continue;
        }
        // The tree under the folder searched is laid out again under the
        // destination. Because a) two files of one name from two folders would
        // otherwise land on each other and b) a path that still reads the same
        // is a path someone can check.
        let wanted = choice
            .destination
            .join(crate::consolidate::under(&pair.b, roots));
        let to = crate::consolidate::free_name(wanted, &mut placed);
        if to.file_name() != pair.b.file_name() {
            renamed += 1;
        }
        let here = to.exists();
        if here {
            taken += 1;
        }
        bytes += pair.size;
        items.push(Item {
            from: pair.b.clone(),
            to,
            size: pair.size,
            cat,
            taken: here,
        });
    }

    items.sort_by(|x, y| y.size.cmp(&x.size).then_with(|| x.to.cmp(&y.to)));
    Plan {
        items,
        bytes,
        taken,
        renamed,
        free: crate::sys::free_space(&choice.destination),
        destination: choice.destination.clone(),
    }
}

/// What to do with the copies.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Action {
    /// Write them somewhere else. Nothing is taken away.
    Copy,
    /// Hand them to the recycle bin of the host. Never an outright delete.
    Trash,
}

impl Action {
    pub fn verb(self) -> &'static str {
        match self {
            Action::Copy => "Copying",
            Action::Trash => "Sending to the recycle bin",
        }
    }
}

/// How one file ended.
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Outcome {
    Done,
    /// The same bytes were already there. Copying only.
    AlreadyThere,
    /// Something else was there. Nothing was written over. Copying only.
    Refused,
    Failed,
}

pub struct Job {
    pub action: Action,
    pub cancel: AtomicBool,
    pub done: AtomicBool,
    /// Files the action was carried out on.
    pub acted: AtomicU64,
    pub bytes: AtomicU64,
    pub already: AtomicU64,
    pub refused: AtomicU64,
    pub failed: AtomicU64,
    pub of: u64,
    pub of_bytes: u64,
    pub destination: PathBuf,
    pub current: Mutex<String>,
    /// What went wrong and where. Named so it can be acted on.
    pub trouble: Mutex<Vec<String>>,
    /// Every place our bytes are really standing. Filled as the copying goes.
    /// The removal list is built from this rather than from what is on disk.
    arrived: Mutex<HashSet<PathBuf>>,
}

impl Job {
    pub fn stop(&self) {
        self.cancel.store(true, Relaxed);
    }

    pub fn current(&self) -> String {
        self.current.lock().unwrap().clone()
    }

    pub fn trouble(&self) -> Vec<String> {
        self.trouble.lock().unwrap().clone()
    }

    /// Every destination now holding the bytes that were asked for.
    pub fn arrived(&self) -> HashSet<PathBuf> {
        self.arrived.lock().unwrap().clone()
    }
}

pub fn start(plan: Plan, action: Action, ctx: egui::Context) -> Arc<Job> {
    let job = Arc::new(Job {
        action,
        cancel: AtomicBool::new(false),
        done: AtomicBool::new(false),
        acted: AtomicU64::new(0),
        bytes: AtomicU64::new(0),
        already: AtomicU64::new(0),
        refused: AtomicU64::new(0),
        failed: AtomicU64::new(0),
        of: plan.items.len() as u64,
        of_bytes: plan.bytes,
        destination: plan.destination.clone(),
        current: Mutex::new(String::new()),
        trouble: Mutex::new(Vec::new()),
        arrived: Mutex::new(HashSet::new()),
    });
    let handle = Arc::clone(&job);
    std::thread::spawn(move || {
        run(&plan, action, &handle);
        handle.done.store(true, Relaxed);
        handle.current.lock().unwrap().clear();
        ctx.request_repaint();
    });
    job
}

fn run(plan: &Plan, action: Action, job: &Job) {
    let mut written: Vec<(&Item, PathBuf)> = Vec::new();
    for item in &plan.items {
        if job.cancel.load(Relaxed) {
            break;
        }
        *job.current.lock().unwrap() = item.from.display().to_string();
        let (how, went) = match action {
            Action::Copy => (copy_one(item), item.to.clone()),
            Action::Trash => match crate::sys::trash(&item.from) {
                Ok(landed) => (Outcome::Done, landed),
                Err(why) => {
                    job.trouble
                        .lock()
                        .unwrap()
                        .push(format!("{} could not go: {why}", item.from.display()));
                    (Outcome::Failed, PathBuf::new())
                }
            },
        };
        match how {
            Outcome::Done => {
                job.acted.fetch_add(1, Relaxed);
                job.bytes.fetch_add(item.size, Relaxed);
                if action == Action::Copy {
                    job.arrived.lock().unwrap().insert(item.to.clone());
                }
                written.push((item, went));
            }
            Outcome::AlreadyThere => {
                job.already.fetch_add(1, Relaxed);
                job.arrived.lock().unwrap().insert(item.to.clone());
            }
            Outcome::Refused => {
                job.refused.fetch_add(1, Relaxed);
                job.trouble.lock().unwrap().push(format!(
                    "something else already sits at {}",
                    item.to.display()
                ));
            }
            Outcome::Failed => {
                job.failed.fetch_add(1, Relaxed);
                if action == Action::Copy {
                    job.trouble
                        .lock()
                        .unwrap()
                        .push(format!("could not copy {}", item.from.display()));
                }
            }
        }
    }
    // The record of a gather goes where the gather went. The record of a clear
    // out goes to the data folder beside the cache. Because a) a clear out is
    // given no destination to write to b) inside the bin it is an entry with no
    // record of its own, which the host shows as trashed and cannot put back,
    // and c) emptying the bin would destroy the record of what the emptying
    // removed.
    let beside = match action {
        Action::Copy => plan.destination.clone(),
        Action::Trash => crate::store::folder(),
    };
    write_manifest(&beside, action, &written);
}

/// Copies one file and reads it back before calling it done.
///
/// The bytes go to a name of their own first and only then take the real one.
/// Because a) a copy that stops halfway must not leave something that looks
/// finished and b) a reader coming along at the wrong moment should see either
/// the whole file or nothing.
fn copy_one(item: &Item) -> Outcome {
    if item.to.exists() {
        return if same(&item.from, &item.to) {
            Outcome::AlreadyThere
        } else {
            Outcome::Refused
        };
    }
    let Some(folder) = item.to.parent() else {
        return Outcome::Failed;
    };
    if std::fs::create_dir_all(folder).is_err() {
        return Outcome::Failed;
    }

    let mut part = item.to.clone().into_os_string();
    part.push(".spacemongor-part");
    let part = PathBuf::from(part);
    let _ = std::fs::remove_file(&part);

    if std::fs::copy(&item.from, &part).is_err() {
        let _ = std::fs::remove_file(&part);
        return Outcome::Failed;
    }
    // Read it back. A copy nobody checked is a copy nobody can trust.
    if !same(&item.from, &part) {
        let _ = std::fs::remove_file(&part);
        return Outcome::Failed;
    }
    if std::fs::rename(&part, &item.to).is_err() {
        let _ = std::fs::remove_file(&part);
        return Outcome::Failed;
    }
    Outcome::Done
}

/// A line for every file acted on so it can be traced or undone by hand.
fn write_manifest(destination: &Path, action: Action, written: &[(&Item, PathBuf)]) {
    if written.is_empty() {
        return;
    }
    let at = destination.join(MANIFEST);
    let fresh = !at.exists();
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&at)
    else {
        return;
    };
    if fresh {
        let _ = writeln!(file, "when\twhat\tbytes\tfrom\tto");
    }
    let what = match action {
        Action::Copy => "copied",
        Action::Trash => "trashed",
    };
    let when = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    for (item, went) in written {
        let _ = writeln!(
            file,
            "{when}\t{what}\t{}\t{}\t{}",
            item.size,
            item.from.display(),
            went.display()
        );
    }
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

/// True when both files hold the same bytes.
fn same(a: &Path, b: &Path) -> bool {
    const CHUNK: usize = 64 * 1024;
    let (Ok(mut fa), Ok(mut fb)) = (std::fs::File::open(a), std::fs::File::open(b)) else {
        return false;
    };
    let mut ba = vec![0u8; CHUNK];
    let mut bb = vec![0u8; CHUNK];
    loop {
        let (Ok(na), Ok(nb)) = (fill(&mut fa, &mut ba), fill(&mut fb, &mut bb)) else {
            return false;
        };
        if na != nb {
            return false;
        }
        if na == 0 {
            return true;
        }
        if ba[..na] != bb[..nb] {
            return false;
        }
    }
}

fn fill(f: &mut std::fs::File, buf: &mut [u8]) -> std::io::Result<usize> {
    use std::io::Read;
    let mut n = 0;
    while n < buf.len() {
        match f.read(&mut buf[n..])? {
            0 => break,
            k => n += k,
        }
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::{Choice, Outcome, Plan, copy_one, plan};
    use crate::cats::Cat;
    use crate::dupes::Pair;
    use std::collections::HashSet;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn ground(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("spacemongor-gather-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn pair(a: &Path, b: &Path, size: u64) -> Pair {
        Pair {
            a: a.to_path_buf(),
            b: b.to_path_buf(),
            size,
        }
    }

    fn want(cats: &[Cat], to: &Path) -> Choice {
        Choice {
            cats: cats.iter().copied().collect::<HashSet<_>>(),
            destination: to.to_path_buf(),
        }
    }

    fn run(plan: &Plan) -> Vec<Outcome> {
        plan.items.iter().map(copy_one).collect()
    }

    #[test]
    fn the_tree_is_laid_out_again_under_the_destination() {
        let base = [PathBuf::from("/disk/photos")];
        let to = Path::new("/gathered");
        let pairs = [
            pair(
                Path::new("/keep/a.jpg"),
                Path::new("/disk/photos/2019/trip/a.jpg"),
                10,
            ),
            pair(
                Path::new("/keep/b.jpg"),
                Path::new("/disk/photos/2020/b.jpg"),
                20,
            ),
        ];

        let made = plan(&pairs, &base, &want(&[Cat::Image], to));
        let places: Vec<&Path> = made.items.iter().map(|i| i.to.as_path()).collect();
        assert!(
            places.contains(&Path::new("/gathered/2020/b.jpg")),
            "{places:?}"
        );
        assert!(
            places.contains(&Path::new("/gathered/2019/trip/a.jpg")),
            "{places:?}"
        );
        assert_eq!(made.bytes, 30);
    }

    #[test]
    fn only_the_wanted_types_are_offered() {
        let base = [PathBuf::from("/disk")];
        let pairs = [
            pair(Path::new("/k/a.jpg"), Path::new("/disk/a.jpg"), 1),
            pair(Path::new("/k/b.mp4"), Path::new("/disk/b.mp4"), 2),
            pair(Path::new("/k/c.rs"), Path::new("/disk/c.rs"), 4),
        ];

        let made = plan(
            &pairs,
            &base,
            &want(&[Cat::Image, Cat::Video], Path::new("/to")),
        );
        assert_eq!(made.items.len(), 2);
        assert_eq!(made.bytes, 3);
        assert!(made.items.iter().all(|i| i.cat != Cat::Code));
    }

    /// The file being kept must never be offered. Moving the original is how
    /// someone loses the only copy they had.
    #[test]
    fn the_one_being_kept_is_never_offered() {
        let pairs = [pair(
            Path::new("/disk/original.jpg"),
            Path::new("/disk/copy/original.jpg"),
            9,
        )];
        let made = plan(
            &pairs,
            &[PathBuf::from("/disk")],
            &want(&[Cat::Image], Path::new("/to")),
        );

        assert_eq!(made.items.len(), 1);
        assert_eq!(made.items[0].from, PathBuf::from("/disk/copy/original.jpg"));
    }

    #[test]
    fn a_copy_lands_and_the_source_is_left_alone() {
        let ground = ground("lands");
        let from = ground.join("disk/holiday/clip.mp4");
        fs::create_dir_all(from.parent().unwrap()).unwrap();
        fs::write(&from, vec![b'v'; 5_000]).unwrap();
        let to = ground.join("gathered");

        let made = plan(
            &[pair(Path::new("/keep/clip.mp4"), &from, 5_000)],
            std::slice::from_ref(&ground.join("disk")),
            &want(&[Cat::Video], &to),
        );
        assert_eq!(run(&made), vec![Outcome::Done]);

        let landed = to.join("holiday/clip.mp4");
        assert!(landed.exists(), "the copy is not there");
        assert_eq!(fs::read(&landed).unwrap(), fs::read(&from).unwrap());
        assert!(from.exists(), "the source was touched");
        assert!(
            fs::read_dir(landed.parent().unwrap())
                .unwrap()
                .flatten()
                .all(|e| !e.file_name().to_string_lossy().contains("-part")),
            "a half written file was left behind"
        );

        fs::remove_dir_all(&ground).unwrap();
    }

    #[test]
    fn the_same_bytes_already_there_are_left_as_they_are() {
        let ground = ground("already");
        let from = ground.join("disk/a.bin");
        fs::create_dir_all(from.parent().unwrap()).unwrap();
        fs::write(&from, vec![b'x'; 900]).unwrap();
        let to = ground.join("gathered");
        fs::create_dir_all(&to).unwrap();
        fs::write(to.join("a.bin"), vec![b'x'; 900]).unwrap();

        let made = plan(
            &[pair(Path::new("/keep/a.bin"), &from, 900)],
            std::slice::from_ref(&ground.join("disk")),
            &want(&[Cat::Data], &to),
        );
        assert_eq!(made.items.len(), 1, "a .bin file is in the data group");
        assert_eq!(made.taken, 1, "the plan says the place is taken");
        assert_eq!(run(&made), vec![Outcome::AlreadyThere]);

        fs::remove_dir_all(&ground).unwrap();
    }

    /// Nothing is ever written over. A different file at the destination stops
    /// that one copy and nothing else.
    #[test]
    fn something_else_at_the_destination_is_refused() {
        let ground = ground("refuse");
        let from = ground.join("disk/notes.txt");
        fs::create_dir_all(from.parent().unwrap()).unwrap();
        fs::write(&from, b"the new words").unwrap();
        let to = ground.join("gathered");
        fs::create_dir_all(&to).unwrap();
        fs::write(to.join("notes.txt"), b"words that were already there").unwrap();

        let made = plan(
            &[pair(Path::new("/keep/notes.txt"), &from, 13)],
            std::slice::from_ref(&ground.join("disk")),
            &want(&[Cat::Document], &to),
        );
        assert_eq!(run(&made), vec![Outcome::Refused]);
        assert_eq!(
            fs::read(to.join("notes.txt")).unwrap(),
            b"words that were already there",
            "what was there was written over"
        );

        fs::remove_dir_all(&ground).unwrap();
    }

    /// The clear out must take the copy and leave the one being kept. A test
    /// trash of its own is used so nothing of the machine's is touched.
    #[test]
    fn the_recycle_bin_takes_the_copy_and_leaves_the_keeper() {
        let ground = ground("trash");
        let keeper = ground.join("disk/original.mp3");
        let copy = ground.join("disk/backup/original.mp3");
        fs::create_dir_all(copy.parent().unwrap()).unwrap();
        fs::write(&keeper, vec![b'k'; 700]).unwrap();
        fs::write(&copy, vec![b'k'; 700]).unwrap();

        let made = plan(
            &[pair(&keeper, &copy, 700)],
            std::slice::from_ref(&ground.join("disk")),
            &want(&[Cat::Audio], &ground.join("unused")),
        );
        assert_eq!(made.items.len(), 1);

        let job = super::start(made, super::Action::Trash, eframe::egui::Context::default());
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(20);
        while !job.done.load(std::sync::atomic::Ordering::Relaxed) {
            assert!(std::time::Instant::now() < deadline, "it never finished");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        assert_eq!(job.acted.load(std::sync::atomic::Ordering::Relaxed), 1);
        assert_eq!(
            job.failed.load(std::sync::atomic::Ordering::Relaxed),
            0,
            "{:?}",
            job.trouble()
        );
        assert!(!copy.exists(), "the copy is still there");
        assert!(keeper.exists(), "the one being kept was taken");
        assert_eq!(fs::read(&keeper).unwrap(), vec![b'k'; 700]);

        fs::remove_dir_all(&ground).unwrap();
    }

    #[test]
    fn two_copies_of_one_name_do_not_land_on_each_other() {
        let base = [PathBuf::from("/disk")];
        let pairs = [
            pair(Path::new("/k/1.jpg"), Path::new("/disk/jan/IMG_1.jpg"), 1),
            pair(Path::new("/k/2.jpg"), Path::new("/disk/feb/IMG_1.jpg"), 2),
        ];
        let made = plan(&pairs, &base, &want(&[Cat::Image], Path::new("/to")));

        assert_eq!(made.items.len(), 2);
        assert_ne!(made.items[0].to, made.items[1].to);
    }
}
