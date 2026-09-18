//! The cache of what has been read.
//!
//! A digest costs a whole file read. Holding it means a second run over an
//! unchanged folder reads nothing. The cache is a SQLite file so it can also be
//! queried by hand with any SQLite tool.
//!
//! The cache is the only thing this program ever writes and it never sits on
//! the disk being examined unless the host puts it there.

use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Bumped whenever the shape of the tables changes. A cache of the wrong shape
/// is thrown away rather than migrated because everything in it can be read
/// again from the disk.
const VERSION: i32 = 4;

const SCHEMA: &str = "
create table folder (
    id        integer primary key,
    root      text    not null unique,
    scanned   integer not null,
    -- covers what every row holds so a walk knows whether to write
    rows_mark integer,
    -- covers only what the walk itself saw so it can be settled before a
    -- single file is read
    walk_mark integer
);
create table answer (
    id        integer primary key,
    a_root    text    not null,
    b_root    text,
    a_mark    integer not null,
    b_mark    integer,
    bytes     integer not null,
    total     integer not null,
    a_files   integer not null,
    b_files   integer not null,
    unique(a_root, b_root)
);
create table answer_pair (
    answer    integer not null references answer(id) on delete cascade,
    keep      text    not null,
    copy      text    not null,
    size      integer not null
);
create index answer_pair_answer on answer_pair(answer);
create table file (
    id        integer primary key,
    folder    integer not null references folder(id) on delete cascade,
    path      text    not null,
    size      integer not null,
    modified  integer not null,
    head      integer,
    digest    integer,
    content   integer,
    unique(folder, path)
);
create index file_size on file(size);
create index file_digest on file(digest);
";

/// Every column the current shape needs beyond what the first shape had.
const WANTED: &[(&str, &str, &str)] = &[
    ("folder", "rows_mark", "integer"),
    ("folder", "walk_mark", "integer"),
    ("file", "head", "integer"),
    ("file", "content", "integer"),
];

const LATER_TABLES: &str = "
create table if not exists answer (
    id        integer primary key,
    a_root    text    not null,
    b_root    text,
    a_mark    integer not null,
    b_mark    integer,
    bytes     integer not null,
    total     integer not null,
    a_files   integer not null,
    b_files   integer not null,
    unique(a_root, b_root)
);
create table if not exists answer_pair (
    answer    integer not null references answer(id) on delete cascade,
    keep      text    not null,
    copy      text    not null,
    size      integer not null
);
create index if not exists answer_pair_answer on answer_pair(answer);
";

/// Brings a cache of an older shape up to the current one without losing what
/// it holds.
///
/// Every digest in it cost a whole file read. Throwing them away because a
/// column was added makes the next run pay for all of them again.
///
/// The work follows the shape rather than the version number. Because a real
/// cache was found carrying a version of two over tables that already had the
/// columns of three. The number is written last and a run that stops before it
/// reaches the file leaves the two disagreeing. Only the shape can be trusted.
fn carry_forward(db: &Connection, held: i32) -> bool {
    if held > VERSION {
        // Written by a later build. Its shape is not known here.
        return false;
    }
    if !has_table(db, "folder") || !has_table(db, "file") {
        return false;
    }
    for (table, column, kind) in WANTED {
        if !has_column(db, table, column)
            && db
                .execute_batch(&format!("alter table {table} add column {column} {kind};"))
                .is_err()
        {
            return false;
        }
    }
    if db.execute_batch(LATER_TABLES).is_err() {
        return false;
    }
    // Say it is the current shape only once it really is.
    if WANTED
        .iter()
        .any(|(table, column, _)| !has_column(db, table, column))
        || !has_table(db, "answer")
        || !has_table(db, "answer_pair")
    {
        return false;
    }
    db.execute_batch(&format!("pragma user_version = {VERSION};"))
        .is_ok()
}

fn has_table(db: &Connection, name: &str) -> bool {
    db.query_row(
        "select 1 from sqlite_master where type = 'table' and name = ?1",
        [name],
        |r| r.get::<_, i64>(0),
    )
    .is_ok()
}

fn has_column(db: &Connection, table: &str, column: &str) -> bool {
    let Ok(mut q) = db.prepare(&format!("pragma table_info({table})")) else {
        return false;
    };
    let Ok(rows) = q.query_map([], |r| r.get::<_, String>(1)) else {
        return false;
    };
    rows.flatten().any(|name| name == column)
}

