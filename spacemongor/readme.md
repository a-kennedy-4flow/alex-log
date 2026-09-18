# spacemongor

A read only treemap of a filesystem. Pick a disk and watch it fill in.

Written in Rust. The window is egui on eframe so the whole tool is one binary.
Runs on Linux and on Windows.

## Run it

```
cargo run --release
```

Pick a filesystem from the box at the top. Linux lists mount points. Windows
lists drive letters. The walk starts at once. Press Reload to walk it again.
Nothing repeats on a timer.

## Controls

| Action | Result |
| --- | --- |
| Pick a filesystem | Starts the walk |
| Reload | Walks the same filesystem again |
| Reload this folder | Walks only the folder shown. Moves up if it has gone |
| Browse | Go to a folder and read what is in it |
| Recycle bin | What is in it and where each thing came from |
| Diagnostics | Where the cache sits and how fast the drive is going |
| Nesting slider | Levels drawn inside one another. One to ten |
| Click a folder box | Draws that folder as the new outer box |
| Up or Backspace | Goes back to the parent |
| Hover any box | Names the path and the size and the group |
| Right click a box | Opens the menu below |
| Click a legend chip | Dims every group but that one |

## The right hand menu

| Entry | Result |
| --- | --- |
| Draw this folder | Same as clicking it |
| Reload this folder | Walks this folder again on its own |
| Open this folder | Opens the folder itself in the file manager |
| Open containing folder | Opens the folder holding the entry with the entry selected |
| Copy path | Puts the full path on the clipboard |
| Highlight this file type | Dims every other group |
| Scan this folder for duplicates | Searches this folder on its own |
| Compare as the first folder | Holds this folder as side A |
| Compare as the second folder | Holds this folder as side B |
| Send to the recycle bin | Asks first. A folder goes with everything under it |

The last three appear on folders only.

## Browse

The Browse button opens a picker. Type a path or jump to a filesystem or click
down through the folders listed on the left.

Measure this folder walks it and reports what it holds. The total and the file
and folder counts. Every file type group with what it takes up. The twenty
largest files with a button to show each one in the file manager. Folders it
could not open are counted so a total that reads short can be explained.

From there the folder can be drawn in the map on its own, searched for
duplicates, or held as either side of a comparison. A folder drawn on its own
has no unaccounted box because the outer box stands for what the walk found
rather than for a whole filesystem.

## The recycle bin

The Recycle bin button lists what the bin for the current disk is holding. Each
entry gives its size, when it went, where it came from, and a button to show
where it sits now.

Windows writes two files for every entry in `X:\$Recycle.Bin\<your account>`.
`$I` carries the original path and the size and the time. `$R` carries the entry
itself. Both are read and neither is moved.

Linux keeps `files` and `info` under the trash folder and the tool reads the
same records the desktop wrote.

Only what this account put there can be read. A bin holding another account's
entries will look emptier than it is.

## Once it has been emptied

It is gone as far as this tool can see. Emptying unlinks the record and the
entry together and nothing is left to read.

The bytes usually remain on the disk until something else is written over them,
but reaching them means reading the raw disk and rebuilding the filesystem's own
tables from what is left of them. That is a different program and a risky one.
Recovery tools of that kind exist and this is not one.

While the entries are still in the bin they can be put back by the desktop or
the file manager in the usual way. The list here is for deciding whether they
are worth putting back.

## Diagnostics

The Diagnostics button at the top opens a page holding everything worth sending
with a fault report.

Where the cache file sits with a button to copy the path and a button to open
the folder holding it. What it takes up and how much it holds.

What kind of drive was found, how many threads it is being read with, how much
is taken from each side when two files are compared, and the cluster size where
the host has one.

How fast the current walk or search is going in bytes a second and files a
second, and how much of the last moment the drive had work in flight. That last
figure comes from the kernel's own block device counters on Linux. Windows keeps
it behind the performance counters so it is not shown there.

Copy a report puts the whole page on the clipboard as text.

## The cache

Reading files is what the search costs. Three things cut it down.

The opening block of a file is digested first. Only files that still collide
after that are read in full. Most files of one size differ in their first block
so the second read almost never happens.

The walk is shared out the same way. One thread reading folders spent 288 ms
where eight spent 158 ms on the same tree.

Reading follows the drive. A solid state drive serves many reads at once so it
gets twice the core count up to sixteen. A spinning disk gets one reader because
a second one only pulls the head away from the first. `SPACEMONGOR_READERS`
overrides the count.

A spinning disk also reads its files in the order the filesystem laid them down
rather than the order the folders name them, and compares two files eight
megabytes at a time rather than sixty four kilobytes so the head moves between
them far less often.

The view names the drive it found and the number of threads it chose.

