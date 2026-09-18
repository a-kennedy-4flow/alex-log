//! Finding files that hold the same bytes.
//!
//! Two folders can be set against each other and they may sit on different
//! disks. One folder can also be searched on its own. A file is a duplicate of
//! another when the bytes match. The name is not looked at because a copy is
//! still a copy under a new name.
//!
//! A digest costs a whole file read so every one is kept in the cache. A second
//! run over a folder nothing has touched reads no file at all.

use crate::store::{Record, Store};
use crate::sys::Drive;
use eframe::egui;
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Pairs held. The count carries on past this.
///
/// High because the list is not only for reading. Bringing one copy of
/// everything into a new folder needs every pair rather than a sample, and a
/// disk of fifty thousand copies is exactly the one worth doing that to. The
/// view draws only the rows on screen so a long list costs it nothing.
const MAX_LISTED: usize = 500_000;

/// Deepest folder the search will enter. A bind mount can otherwise repeat a
/// tree for ever.
const MAX_DEPTH: usize = 64;

const CHUNK: usize = 64 * 1024;

#[derive(Clone)]
pub struct Pair {
    pub a: PathBuf,
    pub b: PathBuf,
    pub size: u64,
}

pub struct Report {
    pub pairs: Vec<Pair>,
    /// Bytes that deleting the copies would free.
    pub bytes: u64,
    /// Copies found. `pairs` holds the largest `MAX_LISTED` of them.
    pub total: u64,
    pub a_files: u64,
    pub b_files: u64,
    /// Digests taken from the cache rather than read again.
    pub cached: u64,
    /// Pairs settled by reading both files. The cache already knew the rest.
    pub confirmed: u64,
    /// True when neither folder had moved so the whole answer came back from
    /// the last search of them.
    pub from_cache: bool,
}

/// A file worth considering. The identity is what the filesystem calls the file
/// itself rather than the name pointing at it.
struct Entry {
    path: PathBuf,
    size: u64,
    modified: i64,
    id: Option<(u64, u64)>,
    /// What the filesystem knows the file by. Reading in this order follows the
    /// layout on a spinning disk.
    ino: u64,
    /// Digest of the opening block.
    head: Option<u64>,
    /// Digest of the whole file. Only filled when the opening block could not
    /// tell the file apart from another.
    digest: Option<u64>,
    /// Shared by files confirmed to hold the same bytes. A `Cell` because the
    /// matching holds the entries by shared reference while it hands the
    /// numbers out.
    content: Cell<Option<u64>>,
    /// False when the search was told to look only at certain groups and this
    /// file is not one of them. It is still listed and still kept in the cache.
    /// It is only left out of the matching.
    wanted: bool,
}

pub struct Job {
    pub a_root: PathBuf,
    /// The second folder. `None` when one folder is searched on its own.
    pub b_root: Option<PathBuf>,
    /// What the slower of the two drives is. It settles how hard to read.
    pub drive: Drive,
    /// Groups to look at. `None` looks at everything.
    pub only: Option<HashSet<crate::cats::Cat>>,
    /// The cache this search uses. Settled on the thread that started the
    /// search rather than on the one that does the work.
    pub cache: PathBuf,
    pub cancel: AtomicBool,
    pub done: AtomicBool,
    pub stage: Mutex<String>,
    /// The folder being listed or the file being read.
    pub current: Mutex<String>,
    /// Files found while listing.
    pub listed: AtomicU64,
    /// Files digested so far against the files worth digesting.
    pub read: AtomicU64,
    pub of: AtomicU64,
    /// Digests the cache already held.
    pub cached: AtomicU64,
    pub bytes_read: AtomicU64,
    pub bytes_of: AtomicU64,
    /// Copies found so far and what they hold.
    pub found: AtomicU64,
    pub freed: AtomicU64,
    /// Pairs settled by reading both files rather than from the cache.
    pub confirmed: AtomicU64,
    pub report: Mutex<Option<Arc<Report>>>,
    /// How long each phase took in milliseconds. Read by the timing probe.
    pub phases: Mutex<Vec<(&'static str, u128)>>,
}

impl Job {
    pub fn stop(&self) {
        self.cancel.store(true, Relaxed);
    }

    pub fn report(&self) -> Option<Arc<Report>> {
        self.report.lock().unwrap().clone()
    }

    pub fn stage(&self) -> String {
        self.stage.lock().unwrap().clone()
    }

    pub fn current(&self) -> String {
        self.current.lock().unwrap().clone()
    }

    /// True when one folder is being searched rather than two set against each
    /// other.
    pub fn alone(&self) -> bool {
        self.b_root.is_none()
    }

    /// The folder the redundant copies sit under.
    pub fn base(&self) -> &Path {
        self.b_root.as_deref().unwrap_or(&self.a_root)
    }

    fn say(&self, what: &str, ctx: &egui::Context) {
        *self.stage.lock().unwrap() = what.to_string();
        ctx.request_repaint();
    }

    fn at(&self, what: &Path) {
        *self.current.lock().unwrap() = what.display().to_string();
    }