/// What the cache holds for one path.
pub struct Known {
    pub size: u64,
    pub modified: i64,
    /// Digest of the opening block. It throws out most candidates without
    /// reading the rest of the file.
    pub head: Option<u64>,
    /// Digest of the whole file.
    pub digest: Option<u64>,
    /// Files confirmed to hold the same bytes share this. Two files carrying
    /// one content number need no byte comparison.
    pub content: Option<u64>,
}

/// A search that has already been run.
pub struct Answer {
    pub pairs: Vec<(PathBuf, PathBuf, u64)>,
    pub bytes: u64,
    pub total: u64,
    pub a_files: u64,
    pub b_files: u64,
}

/// What a walk found for one path.
pub struct Record {
    pub path: PathBuf,
    pub size: u64,
    pub modified: i64,
    pub head: Option<u64>,
    pub digest: Option<u64>,
    pub content: Option<u64>,
}

pub struct Store {
    db: Connection,
}

/// Where the cache sits. `SPACEMONGOR_DB` overrides it.
///
/// A test run never touches the real cache. Because a) a test would otherwise
/// leave rows behind in the cache of whoever ran it and b) two test runs would
/// then read each other's answers.
pub fn path() -> PathBuf {
    if let Some(set) = std::env::var_os("SPACEMONGOR_DB") {
        return PathBuf::from(set);
    }
    if cfg!(test) {
        // One cache for each test. The harness names its thread after the test
        // so tests running side by side never read each other's rows.
        let who: String = std::thread::current()
            .name()
            .unwrap_or("main")
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        return std::env::temp_dir()
            .join(format!("spacemongor-test-{}-{who}", std::process::id()))
            .join("cache.db");
    }
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share"))
            })
    };
    base.unwrap_or_else(std::env::temp_dir)
        .join("spacemongor")
        .join("cache.db")
}

impl Store {
    /// Opens the cache. A cache that cannot be opened is not an error worth
    /// stopping for because the comparison runs without one.
    pub fn open() -> Option<Store> {
        Store::open_at(&path())
    }