Every digest is kept. So is a content number shared by files confirmed to hold
the same bytes. A second run over a folder nothing has touched opens no file at
all and confirms no pair by reading.

Measured on one NVMe with the page cache dropped before each run. `/usr/share`
at 102,324 files:

| Readers | Opening blocks |
| --- | --- |
| 1 | 9.60 s |
| 2 | 5.98 s |
| 4 | 4.05 s |
| 8 | 3.02 s |
| 16 | 2.51 s |
| 32 | 2.21 s |

Sixteen is where each doubling stops paying for itself. Nothing rotational was
to hand so the choice of one reader for a spinning disk is reasoned from how the
hardware works rather than measured.

`/usr/lib` at 37,553 files holding 920 copies:

| Phase | Cold | Warm |
| --- | --- | --- |
| walk | 142 ms | 73 ms |
| read the cache | 17 ms | 44 ms |
| opening blocks | 1,729 ms | 1 ms |
| whole files | 19 ms | 0 ms |
| matching | 17 ms | 8 ms |
| write the cache | 225 ms | 55 ms |
| **total** | **2.17 s** | **0.19 s** |

The cold run confirmed 920 pairs by reading both files. The warm run confirmed
none because the content numbers already said so.

The cache is a SQLite file. Linux puts it under `$XDG_DATA_HOME/spacemongor` and
falls back to `~/.local/share/spacemongor`. Windows puts it under `%LOCALAPPDATA%\spacemongor`.
`SPACEMONGOR_DB` names it directly. The view shows the path with a button to
copy it and a button to forget the folders of the current search.

A file is read again when its size or its modified time has moved. Nothing else
invalidates a row so touching a file without changing it costs one read.

A cache written by an older build is carried forward rather than thrown away.
Every digest in it cost a whole file read. Only a cache written by a later build
is started again because its shape is not known here.
Tidy it on the Diagnostics page squeezes the file back down. A cache written
over many times holds pages nothing uses. One real cache of 49 MB came back as
35 MB with every row still in it.

Because the cache is plain SQLite it can be queried with any SQLite tool. Every
set of files holding one content across everything ever scanned:

```sql
select size, count(*) as copies, group_concat(path, char(10)) as paths
from file
where digest is not null
group by size, digest
having copies > 1
order by size * (copies - 1) desc
limit 20;
```

What has been scanned and when:

```sql
select f.root, datetime(f.scanned, 'unixepoch') as scanned, count(*) as files
from folder f join file on file.folder = f.id
group by f.root;
```

## Gathering the copies

Once a search has found copies the Gather button collects them in one place.

The groups are a worklist. Each row shows how many copies it holds and what they
take up. Tick any number of them, or press Only on a row to take just that one.
A group that has been acted on is marked done and Next group to do jumps to the
first that has not. That is how a long list is worked through one group at a
time without losing the place.

Then name where they go. Choose a folder opens the picker and comes back here
with what you walked to, so the path never has to be typed. Then press Work out
what would happen.

Nothing is written until you have read that. It names every file that would be
copied, where each one would go, what it all comes to, and how much room is left
where it is going. It refuses to start if it will not fit.

Only the redundant copy of each pair is ever offered. The file being kept is
never touched.

The tree under the folder that was searched is laid out again under the
destination. Two files of one name from two folders therefore never land on each
other.

Nothing is written over. A destination
already holding the same bytes is left alone. A destination holding anything
else is refused and named.

Each file is written under a name of its own and read back before it takes the
real one, so a copy that stops halfway leaves nothing that looks finished.

`spacemongor-gathered.tsv` is written beside what was acted on with a line for
every file giving the time and what happened and the size and both paths.

## Sending things to the recycle bin

Three ways in.

Right click any box in the map and choose Send to the recycle bin. The picker
has the same on whatever folder it is standing in. Both ask before anything
moves, in a strip across the top that is drawn over whatever view is showing.
Cancel really cancels.

A folder goes with everything under it. The map still shows what went until it
is walked again and the strip carries a button to do that.

The third way takes many at once and is below.

## Bringing one of each across

The Bring one of each across button on the duplicates view lays a single copy of
every file under a new folder. A file held in five places arrives once. A file
held in one place still arrives.

Which copy comes is settled the same way as everywhere else. The shortest path
wins because it is the least buried and because the answer has to be the same on
every run.

The old tree is flattened. The slider says how many parts of a path survive and
three is the default. The first part says broadly where a file lived and the
part just above it says what it sat with. The middle is what goes.

```
V Old Backups/Alex Backup 2/Alex/My Documents/new/game.mdf
V Old Backups/new/game.mdf
```

Two different files can flatten onto one place. The second gets a number before
its extension and the count of those is shown before anything is written.

Nothing under the old folder is touched. The old tree is still there when the
copying finishes.

## The list of what can go