    fn took(&self, phase: &'static str, from: std::time::Instant) {
        self.phases
            .lock()
            .unwrap()
            .push((phase, from.elapsed().as_millis()));
    }
}

pub fn start(
    a: PathBuf,
    b: Option<PathBuf>,
    only: Option<HashSet<crate::cats::Cat>>,
    ctx: egui::Context,
) -> Arc<Job> {
    // Two folders can sit on different drives. The one that likes reading least
    // settles it for both.
    let drive = match (crate::sys::drive(&a), b.as_deref().map(crate::sys::drive)) {
        (Drive::Spinning, _) | (_, Some(Drive::Spinning)) => Drive::Spinning,
        (Drive::Solid, None) | (Drive::Solid, Some(Drive::Solid)) => Drive::Solid,
        _ => Drive::Unknown,
    };
    let job = Arc::new(Job {
        a_root: a,
        b_root: b,
        drive,
        only,
        cache: crate::store::path(),
        cancel: AtomicBool::new(false),
        done: AtomicBool::new(false),
        stage: Mutex::new("starting".to_string()),
        current: Mutex::new(String::new()),
        listed: AtomicU64::new(0),
        read: AtomicU64::new(0),
        of: AtomicU64::new(0),
        cached: AtomicU64::new(0),
        bytes_read: AtomicU64::new(0),
        bytes_of: AtomicU64::new(0),
        found: AtomicU64::new(0),
        freed: AtomicU64::new(0),
        confirmed: AtomicU64::new(0),
        report: Mutex::new(None),
        phases: Mutex::new(Vec::new()),
    });
    let handle = Arc::clone(&job);
    std::thread::spawn(move || {
        run(&handle, &ctx);
        handle.done.store(true, Relaxed);
        handle.current.lock().unwrap().clear();
        ctx.request_repaint();
    });
    job
}

fn run(job: &Job, ctx: &egui::Context) {
    let clock = std::time::Instant::now();
    job.say("listing the folder", ctx);
    let mut a = list(&job.a_root, job);
    if job.cancel.load(Relaxed) {
        return;
    }
    let mut b = match &job.b_root {
        Some(root) => {
            job.say("listing the second folder", ctx);
            let found = list(root, job);
            if job.cancel.load(Relaxed) {
                return;
            }
            Some(found)
        }
        None => None,
    };
    job.took("walk", clock);

    let clock = std::time::Instant::now();
    // What the walk itself saw. Settled before anything is read so a folder
    // that has not moved can be answered from the last search of it.
    let asked = asked_for(job);
    let walk_a = mark_of(&a, false, asked);
    let walk_b = b.as_ref().map(|b| mark_of(b, false, asked));

    let mut store = Store::open_at(&job.cache);
    if let Some(store) = &store
        && let Some(kept) = store.answer(&job.a_root, job.b_root.as_deref(), walk_a, walk_b)
    {
        job.found.store(kept.total, Relaxed);
        job.freed.store(kept.bytes, Relaxed);
        *job.report.lock().unwrap() = Some(Arc::new(Report {
            pairs: kept
                .pairs
                .into_iter()
                .map(|(a, b, size)| Pair { a, b, size })
                .collect(),
            bytes: kept.bytes,
            total: kept.total,
            a_files: kept.a_files,
            b_files: kept.b_files,
            cached: 0,
            confirmed: 0,
            from_cache: true,
        }));
        job.took("answered from the cache", clock);
        job.say("done", ctx);
        return;
    }

    let mut held_a = HashMap::new();
    let mut held_b = HashMap::new();
    if let Some(store) = &store {
        job.say("reading the cache", ctx);
        held_a = store.known(&job.a_root);
        recall(&held_a, &mut a);
        if let (Some(b), Some(root)) = (&mut b, &job.b_root) {
            held_b = store.known(root);
            recall(&held_b, b);
        }
    }
    job.took("recall", clock);

    // Only a size held more than once can hold a twin. Sizes are free and bytes
    // are not so the size settles what has to be read.
    let wanted: HashSet<u64> = match &b {
        Some(b) => {
            let left: HashSet<u64> = a.iter().filter(|e| e.wanted).map(|e| e.size).collect();
            b.iter()
                .filter(|e| e.wanted)
                .map(|e| e.size)
                .filter(|s| left.contains(s))
                .collect()
        }
        None => {
            let mut seen: HashMap<u64, u32> = HashMap::new();
            for e in a.iter().filter(|e| e.wanted) {
                *seen.entry(e.size).or_insert(0) += 1;
            }
            seen.into_iter()
                .filter(|(_, n)| *n > 1)
                .map(|(s, _)| s)
                .collect()
        }
    };
    let sides = [Some(&a), b.as_ref()];
    job.of.store(
        sides
            .iter()
            .flatten()
            .flat_map(|side| side.iter())
            .filter(|e| wanted.contains(&e.size))
            .count() as u64,
        Relaxed,
    );
    job.bytes_of.store(
        sides
            .iter()
            .flatten()
            .flat_map(|side| side.iter())
            .filter(|e| wanted.contains(&e.size))
            .map(|e| e.size.min(CHUNK as u64))
            .sum(),
        Relaxed,
    );

    // The opening block throws out most candidates without reading the rest of
    // any file. Only what still collides after that is read in full.
    let clock = std::time::Instant::now();
    if job.drive.wants_layout_order() {
        // A spinning disk reads far better in the order the filesystem laid the
        // files down than in the order the folders name them.
        a.sort_by_key(|e| e.ino);
        if let Some(b) = &mut b {
            b.sort_by_key(|e| e.ino);
        }
    }
    job.say("reading the opening block of each file", ctx);
    spread(&mut a, job, |e, job| head_of(e, &wanted, job));
    if let Some(b) = &mut b {
        spread(b, job, |e, job| head_of(e, &wanted, job));
    }
    if job.cancel.load(Relaxed) {
        return;
    }
    job.took("head", clock);

    let deep = colliding(&a, b.as_deref(), &wanted);
    let clock = std::time::Instant::now();
    if !deep.is_empty() {
        job.say("reading the files that still match", ctx);
        job.bytes_of.fetch_add(
            [Some(&a), b.as_ref()]
                .iter()
                .flatten()
                .flat_map(|side| side.iter())
                .filter(|e| {
                    e.digest.is_none() && e.head.is_some_and(|h| deep.contains(&(e.size, h)))
                })
                .map(|e| e.size)
                .sum(),
            Relaxed,
        );
        spread(&mut a, job, |e, job| whole_of(e, &deep, job));
        if let Some(b) = &mut b {
            spread(b, job, |e, job| whole_of(e, &deep, job));
        }
        if job.cancel.load(Relaxed) {
            return;
        }
    }
    job.took("digest", clock);

    let clock = std::time::Instant::now();
    job.say("matching", ctx);
    let mut next = store.as_ref().map_or(1, |held| held.last_content() + 1);
    let (a_files, b_files) = (a.len() as u64, b.as_ref().map_or(0, |b| b.len() as u64));
    let Some((pairs, bytes, total)) = (match &b {
        Some(b) => across(job, &a, b, &mut next),
        None => within(job, &a, &mut next),
    }) else {
        return;
    };
    job.took("match", clock);

    // Written after the matching so the content numbers go in beside the
    // digests rather than needing a second pass.
    let clock = std::time::Instant::now();
    if let Some(store) = &mut store {
        // A folder that comes back exactly as it was left needs no writing at
        // all. Finding that out costs one row rather than all of them.
        let rows_a = mark_of(&a, true, asked);
        if store.mark(&job.a_root) != Some(rows_a) {
            job.say("writing the cache", ctx);
            store.remember(&job.a_root, &records(&a), &held_a, rows_a, walk_a);
        }
        if let (Some(b), Some(root), Some(walk_b)) = (&b, &job.b_root, walk_b) {
            let rows_b = mark_of(b, true, asked);
            if store.mark(root) != Some(rows_b) {
                job.say("writing the cache", ctx);
                store.remember(root, &records(b), &held_b, rows_b, walk_b);
            }
        }
    }
    job.took("remember", clock);

    if let Some(store) = &mut store {
        store.keep_answer(
            &job.a_root,
            job.b_root.as_deref(),
            walk_a,
            walk_b,
            &crate::store::Answer {
                pairs: pairs
                    .iter()
                    .map(|p| (p.a.clone(), p.b.clone(), p.size))
                    .collect(),
                bytes,
                total,
                a_files,
                b_files,
            },
        );
    }

    *job.report.lock().unwrap() = Some(Arc::new(Report {
        pairs,
        bytes,
        total,
        a_files,
        b_files,
        cached: job.cached.load(Relaxed),
        confirmed: job.confirmed.load(Relaxed),
        from_cache: false,
    }));
    job.say("done", ctx);
}

/// Takes the digest the cache holds for any file it has seen unchanged.
fn recall(held: &std::collections::HashMap<PathBuf, crate::store::Known>, entries: &mut [Entry]) {
    for e in entries.iter_mut() {
        if let Some(known) = held.get(&e.path)
            && known.size == e.size
            && known.modified == e.modified
        {
            e.head = known.head;
            e.digest = known.digest;
            e.content.set(known.content);
        }
    }
}

/// Runs `work` over every entry on as many threads as the drive wants.
///
/// A solid state drive serves many reads at once better than one at a time. A
/// spinning disk does the opposite so it gets a single reader.
fn spread<F>(entries: &mut [Entry], job: &Job, work: F)
where
    F: Fn(&mut Entry, &Job) + Sync,
{
    let threads = job.drive.readers();
    if entries.is_empty() {
        return;
    }
    let chunk = (entries.len() / (threads * 4)).max(32);
    let queue: Mutex<Vec<&mut [Entry]>> = Mutex::new(entries.chunks_mut(chunk).collect());
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let Some(part) = queue.lock().unwrap().pop() else {
                        return;
                    };
                    for entry in part {
                        if job.cancel.load(Relaxed) {
                            return;
                        }
                        work(entry, job);
                    }
                }
            });
        }
    });
}