    pub fn open_at(file: &Path) -> Option<Store> {
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).ok()?;
        }
        let db = Connection::open(file).ok()?;
        // `busy_timeout` makes a second writer wait rather than give up. Without
        // it a comparison running beside another one silently caches nothing.
        db.execute_batch(
            "pragma journal_mode = wal;
             pragma synchronous = normal;
             pragma foreign_keys = on;
             pragma busy_timeout = 5000;",
        )
        .ok()?;
        let held: i32 = db
            .query_row("pragma user_version", [], |r| r.get(0))
            .unwrap_or(0);
        if held != VERSION && !carry_forward(&db, held) {
            // Nothing could be carried so start again rather than work from a
            // shape that is not understood.
            db.execute_batch(
                "drop table if exists answer_pair;
                 drop table if exists answer;
                 drop table if exists file;
                 drop table if exists folder;",
            )
            .ok()?;
            db.execute_batch(SCHEMA).ok()?;
            db.execute_batch(&format!("pragma user_version = {VERSION};"))
                .ok()?;
        }
        Some(Store { db })
    }

    /// Everything held for the files under `root`.
    pub fn known(&self, root: &Path) -> HashMap<PathBuf, Known> {
        let mut out = HashMap::new();
        let Ok(mut q) = self.db.prepare(
            "select f.path, f.size, f.modified, f.head, f.digest, f.content
             from file f join folder d on d.id = f.folder
             where d.root = ?1",
        ) else {
            return out;
        };
        let rows = q.query_map([text(root)], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, Option<i64>>(4)?,
                r.get::<_, Option<i64>>(5)?,
            ))
        });
        let Ok(rows) = rows else {
            return out;
        };
        for row in rows.flatten() {
            out.insert(
                PathBuf::from(row.0),
                Known {
                    size: row.1 as u64,
                    modified: row.2,
                    head: row.3.map(|d| d as u64),
                    digest: row.4.map(|d| d as u64),
                    content: row.5.map(|d| d as u64),
                },
            );
        }
        out
    }

    /// Brings what is held for `root` up to date with what the walk just found.
    ///
    /// Only rows that moved are touched. Because a) a run over a folder nothing
    /// has changed is the common case b) deleting and reinserting every row cost
    /// three quarters of such a run and c) the rows are identical either way.
    ///
    /// `held` is what [`Store::known`] returned for the same folder. It is asked
    /// for rather than read again because the caller has already paid for it.
    pub fn remember(
        &mut self,
        root: &Path,
        files: &[Record],
        held: &HashMap<PathBuf, Known>,
        mark: u64,
        walk: u64,
    ) -> bool {
        let Ok(tx) = self.db.transaction() else {
            return false;
        };
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        if tx
            .execute(
                "insert into folder (root, scanned, rows_mark, walk_mark)
                 values (?1, ?2, ?3, ?4)
                 on conflict(root) do update set
                    scanned = ?2, rows_mark = ?3, walk_mark = ?4",
                rusqlite::params![text(root), now, mark as i64, walk as i64],
            )
            .is_err()
        {
            return false;
        }
        let Ok(id) = tx.query_row("select id from folder where root = ?1", [text(root)], |r| {
            r.get::<_, i64>(0)
        }) else {
            return false;
        };

        let mut found: HashSet<&Path> = HashSet::with_capacity(files.len());
        {
            let Ok(mut put) = tx.prepare(
                "insert into file (folder, path, size, modified, head, digest, content)
                 values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 on conflict(folder, path)
                 do update set size = ?3, modified = ?4, head = ?5, digest = ?6, content = ?7",
            ) else {
                return false;
            };
            let Ok(mut drop) = tx.prepare("delete from file where folder = ?1 and path = ?2")
            else {
                return false;
            };
            for f in files {
                found.insert(f.path.as_path());
                if held.get(&f.path).is_some_and(|k| {
                    k.size == f.size
                        && k.modified == f.modified
                        && k.head == f.head
                        && k.digest == f.digest
                        && k.content == f.content
                }) {
                    continue;
                }
                let _ = put.execute(rusqlite::params![
                    id,
                    text(&f.path),
                    f.size as i64,
                    f.modified,
                    f.head.map(|d| d as i64),
                    f.digest.map(|d| d as i64),
                    f.content.map(|d| d as i64)
                ]);
            }
            for gone in held.keys().filter(|p| !found.contains(p.as_path())) {
                let _ = drop.execute(rusqlite::params![id, text(gone)]);
            }
        }
        tx.commit().is_ok()
    }

    /// Drops everything held for `root`.
    pub fn forget(&mut self, root: &Path) -> bool {
        self.db
            .execute("delete from folder where root = ?1", [text(root)])
            .is_ok()
    }

    /// The mark left by the last walk of `root`. A walk that comes back with
    /// the same mark found the folder exactly as it left it.
    pub fn mark(&self, root: &Path) -> Option<u64> {
        self.column(root, "rows_mark")
    }

    fn column(&self, root: &Path, name: &str) -> Option<u64> {
        self.db
            .query_row(
                &format!("select {name} from folder where root = ?1"),
                [text(root)],
                |r| r.get::<_, Option<i64>>(0),
            )
            .ok()
            .flatten()
            .map(|m| m as u64)
    }

    /// What a search of these folders came to last time they were in this
    /// state. `None` when they were never in it.
    pub fn answer(
        &self,
        a: &Path,
        b: Option<&Path>,
        a_mark: u64,
        b_mark: Option<u64>,
    ) -> Option<Answer> {
        let found = self
            .db
            .query_row(
                "select id, bytes, total, a_files, b_files from answer
                 where a_root = ?1 and b_root is ?2 and a_mark = ?3 and b_mark is ?4",
                rusqlite::params![
                    text(a),
                    b.map(text),
                    a_mark as i64,
                    b_mark.map(|m| m as i64)
                ],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, i64>(3)?,
                        r.get::<_, i64>(4)?,
                    ))
                },
            )
            .ok()?;

        let mut q = self
            .db
            .prepare("select keep, copy, size from answer_pair where answer = ?1")
            .ok()?;
        let rows = q
            .query_map([found.0], |r| {
                Ok((
                    PathBuf::from(r.get::<_, String>(0)?),
                    PathBuf::from(r.get::<_, String>(1)?),
                    r.get::<_, i64>(2)? as u64,
                ))
            })
            .ok()?;
        let pairs: Vec<(PathBuf, PathBuf, u64)> = rows.flatten().collect();
        // An answer saying copies were found but naming none of them is not an
        // answer. Refusing it costs one search and telling it costs trust.
        if found.2 > 0 && pairs.is_empty() {
            return None;
        }
        Some(Answer {
            pairs,
            bytes: found.1 as u64,
            total: found.2 as u64,
            a_files: found.3 as u64,
            b_files: found.4 as u64,
        })
    }

    /// Keeps what a search came to so the same folders in the same state need
    /// not be searched again.
    pub fn keep_answer(
        &mut self,
        a: &Path,
        b: Option<&Path>,
        a_mark: u64,
        b_mark: Option<u64>,
        answer: &Answer,
    ) -> bool {
        let Ok(tx) = self.db.transaction() else {
            return false;
        };
        // Anything held for these two folders goes before the new answer lands.
        //
        // The unique constraint cannot do this on its own. SQLite counts two
        // NULLs as different so a search of one folder never conflicted with
        // itself. Every run added a row and the one that matched the mark was
        // not the one the pairs were written against. Its pairs go with it.
        if tx
            .execute(
                "delete from answer where a_root = ?1 and b_root is ?2",
                rusqlite::params![text(a), b.map(text)],
            )
            .is_err()
        {
            return false;
        }
        if tx
            .execute(
                "insert into answer (a_root, b_root, a_mark, b_mark, bytes, total, a_files, b_files)
                 values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    text(a),
                    b.map(text),
                    a_mark as i64,
                    b_mark.map(|m| m as i64),
                    answer.bytes as i64,
                    answer.total as i64,
                    answer.a_files as i64,
                    answer.b_files as i64
                ],
            )
            .is_err()
        {
            return false;
        }
        let id = tx.last_insert_rowid();
        {
            let Ok(mut put) = tx.prepare(
                "insert into answer_pair (answer, keep, copy, size) values (?1, ?2, ?3, ?4)",
            ) else {
                return false;
            };
            for (keep, copy, size) in &answer.pairs {
                let _ = put.execute(rusqlite::params![id, text(keep), text(copy), *size as i64]);
            }
        }
        tx.commit().is_ok()
    }

    /// The largest content number handed out so far. The next set of files
    /// confirmed identical takes the one after it.
    pub fn last_content(&self) -> u64 {
        self.db
            .query_row("select coalesce(max(content), 0) from file", [], |r| {
                r.get::<_, i64>(0)
            })
            .unwrap_or(0) as u64
    }

    /// Squeezes the file back down.
    ///
    /// A cache that has been written over many times holds pages nothing uses.
    /// A real one was found with a quarter of its file free.
    pub fn tidy(&mut self) -> bool {
        self.db.execute_batch("vacuum;").is_ok()
    }

    /// Pages in the file that nothing is using.
    pub fn slack(&self) -> u64 {
        let page = self
            .db
            .query_row("pragma page_size", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0);
        let free = self
            .db
            .query_row("pragma freelist_count", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0);
        (page * free).max(0) as u64
    }

    /// Folders held and files held.
    pub fn counts(&self) -> (u64, u64) {
        let folders = self
            .db
            .query_row("select count(*) from folder", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0);
        let files = self
            .db
            .query_row("select count(*) from file", [], |r| r.get::<_, i64>(0))
            .unwrap_or(0);
        (folders as u64, files as u64)
    }
}