Write the list of what can go appears once the copying has finished. It writes
`spacemongor-to-remove.txt` in the new folder naming every old path whose
content is now standing in the new tree.

A file is named only once its copy is really there. A list that named something
whose copy never landed is a list that loses it.

The list is plain text, one path a line, so it can be read or fed to whatever
removes them. Nothing is removed by writing it.

## Clearing the copies out

The same list can be sent to the recycle bin instead of copied. Tick the box
saying you have read the list and the button becomes live. A folder to copy into
is only needed to copy. Clearing out asks for nothing but the list.

Nothing is deleted outright while the host has somewhere to put it.

On Windows the shell is asked to recycle it. Every drive keeps its own bin so
something taken from `G:` goes to `G:\$Recycle.Bin` and never to the one on
`C:`. A drive with no bin of its own has no choice but to delete outright and
Windows asks before it does. Removable drives have no bin by default so this
matters on a memory stick or an external disk.

On Linux the entry is moved into the trash the desktop understands and a record
is written first saying where it came from, so the desktop can put it back. The
trash has to sit on the same filesystem, so the one in the home folder is used
when it can be reached and the one at the top of the filesystem otherwise.

Where it will go is named before you agree to it, and where it went is named
afterwards. The Diagnostics page names it for the current disk without sending
anything. The record is written before the move because a record with nothing
behind it is litter and an entry with no record can never be put back.

Only the redundant copy is ever taken. The file being kept is never touched.

## Searching only the groups you care about

The Searching box at the top says which file type groups a search looks at.
Nothing ticked looks at everything. Pictures and Music and Pictures and music
are one click each. Any mix can be ticked.

A narrower search is a much faster one. Everything outside the chosen groups is
still walked and still drawn on the map but it is never read, and reading is the
whole cost.

The choice carries through. A search told to look at pictures reports only
picture copies, and bringing one of each across then brings pictures only rather
than leaving a folder full of things nobody asked about.

A stored answer belongs to the question that was asked. Searching one folder for
pictures and searching it for everything are two different questions and the
tool never hands one the other's answer, even when nothing on the disk has
moved.

## Finding duplicates inside one folder

Right click a folder and choose Scan this folder for duplicates. Every file
under it is read and the copies held more than once are listed.

The shortest path in a set is treated as the one to keep and every other copy is
reported against it. The headline is what deleting those copies would free.

A second hard link to a file is not a duplicate. Deleting that name frees
nothing so it is left out. Windows gives the link count only for an open file so
the tool cannot tell there and a hard linked pair is reported.

## Finding duplicates across two disks

Right click a folder and hold it as side A. Pick the other disk from the box at
the top. Right click a folder there and hold it as side B. A held folder is a
plain path so switching disks does not lose it. Press Find duplicates.

A duplicate is a file holding the same bytes as one on the other side. The name
is not looked at because a copy under a new name is still a copy. An empty file
is never a duplicate.

Sizes that appear on one side only are dropped first. The rest are read once
each and reduced to a digest. A digest match is then settled by comparing the
bytes so a reported pair is never a guess.

The result fills the window because two paths never fit a strip down the side.
Press Back to the map to return and Show the duplicates to come back.

The headline is the space on side B that side A already holds. Below it the
duplicates are gathered under the folder on side B that holds them and the
fullest folder comes first. That answers where the waste sits before you read a
single file name. Open a folder to see its files with the size and the name on
B and the matching path on A. The filter narrows every folder at once on any
part of either path.

Show in A and Show in B open either side in the file manager. Nothing is
deleted. The tool still only reads.

## What it shows

The outer box stands for every occupied byte the operating system reports for
the filesystem. The walk fills it in. What is not reached yet stays as one dim
box so the picture completes in place rather than resizing under you.

Each file wears the colour of its type group. A folder is a dark box holding its
children. Below the depth limit a folder is drawn as one solid box. Click it to
go deeper.

A box too small to land a pointer on is gathered with its neighbours into one
box naming how many it holds. The threshold follows the outer box so the count
stays flat however deep the nesting goes. Ten levels of `/usr` draw in about a
millisecond.

## Reading the status line

Occupied bytes found against the figure the operating system reports. Then the
file and folder counts. An unreadable count appears when a directory could not
be opened. An unaccounted figure appears when the walk has finished short of the
reported figure. The dim box carries the same amount.

The walk finishing short is normal. A folder it could not open is missing. So is
every byte the filesystem spends on itself. Windows reads the length of a file
rather than the room it takes so the shortfall is wider there.

## Why some files cannot be reached

Being an administrator is not always enough and the tool now says which reason
applies to each folder rather than only counting them.

**The host refused.** Windows enforces its access lists whatever your group. A
folder the system keeps for itself is owned by `TrustedInstaller` or `SYSTEM`
and its list does not name administrators at all. `System Volume Information` is
the common one. An administrator can take ownership and rewrite the list but
until that is done the answer is no.