/// Digests the opening block. A file no larger than one block is finished here
/// because the opening block is the whole of it.
fn head_of(e: &mut Entry, wanted: &HashSet<u64>, job: &Job) {
    if !e.wanted || !wanted.contains(&e.size) {
        return;
    }
    if e.head.is_some() {
        job.cached.fetch_add(1, Relaxed);
    } else {
        job.at(&e.path);
        e.head = digest(&e.path, Some(CHUNK));
        if e.size <= CHUNK as u64 {
            e.digest = e.head;
        }
    }
    job.read.fetch_add(1, Relaxed);
    job.bytes_read.fetch_add(e.size.min(CHUNK as u64), Relaxed);
}

/// Digests the whole file for the ones the opening block could not tell apart.
fn whole_of(e: &mut Entry, deep: &HashSet<(u64, u64)>, job: &Job) {
    if !e.wanted || e.digest.is_some() {
        return;
    }
    let Some(head) = e.head else {
        return;
    };
    if !deep.contains(&(e.size, head)) {
        return;
    }
    job.at(&e.path);
    e.digest = digest(&e.path, None);
    job.read.fetch_add(1, Relaxed);
    job.bytes_read.fetch_add(e.size, Relaxed);
}

/// Sizes and opening blocks that more than one file carries. Anything outside
/// this set is already known to be alone.
fn colliding(a: &[Entry], b: Option<&[Entry]>, wanted: &HashSet<u64>) -> HashSet<(u64, u64)> {
    let mut seen: HashMap<(u64, u64), u32> = HashMap::new();
    for e in a.iter().chain(b.into_iter().flatten()) {
        if !e.wanted || !wanted.contains(&e.size) || e.size <= CHUNK as u64 {
            continue;
        }
        if let Some(head) = e.head {
            *seen.entry((e.size, head)).or_insert(0) += 1;
        }
    }
    seen.into_iter()
        .filter(|(_, n)| *n > 1)
        .map(|(k, _)| k)
        .collect()
}

/// A number standing for which groups were asked about. Zero for everything.
fn asked_for(job: &Job) -> u64 {
    let Some(only) = &job.only else {
        return 0;
    };
    let mut keys: Vec<u64> = only.iter().map(|c| c.key()).collect();
    keys.sort_unstable();
    keys.iter().fold(1u64, |acc, k| mix(acc.wrapping_add(*k)))
}