/// A path as text. A path that is not valid text is stored as close as it can
/// be. The only cost is that the cache misses on it and the file is read again.
fn text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::{Answer, Known, Record, Store};
    use std::path::{Path, PathBuf};

    fn store(tag: &str) -> (Store, PathBuf) {
        let file =
            std::env::temp_dir().join(format!("spacemongor-store-{tag}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&file);
        (Store::open_at(&file).expect("the cache opens"), file)
    }

    /// The caller passes what it already read. A test that does not care passes
    /// nothing.
    fn nothing() -> std::collections::HashMap<PathBuf, Known> {
        std::collections::HashMap::new()
    }

    fn record(path: &str, size: u64, modified: i64, digest: Option<u64>) -> Record {
        Record {
            path: PathBuf::from(path),
            size,
            modified,
            head: digest,
            digest,
            content: digest.map(|d| d % 97),
        }
    }

    #[test]
    fn what_goes_in_comes_back_out() {
        let (mut s, file) = store("roundtrip");
        let root = Path::new("/data");
        assert!(s.remember(
            root,
            &[
                record("/data/a.bin", 100, 7, Some(0xdead_beef)),
                record("/data/b.bin", 200, 8, None),
            ],
            &nothing(),
            1,
            1
        ));

        let held = s.known(root);
        assert_eq!(held.len(), 2);
        let a: &Known = &held[Path::new("/data/a.bin")];
        assert_eq!(a.size, 100);
        assert_eq!(a.modified, 7);
        assert_eq!(a.digest, Some(0xdead_beef));
        assert_eq!(a.head, Some(0xdead_beef));
        assert_eq!(a.content, Some(0xdead_beefu64 % 97));
        assert_eq!(held[Path::new("/data/b.bin")].digest, None);
        assert_eq!(s.counts(), (1, 2));

        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn a_digest_at_the_top_of_the_range_survives_the_trip() {
        let (mut s, file) = store("wide");
        let root = Path::new("/data");
        s.remember(
            root,
            &[record("/data/x", 1, 1, Some(u64::MAX))],
            &nothing(),
            0,
            0,
        );
        assert_eq!(s.known(root)[Path::new("/data/x")].digest, Some(u64::MAX));
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn a_second_walk_replaces_the_first() {
        let (mut s, file) = store("replace");
        let root = Path::new("/data");
        s.remember(
            root,
            &[record("/data/gone.bin", 1, 1, Some(1))],
            &nothing(),
            0,
            0,
        );
        // The second walk is told what the first left so it can clear what went.
        let held = s.known(root);
        s.remember(
            root,
            &[record("/data/kept.bin", 2, 2, Some(2))],
            &held,
            7,
            8,
        );

        let held = s.known(root);
        assert_eq!(held.len(), 1, "the file that went is not held");
        assert!(held.contains_key(Path::new("/data/kept.bin")));
        assert_eq!(s.counts(), (1, 1), "the folder is not held twice");

        let _ = std::fs::remove_file(&file);
    }

    /// Reopening must not throw the cache away. The version guard drops the
    /// tables only when the shape has actually changed.
    #[test]
    fn what_is_held_survives_reopening() {
        let (mut first, file) = store("reopen");
        let root = Path::new("/data");
        assert!(first.remember(
            root,
            &[record("/data/a.bin", 100, 7, Some(42))],
            &nothing(),
            0,
            0
        ));
        drop(first);

        let again = Store::open_at(&file).expect("the cache reopens");
        let held = again.known(root);
        assert_eq!(held.len(), 1, "reopening threw the rows away");
        assert_eq!(held[Path::new("/data/a.bin")].head, Some(42));
        assert_eq!(again.last_content(), 42, "the content number came back");

        let _ = std::fs::remove_file(&file);
    }

    /// A cache written by an older build must survive the upgrade.
    ///
    /// Every digest in it cost a whole file read. This is the exact shape a
    /// real cache was found in after a version bump threw it away.
    #[test]
    fn an_older_cache_keeps_what_it_holds() {
        let file = std::env::temp_dir().join(format!(
            "spacemongor-old-{}-{}.db",
            std::process::id(),
            std::thread::current().name().unwrap_or("x").len()
        ));
        let _ = std::fs::remove_file(&file);
        {
            // The shape version two had.
            let db = rusqlite::Connection::open(&file).unwrap();
            db.execute_batch(
                "create table folder (
                     id integer primary key,
                     root text not null unique,
                     scanned integer not null
                 );
                 create table file (
                     id integer primary key,
                     folder integer not null references folder(id) on delete cascade,
                     path text not null,
                     size integer not null,
                     modified integer not null,
                     digest integer,
                     unique(folder, path)
                 );
                 pragma user_version = 2;",
            )
            .unwrap();
            db.execute(
                "insert into folder (id, root, scanned) values (1, 'D:\\Music', 99)",
                [],
            )
            .unwrap();
            db.execute(
                "insert into file (folder, path, size, modified, digest)
                 values (1, 'D:\\Music\\a.mp3', 4096, 7, 1234)",
                [],
            )
            .unwrap();
        }

        let carried = Store::open_at(&file).expect("the older cache opens");
        let held = carried.known(Path::new("D:\\Music"));
        assert_eq!(held.len(), 1, "the upgrade threw the rows away");
        let row = &held[Path::new("D:\\Music\\a.mp3")];
        assert_eq!(row.size, 4096);
        assert_eq!(row.digest, Some(1234), "the digest cost a whole file read");
        assert_eq!(row.head, None, "the new column starts empty");
        assert_eq!(row.content, None);
        // The tables the newer shape needs are there too.
        assert!(
            carried
                .answer(Path::new("D:\\Music"), None, 1, None)
                .is_none(),
            "the tables the newer shape needs are there and empty"
        );

        let _ = std::fs::remove_file(&file);
    }

    /// The shape a real cache was found in. Its version said two while its
    /// tables already carried the columns of three, because the number is
    /// written last and the run that wrote it never reached the file.
    #[test]
    fn a_cache_whose_version_disagrees_with_its_tables_still_carries() {
        let file =
            std::env::temp_dir().join(format!("spacemongor-mixed-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&file);
        {
            let db = rusqlite::Connection::open(&file).unwrap();
            db.execute_batch(
                "create table folder (
                     id integer primary key,
                     root text not null unique,
                     scanned integer not null
                 );
                 create table file (
                     id integer primary key,
                     folder integer not null references folder(id) on delete cascade,
                     path text not null,
                     size integer not null,
                     modified integer not null,
                     head integer,
                     digest integer,
                     content integer,
                     unique(folder, path)
                 );
                 pragma user_version = 2;",
            )
            .unwrap();
            db.execute(
                "insert into folder (id, root, scanned) values (1, 'D:\\Music', 9)",
                [],
            )
            .unwrap();
            db.execute(
                "insert into file (folder, path, size, modified, head, digest, content)
                 values (1, 'D:\\Music\\a.mp3', 4096, 7, 11, 22, 33)",
                [],
            )
            .unwrap();
        }

        let carried = Store::open_at(&file).expect("it opens");
        assert_eq!(carried.counts(), (1, 1), "the mixed shape was thrown away");
        let row = &carried.known(Path::new("D:\\Music"))[Path::new("D:\\Music\\a.mp3")];
        assert_eq!(row.digest, Some(22));
        assert_eq!(
            row.head,
            Some(11),
            "the column that was already there is kept"
        );
        assert_eq!(row.content, Some(33));

        let _ = std::fs::remove_file(&file);
    }

    /// Points at a real cache to check it survives. Not a check of its own.
    /// `OLD_DB=path cargo test carry_a_real_cache -- --ignored --nocapture`.
    #[test]
    #[ignore = "needs a cache to point at"]
    fn carry_a_real_cache() {
        let at = PathBuf::from(std::env::var("OLD_DB").expect("set OLD_DB"));
        let carried = Store::open_at(&at).expect("it opens");
        let (folders, files) = carried.counts();
        println!("folders {folders} files {files}");
        assert!(folders > 0 && files > 0, "the upgrade emptied it");

        let mut q = carried
            .db
            .prepare("select root, walk_mark from folder")
            .unwrap();
        let roots: Vec<(String, Option<i64>)> = q
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .flatten()
            .collect();
        for (root, walk) in roots {
            let held: i64 = carried
                .db
                .query_row(
                    "select count(*) from answer where a_root = ?1 and b_root is null",
                    [&root],
                    |r| r.get(0),
                )
                .unwrap_or(-1);
            let answered =
                walk.and_then(|w| carried.answer(Path::new(&root), None, w as u64, None));
            println!(
                "{root}\n  answers held {held}\n  answered for its walk mark: {}",
                match &answered {
                    Some(a) => format!("{} copies naming {} of them", a.total, a.pairs.len()),
                    None => "no. it will search again".to_string(),
                }
            );
            if let Some(a) = answered {
                assert!(
                    a.total == 0 || !a.pairs.is_empty(),
                    "an answer named no copies"
                );
            }
        }
    }

    /// A cache written by a build that came later cannot be read from here.
    #[test]
    fn a_newer_cache_is_started_again_rather_than_guessed_at() {
        let (s, file) = store("newer");
        drop(s);
        {
            let db = rusqlite::Connection::open(&file).unwrap();
            db.execute_batch("pragma user_version = 99;").unwrap();
        }
        let fresh = Store::open_at(&file).expect("it opens");
        assert_eq!(fresh.counts(), (0, 0), "it was laid down again");
        let _ = std::fs::remove_file(&file);
    }

    /// Searching one folder twice must leave one answer holding its pairs.
    ///
    /// SQLite counts two NULLs as different so the unique constraint never
    /// caught a search of one folder against itself. Every run added a row and
    /// the pairs went against the wrong one. A real cache was found holding two
    /// answers where the one that matched named no copies at all.
    #[test]
    fn one_folder_searched_twice_leaves_one_answer() {
        let (mut s, file) = store("answers");
        let root = Path::new("/disk");
        let pairs = |n: u64| Answer {
            pairs: vec![(
                PathBuf::from("/disk/keep.mp3"),
                PathBuf::from("/disk/copy.mp3"),
                n,
            )],
            bytes: n,
            total: 1,
            a_files: 2,
            b_files: 0,
        };

        s.keep_answer(root, None, 111, None, &pairs(10));
        s.keep_answer(root, None, 222, None, &pairs(20));

        let rows: i64 =
            s.db.query_row("select count(*) from answer", [], |r| r.get(0))
                .unwrap();
        assert_eq!(rows, 1, "the first answer was left behind");
        let kept: i64 =
            s.db.query_row("select count(*) from answer_pair", [], |r| r.get(0))
                .unwrap();
        assert_eq!(kept, 1, "pairs were left behind with the old answer");

        assert!(
            s.answer(root, None, 111, None).is_none(),
            "the old mark still answers"
        );
        let now = s
            .answer(root, None, 222, None)
            .expect("the new mark answers");
        assert_eq!(now.bytes, 20);
        assert_eq!(now.pairs.len(), 1, "the answer named no copies");

        let _ = std::fs::remove_file(&file);
    }

    /// An answer saying copies were found but naming none of them is refused.
    #[test]
    fn an_answer_that_names_no_copies_is_not_trusted() {
        let (mut s, file) = store("empty-answer");
        let root = Path::new("/disk");
        s.keep_answer(
            root,
            None,
            7,
            None,
            &Answer {
                pairs: Vec::new(),
                bytes: 900,
                total: 5,
                a_files: 9,
                b_files: 0,
            },
        );

        assert!(
            s.answer(root, None, 7, None).is_none(),
            "an answer with no copies in it was handed back"
        );

        let _ = std::fs::remove_file(&file);
    }

    /// A walk that finds the folder as it left it must be able to say so
    /// without reading a single row.
    #[test]
    fn the_mark_says_whether_anything_moved() {
        let (mut s, file) = store("mark");
        let root = Path::new("/data");
        assert_eq!(s.mark(root), None, "nothing has been walked yet");

        s.remember(
            root,
            &[record("/data/a.bin", 1, 1, Some(1))],
            &nothing(),
            4242,
            11,
        );
        assert_eq!(s.mark(root), Some(4242));

        let held = s.known(root);
        s.remember(
            root,
            &[record("/data/a.bin", 1, 1, Some(1))],
            &held,
            9999,
            22,
        );
        assert_eq!(s.mark(root), Some(9999), "a new walk leaves a new mark");

        assert_eq!(s.mark(Path::new("/elsewhere")), None);

        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn folders_are_held_apart() {
        let (mut s, file) = store("apart");
        s.remember(
            Path::new("/one"),
            &[record("/one/a", 1, 1, Some(1))],
            &nothing(),
            1,
            1,
        );
        s.remember(
            Path::new("/two"),
            &[record("/two/a", 1, 1, Some(2))],
            &nothing(),
            2,
            2,
        );

        assert_eq!(s.counts(), (2, 2));
        assert_eq!(s.known(Path::new("/one")).len(), 1);
        assert!(s.forget(Path::new("/one")));
        assert_eq!(s.known(Path::new("/one")).len(), 0);
        assert_eq!(s.known(Path::new("/two")).len(), 1, "the other stays");
        assert_eq!(s.counts(), (1, 1), "the files go with the folder");

        let _ = std::fs::remove_file(&file);
    }
}