**Another program is holding it.** A file opened with no sharing cannot be read
by anyone. `pagefile.sys` and `hiberfil.sys` and the registry are always like
this. So is a mailbox or a database while its program is running. The map still
shows these because their size can be read without opening them. The duplicate
search cannot read them.

**It belongs to another user.** Another profile under `Users` refuses an
administrator by its access list in the same way.

**It is encrypted for someone else.** A file encrypted with another account's
key can be listed but not read. Being an administrator does not help.

**It is in the cloud and not here.** A placeholder left by a sync program has no
contents on this machine until it is fetched.

Long paths are not a cause. Paths past the old limit are handled.

There is one thing that would help and it is not built. An administrator holds
the backup privilege but Windows leaves it switched off, and switching it on
only helps if every folder is opened asking for it. That means the tool
enumerating folders itself rather than asking the standard library. Say the word
if that is worth doing.

## Where did it go?

The button beside the unaccounted figure asks the machine what it can about the
difference. It never guesses at something it can measure.

| Cause | What it can say |
| --- | --- |
| Folders the walk could not open | Names each with what the host said and groups the reasons |
| Deleted files a program still holds open | The exact bytes with the program and the path. Linux only |
| Folders with another filesystem mounted over them | Names them. Anything that sat there before the mount is unreachable |
| The tail of the last cluster of every file | Half a cluster for each file. An estimate and marked as one. Windows only |

Whatever none of those account for is stated as its own figure. That part is the
filesystem spending space on itself. The journal and the tables that record
where every file sits are not files and no walk can reach them.

Deleted files still held open is the classic case where the free space figure
and a file walk disagree. It is read from `/proc` so only programs you own can
be asked unless the tool runs as an administrator. The count it could not ask is
stated.

## Safety

The tool never writes to the disk it is examining unless you ask it to. Gathering
copies only ever creates files under the folder you name. Clearing copies out
only ever moves them to the recycle bin of this machine. It reads directory entries
and their metadata and the free space figure for the filesystem. The duplicate
search also reads file contents. Nothing under a scanned folder is created or
changed or deleted. A symlink is never followed so a loop cannot hang it.

It writes one file of its own and that is the cache described below.

Opening a location starts the file manager of the host. That is the only program
it ever launches.

## What differs between the two systems

| | Linux | Windows |
| --- | --- | --- |
| Picker | Mount points from `/proc/mounts` | Drive letters from the logical drive mask |
| Size | Blocks occupied so a sparse file costs what it costs | The length the file reports so a drive of small files reads short |
| Hard links | Counted once | Counted under each name |
| Staying put | A nested mount is left to its own entry | A reparse point is never followed which covers junctions and drives mounted in a folder |

`src/sys/mod.rs` declares everything that differs. Nothing outside that folder
is written twice.

## Layout

| Path | Holds |
| --- | --- |
| `src/main.rs` | Entry point and window options |
| `src/app.rs` | The window and the painting |
| `src/scan.rs` | The background walk |
| `src/tree.rs` | The tree and the pruned snapshot |
| `src/treemap.rs` | Squarified layout |
| `src/dupes.rs` | Finding files that hold the same bytes |
| `src/gap.rs` | Working out where the unaccounted space went |
| `src/gather.rs` | Copying the redundant copies to one place |
| `src/browse.rs` | Going to a folder and reading what is in it |
| `src/consolidate.rs` | Bringing one copy of everything into a new folder |
| `src/store.rs` | The SQLite cache of what has been read |
| `src/sys/` | The picker and the metadata each system reports |
| `src/cats.rs` | File type groups and their colours |
| `src/fmt.rs` | Byte counts a person can read |
| `src/icon.rs` | The window icon drawn from nothing |

`docs/decisions.md` holds the glossary and the reasoning and the colour figures.
`docs/building.md` holds every build command including the Windows cross build.

## Tests

```
cargo test
cargo clippy --target x86_64-pc-windows-msvc --all-targets
```

A hundred and five tests. The layout maths and the group matching and the tree roll up. The
walk is run against a fixture holding a symlink loop and a hard linked pair. The
comparison is run against a renamed copy and against a decoy of the same length
holding other bytes. One folder on its own is run against three copies and
against a second hard link. The cache is run cold then warm then against an
edited file. A test run never touches the real cache. The window is drawn headless so the boxes and the duplicate
view can be checked without a display.

The second command type checks the Windows build from Linux. It needs
`rustup target add x86_64-pc-windows-msvc` once. See `docs/building.md` for
every build command and for the Windows cross build.

The Windows build is cross built from Linux with zig as the linker. It was
confirmed running on Windows on 15 September 2026.