/// A number standing for the whole of what a walk found.
///
/// `asked` folds in which groups the search was told to look at. Because the
/// same folder searched for pictures and searched for everything are two
/// different questions and must not share one stored answer.
///
/// `with_digests` decides which question it answers. Without them it says
/// whether the folder itself moved and can be settled before a file is read.
/// With them it says whether any row in the cache would change.
///
/// Every file adds the same amount however the threads happened to order them
/// so two walks of one unchanged folder always agree. Anything that would move
/// a row moves the mark.
fn mark_of(entries: &[Entry], with_digests: bool, asked: u64) -> u64 {
    let mut total = (entries.len() as u64).wrapping_add(mix(asked));
    for e in entries {
        let mut h = 0xcbf2_9ce4_8422_2325u64;
        for byte in e.path.as_os_str().as_encoded_bytes() {
            h ^= *byte as u64;
            h = h.wrapping_mul(0x1000_0000_01b3);
        }
        let mut one = mix(h)
            .wrapping_add(mix(e.size))
            .wrapping_add(mix(e.modified as u64));
        if with_digests {
            one = one.wrapping_add(mix(e.digest.unwrap_or(0)));
        }
        total = total.wrapping_add(one);
    }
    total
}

/// Only files the search actually read are kept.
///
/// A row with no digest holds nothing worth having. The size and the modified
/// time come free with the next walk and the sizes worth reading are worked out
/// from that walk rather than from the cache. Keeping the rest made the cache
/// four times larger than it needed to be and both reading it and writing it
/// cost accordingly.
fn records(entries: &[Entry]) -> Vec<Record> {
    entries
        .iter()
        .filter(|e| e.head.is_some() || e.digest.is_some())
        .map(|e| Record {
            path: e.path.clone(),
            size: e.size,
            modified: e.modified,
            head: e.head,
            digest: e.digest,
            content: e.content.get(),
        })
        .collect()
}

/// Files gathered by the bytes they hold.
///
/// Each group is put in path order so the pair reported never depends on which
/// thread reached the file first.
fn by_size(files: &[Entry]) -> HashMap<u64, Vec<&Entry>> {
    let mut m: HashMap<u64, Vec<&Entry>> = HashMap::new();
    // A file left out of the search never reaches the matching even when the
    // cache still holds a digest for it from a wider run.
    for e in files.iter().filter(|e| e.wanted) {
        m.entry(e.size).or_default().push(e);
    }
    for group in m.values_mut() {
        group.sort_by(|x, y| x.path.cmp(&y.path));
    }
    m
}

/// True when the two files hold the same bytes.
///
/// A pair the cache has already settled is answered from the content number.
/// Anything else is read. The digest only narrows the field.
fn identical(x: &Entry, y: &Entry, job: &Job) -> bool {
    if let (Some(p), Some(q)) = (x.content.get(), y.content.get())
        && p == q
    {
        return true;
    }
    job.confirmed.fetch_add(1, Relaxed);
    same(&x.path, &y.path, job.drive.compare_chunk())
}

/// Hands one content number to a set of files just confirmed identical. A
/// number one of them already carries is kept so the set joins what the cache
/// knows rather than starting again.
fn mark(set: &[&Entry], next: &mut u64) {
    let id = set.iter().find_map(|e| e.content.get()).unwrap_or_else(|| {
        let fresh = *next;
        *next += 1;
        fresh
    });
    for e in set {
        e.content.set(Some(id));
    }
}

/// Files under the first folder that the second folder also holds.
fn across(job: &Job, a: &[Entry], b: &[Entry], next: &mut u64) -> Option<(Vec<Pair>, u64, u64)> {
    let (ga, gb) = (by_size(a), by_size(b));
    let shared: Vec<u64> = ga.keys().filter(|s| gb.contains_key(s)).copied().collect();

    let mut pairs: Vec<Pair> = Vec::new();
    let (mut total, mut bytes) = (0u64, 0u64);
    for size in shared {
        if job.cancel.load(Relaxed) {
            return None;
        }
        let mut seen: HashMap<u64, Vec<&Entry>> = HashMap::new();
        for e in &ga[&size] {
            if let Some(h) = e.digest {
                seen.entry(h).or_default().push(e);
            }
        }
        for e in &gb[&size] {
            let Some(h) = e.digest else {
                continue;
            };
            let Some(twins) = seen.get(&h) else {
                continue;
            };
            // A twin that is the same file under a second name is left out
            // because deleting that name frees nothing.
            let Some(twin) = twins.iter().find(|t| !linked(t, e) && identical(t, e, job)) else {
                continue;
            };
            mark(&[twin, e], next);
            bytes += size;
            total += 1;
            job.found.store(total, Relaxed);
            job.freed.store(bytes, Relaxed);
            if pairs.len() < MAX_LISTED {
                pairs.push(Pair {
                    a: twin.path.clone(),
                    b: e.path.clone(),
                    size,
                });
            }
        }
    }
    pairs.sort_by_key(|p| std::cmp::Reverse(p.size));
    Some((pairs, bytes, total))
}

/// Copies held more than once under one folder. The shortest path is treated as
/// the one to keep and every other copy is reported against it.
fn within(job: &Job, files: &[Entry], next: &mut u64) -> Option<(Vec<Pair>, u64, u64)> {
    let groups = by_size(files);
    let sizes: Vec<u64> = groups
        .iter()
        .filter(|(_, g)| g.len() > 1)
        .map(|(s, _)| *s)
        .collect();

    let mut pairs: Vec<Pair> = Vec::new();
    let (mut total, mut bytes) = (0u64, 0u64);
    for size in sizes {
        if job.cancel.load(Relaxed) {
            return None;
        }
        let mut seen: HashMap<u64, Vec<&Entry>> = HashMap::new();
        for e in &groups[&size] {
            if let Some(h) = e.digest {
                seen.entry(h).or_default().push(e);
            }
        }
        for candidates in seen.into_values() {
            if candidates.len() < 2 {
                continue;
            }
            // The digest agrees. Split the candidates into sets that agree on
            // every byte.
            let mut sets: Vec<Vec<&Entry>> = Vec::new();
            for e in candidates {
                match sets.iter_mut().find(|set| identical(set[0], e, job)) {
                    Some(set) => set.push(e),
                    None => sets.push(vec![e]),
                }
            }
            for mut set in sets {
                if set.len() < 2 {
                    continue;
                }
                mark(&set, next);
                set.sort_by(|x, y| {
                    x.path
                        .as_os_str()
                        .len()
                        .cmp(&y.path.as_os_str().len())
                        .then_with(|| x.path.cmp(&y.path))
                });
                let keep = set[0];
                for extra in &set[1..] {
                    bytes += size;
                    total += 1;
                    job.found.store(total, Relaxed);
                    job.freed.store(bytes, Relaxed);
                    if pairs.len() < MAX_LISTED {
                        pairs.push(Pair {
                            a: keep.path.clone(),
                            b: extra.path.clone(),
                            size,
                        });
                    }
                }
            }
        }
    }
    pairs.sort_by_key(|p| std::cmp::Reverse(p.size));
    Some((pairs, bytes, total))
}

/// True when both names point at one file on the disk. Deleting either name
/// then frees nothing.
fn linked(x: &Entry, y: &Entry) -> bool {
    x.id.is_some() && x.id == y.id
}

/// Every file under `root` with the bytes it holds. Empty files are left out
/// because every empty file matches every other one. A file reached twice
/// through a second hard link is listed once.
fn list(root: &Path, job: &Job) -> Vec<Entry> {
    let threads = job.drive.readers().min(8);
    let mut found = if threads > 1 {
        many_walkers(root, job, threads)
    } else {
        one_walker(root, job)
    };

    // A second name for a file already listed adds nothing. The names arrive in
    // whatever order the threads finished so the one kept is settled here.
    found.sort_by(|x, y| x.path.cmp(&y.path));
    let mut seen: HashSet<(u64, u64)> = HashSet::new();
    found.retain(|e| match e.id {
        Some(key) => seen.insert(key),
        None => true,
    });
    found
}

/// Reads one folder and hands back what it held and the folders below it.
fn read_folder(
    dir: &Path,
    depth: usize,
    job: &Job,
    into: &mut Vec<Entry>,
) -> Vec<(PathBuf, usize)> {
    let mut below = Vec::new();
    job.at(dir);
    let Ok(entries) = std::fs::read_dir(dir) else {
        return below;
    };
    for entry in entries.flatten() {
        let Ok(md) = entry.metadata() else {
            continue;
        };
        if md.is_dir() {
            below.push((entry.path(), depth + 1));
            continue;
        }
        if !md.is_file() || md.len() == 0 {
            continue;
        }
        let leaf = entry.file_name().to_string_lossy().into_owned();
        into.push(Entry {
            path: entry.path(),
            size: md.len(),
            modified: changed(&md),
            id: crate::sys::hard_link_key(&md),
            ino: crate::sys::inode(&md),
            head: None,
            digest: None,
            content: Cell::new(None),
            wanted: job
                .only
                .as_ref()
                .is_none_or(|only| only.contains(&crate::cats::of(&leaf))),
        });
        job.listed.fetch_add(1, Relaxed);
    }
    below
}

fn one_walker(root: &Path, job: &Job) -> Vec<Entry> {
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        if job.cancel.load(Relaxed) || depth > MAX_DEPTH {
            continue;
        }
        stack.append(&mut read_folder(&dir, depth, job, &mut out));
    }
    out
}

/// The same walk shared out. Reading a folder is a wait on the drive so a
/// solid state drive serves several at once.
///
/// A worker stops only when the queue is empty and no other worker is still
/// inside a folder. Both are read under the one lock because a worker that is
/// about to add folders has already been counted.
fn many_walkers(root: &Path, job: &Job, threads: usize) -> Vec<Entry> {
    let queue: Mutex<Vec<(PathBuf, usize)>> = Mutex::new(vec![(root.to_path_buf(), 0)]);
    let inside = std::sync::atomic::AtomicUsize::new(0);
    let gathered: Mutex<Vec<Vec<Entry>>> = Mutex::new(Vec::new());

    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                let mut mine: Vec<Entry> = Vec::new();
                'work: loop {
                    let next = {
                        let mut waiting = queue.lock().unwrap();
                        match waiting.pop() {
                            Some(folder) => {
                                inside.fetch_add(1, Relaxed);
                                Some(folder)
                            }
                            None if inside.load(Relaxed) == 0 => break 'work,
                            None => None,
                        }
                    };
                    let Some((dir, depth)) = next else {
                        std::thread::sleep(Duration::from_micros(100));
                        continue;
                    };
                    if !job.cancel.load(Relaxed) && depth <= MAX_DEPTH {
                        let below = read_folder(&dir, depth, job, &mut mine);
                        queue.lock().unwrap().extend(below);
                    }
                    inside.fetch_sub(1, Relaxed);
                }
                gathered.lock().unwrap().push(mine);
            });
        }
    });

    gathered
        .into_inner()
        .unwrap()
        .into_iter()
        .flatten()
        .collect()
}

/// When the file last changed in milliseconds. The cache compares this against
/// what it holds so an edited file is read again.
fn changed(md: &std::fs::Metadata) -> i64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A 64 bit digest of the file. `limit` stops it after that many bytes so the
/// opening block can be digested on its own. It only groups candidates. The
/// byte comparison is what decides a pair.
///
/// A file no larger than `limit` gives the same number either way because the
/// same bytes go through the same chunking.
fn digest(path: &Path, limit: Option<usize>) -> Option<u64> {
    let mut f = File::open(path).ok()?;
    let mut buf = vec![0u8; CHUNK];
    let mut h: u64 = 0x9e3779b97f4a7c15;
    let mut left = limit.unwrap_or(usize::MAX);
    while left > 0 {
        let want = buf.len().min(left);
        let n = fill_buf(&mut f, &mut buf[..want]).ok()?;
        if n == 0 {
            break;
        }
        left -= n;
        for word in buf[..n].chunks(8) {
            let mut b = [0u8; 8];
            b[..word.len()].copy_from_slice(word);
            h = h
                .rotate_left(27)
                .wrapping_add(mix(u64::from_le_bytes(b)))
                .wrapping_mul(5)
                .wrapping_add(0x52dce729);
        }
    }
    Some(mix(h))
}

/// Reads until the buffer is full or the file ends. A short read would
/// otherwise move the chunk boundary and change the digest of the same bytes.
fn fill_buf(f: &mut File, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut n = 0;
    while n < buf.len() {
        match f.read(&mut buf[n..])? {
            0 => break,
            k => n += k,
        }
    }
    Ok(n)
}

fn mix(mut x: u64) -> u64 {
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    x = x.wrapping_mul(0xc4ceb9fe1a85ec53);
    x ^= x >> 33;
    x
}

/// True when both files hold the same bytes.
///
/// `chunk` is how much is taken from each side before switching. A spinning
/// disk wants that large because every switch moves the head.
fn same(a: &Path, b: &Path, chunk: usize) -> bool {
    let (Ok(mut fa), Ok(mut fb)) = (File::open(a), File::open(b)) else {
        return false;
    };
    let mut ba = vec![0u8; chunk];
    let mut bb = vec![0u8; chunk];
    loop {
        let (Ok(na), Ok(nb)) = (fill_buf(&mut fa, &mut ba), fill_buf(&mut fb, &mut bb)) else {
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

#[cfg(test)]
mod tests {
    use super::{Report, start};
    use eframe::egui;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::Ordering::Relaxed;
    use std::time::{Duration, Instant};

    fn dir(tag: &str, side: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "spacemongor-dupes-{tag}-{side}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn run(a: PathBuf, b: PathBuf) -> std::sync::Arc<Report> {
        finish(start(a, Some(b), None, egui::Context::default()))
    }

    /// Runs over one folder looking only at the groups named.
    fn run_only(root: PathBuf, only: &[crate::cats::Cat]) -> std::sync::Arc<Report> {
        let set: std::collections::HashSet<_> = only.iter().copied().collect();
        finish(start(root, None, Some(set), egui::Context::default()))
    }

    fn run_alone(root: PathBuf) -> std::sync::Arc<Report> {
        finish(start(root, None, None, egui::Context::default()))
    }

    fn finish(job: std::sync::Arc<super::Job>) -> std::sync::Arc<Report> {
        let deadline = Instant::now() + Duration::from_secs(30);
        while !job.done.load(Relaxed) {
            assert!(Instant::now() < deadline, "the comparison never finished");
            std::thread::sleep(Duration::from_millis(10));
        }
        job.report().expect("a report once it is done")
    }

    #[test]
    fn a_renamed_copy_is_found_and_a_lookalike_is_not() {
        let a = dir("copy", "a");
        let b = dir("copy", "b");
        let payload = vec![b'q'; 20_000];
        // The same bytes under another name on the other disk.
        fs::write(a.join("report.pdf"), &payload).unwrap();
        fs::write(b.join("report-final.pdf"), &payload).unwrap();
        // The same length but not the same bytes. The digest may group these.
        // Only the byte comparison can throw them out.
        fs::write(a.join("decoy.bin"), vec![b'm'; 9_000]).unwrap();
        fs::write(b.join("decoy.bin"), vec![b'n'; 9_000]).unwrap();
        // Held by one side only.
        fs::write(b.join("alone.txt"), vec![b'z'; 5_000]).unwrap();

        let r = run(a.clone(), b.clone());
        assert_eq!(
            r.total,
            1,
            "{:?}",
            r.pairs.iter().map(|p| &p.b).collect::<Vec<_>>()
        );
        assert_eq!(r.bytes, 20_000);
        assert_eq!(r.pairs[0].a, a.join("report.pdf"));
        assert_eq!(r.pairs[0].b, b.join("report-final.pdf"));
        assert_eq!(r.a_files, 2);
        assert_eq!(r.b_files, 3);

        fs::remove_dir_all(&a).unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn folders_below_the_two_roots_are_read() {
        let a = dir("deep", "a");
        let b = dir("deep", "b");
        fs::create_dir_all(a.join("one/two")).unwrap();
        fs::create_dir_all(b.join("other")).unwrap();
        let payload = vec![b'w'; 70_000];
        fs::write(a.join("one/two/buried.iso"), &payload).unwrap();
        fs::write(b.join("other/buried.iso"), &payload).unwrap();

        let r = run(a.clone(), b.clone());
        assert_eq!(r.total, 1);
        assert_eq!(r.bytes, 70_000);

        fs::remove_dir_all(&a).unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn an_empty_file_is_never_a_duplicate() {
        let a = dir("empty", "a");
        let b = dir("empty", "b");
        fs::write(a.join("nothing.txt"), b"").unwrap();
        fs::write(b.join("nothing-too.txt"), b"").unwrap();

        let r = run(a.clone(), b.clone());
        assert_eq!(r.total, 0);
        assert_eq!(r.a_files, 0);

        fs::remove_dir_all(&a).unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn a_file_larger_than_one_chunk_still_matches() {
        let a = dir("big", "a");
        let b = dir("big", "b");
        let payload: Vec<u8> = (0..(super::CHUNK * 3 + 17) as u32)
            .map(|i| (i % 251) as u8)
            .collect();
        fs::write(a.join("big.dat"), &payload).unwrap();
        fs::write(b.join("big.dat"), &payload).unwrap();
        let mut bent = payload.clone();
        *bent.last_mut().unwrap() ^= 0xff;
        fs::write(a.join("bent.dat"), &bent).unwrap();
        fs::write(b.join("bent-other.dat"), &payload).unwrap();

        let r = run(a.clone(), b.clone());
        // big.dat matches big.dat and bent-other.dat. bent.dat matches neither.
        assert_eq!(r.total, 2);
        assert!(r.pairs.iter().all(|p| p.a.ends_with("big.dat")));

        fs::remove_dir_all(&a).unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn copies_under_one_folder_are_found() {
        let root = dir("alone", "one");
        fs::create_dir_all(root.join("deep/nested")).unwrap();
        let payload = vec![b'k'; 40_000];
        fs::write(root.join("a.bin"), &payload).unwrap();
        fs::write(root.join("deep/nested/a-copy.bin"), &payload).unwrap();
        fs::write(root.join("deep/other.bin"), vec![b'j'; 40_000]).unwrap();

        let r = run_alone(root.clone());
        assert_eq!(r.total, 1);
        assert_eq!(r.bytes, 40_000);
        assert_eq!(
            r.pairs[0].a,
            root.join("a.bin"),
            "the shortest path is kept"
        );
        assert_eq!(r.pairs[0].b, root.join("deep/nested/a-copy.bin"));
        assert_eq!(r.b_files, 0, "one folder has no second side");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn three_copies_report_the_two_that_could_go() {
        let root = dir("alone", "three");
        let payload = vec![b'p'; 12_000];
        for name in ["one.dat", "two.dat", "three.dat"] {
            fs::write(root.join(name), &payload).unwrap();
        }

        let r = run_alone(root.clone());
        assert_eq!(r.total, 2, "three copies waste two of them");
        assert_eq!(r.bytes, 24_000);
        assert!(r.pairs.iter().all(|p| p.a == root.join("one.dat")));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn a_second_name_for_one_file_is_not_a_duplicate() {
        let root = dir("alone", "linked");
        fs::write(root.join("original.bin"), vec![b'h'; 30_000]).unwrap();
        fs::hard_link(root.join("original.bin"), root.join("another-name.bin")).unwrap();

        let r = run_alone(root.clone());
        assert_eq!(r.total, 0, "deleting the second name would free nothing");
        assert_eq!(r.a_files, 1);

        fs::remove_dir_all(&root).unwrap();
    }

    /// A folder that has not moved cannot have a different answer. The whole
    /// search is skipped and the last answer handed straight back.
    #[test]
    fn an_unchanged_folder_is_answered_without_looking() {
        let root = dir("answer", "same");
        fs::create_dir_all(root.join("copy")).unwrap();
        let payload = vec![b'a'; 50_000];
        fs::write(root.join("thesis.pdf"), &payload).unwrap();
        fs::write(root.join("copy/thesis.pdf"), &payload).unwrap();

        let cold = run_alone(root.clone());
        assert!(!cold.from_cache, "there was nothing to hand back");
        assert_eq!(cold.total, 1);

        let warm = run_alone(root.clone());
        assert!(warm.from_cache, "the folder had not moved");
        assert_eq!(warm.total, 1, "and the answer is the same one");
        assert_eq!(warm.bytes, 50_000);
        assert_eq!(warm.pairs[0].a, root.join("thesis.pdf"));
        assert_eq!(warm.pairs[0].b, root.join("copy/thesis.pdf"));

        // One new file moves the folder so the answer has to be worked out
        // again. It must not come back stale.
        fs::write(root.join("copy/second.pdf"), &payload).unwrap();
        let after = run_alone(root.clone());
        assert!(!after.from_cache, "the folder moved");
        assert_eq!(after.total, 2, "the new copy is found");

        fs::remove_dir_all(&root).unwrap();
    }

    /// With the answer thrown away by a change elsewhere the digests still come
    /// back rather than the files being read again.
    #[test]
    fn a_second_run_takes_its_digests_from_the_cache() {
        let root = dir("cache", "reuse");
        let payload = vec![b'c'; 60_000];
        fs::write(root.join("first.bin"), &payload).unwrap();
        fs::write(root.join("second.bin"), &payload).unwrap();

        let cold = run_alone(root.clone());
        assert_eq!(cold.total, 1);
        assert_eq!(cold.cached, 0, "nothing was held before the first run");

        // A file of its own size cannot be a copy so it adds no reading. It
        // does move the folder which is what throws the answer away.
        fs::write(root.join("unrelated.txt"), vec![b'u'; 3_333]).unwrap();
        let warm = run_alone(root.clone());
        assert!(!warm.from_cache, "the folder moved so the answer went");
        assert_eq!(warm.total, 1, "the answer is the same one");
        assert_eq!(
            warm.cached, 2,
            "both files of the shared size came from the cache"
        );

        // An edited file must be read again even though its size holds.
        let mut bent = payload.clone();
        *bent.last_mut().unwrap() ^= 0xff;
        std::thread::sleep(Duration::from_millis(10));
        fs::write(root.join("second.bin"), &bent).unwrap();

        let after = run_alone(root.clone());
        assert_eq!(after.total, 0, "they no longer match");
        assert_eq!(after.cached, 1, "only the file left alone was reused");

        fs::remove_dir_all(&root).unwrap();
    }

    /// The content number is what lets a second run skip the byte comparison.
    #[test]
    fn a_second_run_does_not_read_the_files_again_to_confirm_them() {
        let root = dir("content", "again");
        fs::create_dir_all(root.join("backup")).unwrap();
        let payload = vec![b'v'; 90_000];
        fs::write(root.join("film.mkv"), &payload).unwrap();
        fs::write(root.join("backup/film.mkv"), &payload).unwrap();

        let cold = run_alone(root.clone());
        assert_eq!(cold.total, 1);
        assert!(cold.confirmed > 0, "the first run has to read both files");

        // Moving the folder throws the answer away so the pair has to be put
        // together again. The content number is what saves the reading.
        fs::write(root.join("unrelated.txt"), vec![b'u'; 1_234]).unwrap();
        let warm = run_alone(root.clone());
        assert!(!warm.from_cache, "the answer was thrown away");
        assert_eq!(warm.total, 1, "the answer does not change");
        assert_eq!(warm.confirmed, 0, "the content number settled it");

        fs::remove_dir_all(&root).unwrap();
    }

    /// Two large files sharing an opening block must still be told apart.
    #[test]
    fn a_shared_opening_block_is_not_enough_to_call_it_a_copy() {
        let root = dir("head", "only");
        let mut one = vec![b'e'; 200_000];
        let mut two = one.clone();
        *one.last_mut().unwrap() = 1;
        *two.last_mut().unwrap() = 2;
        fs::write(root.join("one.bin"), &one).unwrap();
        fs::write(root.join("two.bin"), &two).unwrap();
        fs::write(root.join("three.bin"), &one).unwrap();

        let r = run_alone(root.clone());
        assert_eq!(r.total, 1, "only the true copy counts");
        assert_eq!(r.pairs[0].a, root.join("one.bin"));
        assert_eq!(r.pairs[0].b, root.join("three.bin"));

        fs::remove_dir_all(&root).unwrap();
    }

    /// Told to look at pictures it must find the picture and leave the film.
    #[test]
    fn a_search_told_which_groups_looks_at_those_only() {
        use crate::cats::Cat;
        let root = dir("groups", "only");
        fs::create_dir_all(root.join("copy")).unwrap();
        let shot = vec![b'p'; 30_000];
        let film = vec![b'v'; 50_000];
        fs::write(root.join("holiday.jpg"), &shot).unwrap();
        fs::write(root.join("copy/holiday.jpg"), &shot).unwrap();
        fs::write(root.join("holiday.mp4"), &film).unwrap();
        fs::write(root.join("copy/holiday.mp4"), &film).unwrap();

        let both = run_alone(root.clone());
        assert_eq!(both.total, 2, "looking at everything finds both");
        assert_eq!(both.bytes, 80_000);

        let pictures = run_only(root.clone(), &[Cat::Image]);
        assert_eq!(pictures.total, 1, "it looked past the group it was given");
        assert_eq!(pictures.bytes, 30_000);
        assert!(pictures.pairs[0].b.extension().is_some_and(|e| e == "jpg"));

        let music = run_only(root.clone(), &[Cat::Audio]);
        assert_eq!(music.total, 0, "there is no music in there");

        fs::remove_dir_all(&root).unwrap();
    }

    /// The stored answer belongs to the question that was asked. A narrower
    /// search must never be handed a wider one's answer.
    #[test]
    fn an_answer_is_not_shared_between_different_questions() {
        use crate::cats::Cat;
        let root = dir("groups", "answers");
        fs::create_dir_all(root.join("copy")).unwrap();
        let shot = vec![b'p'; 12_000];
        let film = vec![b'v'; 21_000];
        fs::write(root.join("a.jpg"), &shot).unwrap();
        fs::write(root.join("copy/a.jpg"), &shot).unwrap();
        fs::write(root.join("a.mp4"), &film).unwrap();
        fs::write(root.join("copy/a.mp4"), &film).unwrap();

        // Looking at everything first fills the cache and stores an answer.
        let wide = run_alone(root.clone());
        assert_eq!(wide.total, 2);
        assert!(
            run_alone(root.clone()).from_cache,
            "the wide answer was kept"
        );

        // Nothing has changed on the disk so the marks match. Only the question
        // is different and that must be enough to tell them apart.
        let narrow = run_only(root.clone(), &[Cat::Image]);
        assert!(!narrow.from_cache, "it handed back the wider answer");
        assert_eq!(narrow.total, 1, "a digest from the wider run leaked in");
        assert_eq!(narrow.bytes, 12_000);

        // And the wider answer is still there and still right.
        let again = run_alone(root.clone());
        assert_eq!(again.total, 2, "the wider answer was spoiled");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_folder_of_unique_files_reports_nothing() {
        let root = dir("alone", "unique");
        fs::write(root.join("a.bin"), vec![b'1'; 5_000]).unwrap();
        fs::write(root.join("b.bin"), vec![b'2'; 6_000]).unwrap();
        // The same length but not the same bytes.
        fs::write(root.join("c.bin"), vec![b'3'; 5_000]).unwrap();

        let r = run_alone(root.clone());
        assert_eq!(r.total, 0);
        assert_eq!(r.a_files, 3);

        fs::remove_dir_all(&root).unwrap();
    }

    /// Tells the kernel to let go of every page it holds for these files so the
    /// next read really touches the drive. No privilege is needed for this.
    #[cfg(unix)]
    fn chill(root: &std::path::Path) {
        use std::os::unix::io::AsRawFd;
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(md) = entry.metadata() else {
                    continue;
                };
                if md.is_dir() {
                    stack.push(entry.path());
                } else if md.is_file()
                    && let Ok(f) = fs::File::open(entry.path())
                {
                    unsafe {
                        libc::posix_fadvise(f.as_raw_fd(), 0, 0, libc::POSIX_FADV_DONTNEED);
                    }
                }
            }
        }
    }

    /// Windows gives no equivalent that works without reopening every file with
    /// a no buffering flag so the probe reads whatever is already in memory.
    #[cfg(windows)]
    fn chill(_root: &std::path::Path) {}

    /// Timing probe. Not a check. Run it with
    /// `PROBE=/usr/share cargo test --release -- --ignored --nocapture`.
    #[test]
    #[ignore = "timing probe"]
    fn how_long_a_scan_takes() {
        let root = PathBuf::from(std::env::var("PROBE").unwrap_or_else(|_| "/usr/share".into()));

        chill(&root);
        let cold_job = start(root.clone(), None, None, egui::Context::default());
        let started = Instant::now();
        let cold = finish(cold_job.clone());
        let cold_took = started.elapsed();

        let warm_job = start(root.clone(), None, None, egui::Context::default());
        let started = Instant::now();
        let warm = finish(warm_job.clone());
        let warm_took = started.elapsed();

        println!("path          {}", root.display());
        println!(
            "drive         {}  ·  {} readers",
            crate::sys::drive(&root).label(),
            crate::sys::drive(&root).readers()
        );
        println!("files         {}", cold.a_files);
        println!(
            "copies        {} holding {}",
            cold.total,
            crate::fmt::bytes(cold.bytes)
        );
        println!(
            "cold          {cold_took:?}  ·  {} cached  ·  {} confirmed by reading",
            cold.cached, cold.confirmed
        );
        println!(
            "warm          {warm_took:?}  ·  {} cached  ·  {} confirmed by reading",
            warm.cached, warm.confirmed
        );
        for (label, job) in [("cold", &cold_job), ("warm", &warm_job)] {
            let phases = job.phases.lock().unwrap();
            let line: Vec<String> = phases.iter().map(|(n, ms)| format!("{n} {ms}ms")).collect();
            println!("{label} phases   {}", line.join("  ·  "));
        }
        assert_eq!(cold.total, warm.total, "the cache changed the answer");
    }
}
