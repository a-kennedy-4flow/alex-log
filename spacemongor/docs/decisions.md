# Decisions

## Glossary

Terms used across the project. Defined here once.

**Treemap** — a rectangle split into smaller rectangles. Each one takes area in
proportion to its value.

**Squarified** — the layout rule that keeps each rectangle as close to a square
as it can. A long thin sliver is hard to compare against another sliver.

**Nesting** — drawing a folder as a box that holds its own children as boxes.

**Pending box** — the dim box standing for the part of the filesystem the walk
has not reached.

**Charge** — adding a file size to its folder and to every folder above it.

**Reparse point** — the Windows record that makes one path stand for another.
A symlink and a junction and a drive mounted inside a folder are all reparse
points.

**Digest** — a short number standing for the whole content of a file. Two files
holding the same bytes always share it. Two files with different bytes almost
always differ in it.

**Pool** — every folder a search was given read as one set of files. A file held
in two of them is a copy wherever it sits. The extractor asks for this.

**Group** — one of the nine sets of file types read off an extension. Each wears
one colour.

**Bundle** — a named set of groups. Photos and video are one bundle. Every group
sits in exactly one.

**Pick** — the groups and the extensions a search or an extraction is told to
look at. Nothing set means every file.

**Question** — the shape of a search and the folders it names. Two searches that
share it share one stored answer.

## Answered by the brief

| Question | Answer |
| --- | --- |
| Frontend | Native window with egui on eframe. One binary. |
| Colour grouping | By file type. |
| Disk picker | Mount points on Linux. Drive letters on Windows. |
| Navigation | Nested to a depth limit. Click a folder to re-root. |

## Two systems

The brief named Linux first and Windows second. One binary covers both.
`src/sys/mod.rs` declares the four things that differ and each system answers
them in its own file. Nothing above that folder knows which system it is on.

Three answers are weaker on Windows. The gap between the reported figure and
the walk is wider there for the first of them.

Size is the length the file reports rather than the blocks it occupies. Because
Windows gives the occupied figure only per file through `GetCompressedFileSize`
and that call on every file of a whole drive costs more than the accuracy is
worth.

A hard linked file is counted under each of its names. Because Windows fills the
link count in only for metadata taken from an open file and the walk never opens
one.

The check that the walk has not left its filesystem is not needed. Because a
drive mounted inside a folder is a reparse point and the symlink guard turns
away from every reparse point already.

## Scan rules

A symlink is never followed. It is counted as its own entry. Because a) a
symlink to a parent would loop forever b) a symlink to another filesystem would
count space that is not on this disk and c) the blocks a symlink occupies are
its own.

The walk stays on one filesystem. A nested mount is skipped. Its own entry in
the picker covers it.

A hard linked file is counted once. The first path found wins.

An unreadable directory is skipped. The count is shown in the status line so a
short total can be explained.

Size is blocks occupied rather than the length the file reports. A sparse file
costs what it costs.

Nothing is opened for writing. Nothing is deleted. The walk reads directory
entries and their metadata. The picker reads the free space figure for the
filesystem.

## Gradual fill

The operating system reports occupied bytes for the filesystem before the walk
starts. The outer box is sized to that figure from the first frame. Discovered
files fill it in and the remainder stays as the pending box. Because a) a picture that
resized on every tick would be unreadable and b) the reader can see how much is
still missing.

The gap rarely closes. A folder the walk could not open leaves one. So does
every byte a filesystem spends on itself. On Windows the walk reads the length
of a file rather than the room it takes so a drive full of small files leaves a
wide gap. The box is therefore named for the walk while the walk runs and named
for the gap once it ends. The status line states the figure.

The walk hands the window a fresh snapshot every 120 ms. The snapshot is pruned
to the boxes a pointer could land on.

The threshold is a share of the outer box rather than a share of the parent.
Because a) area on screen follows the share of the outer box and nothing else
b) a share of the parent compounds with every level so the count grew without
limit as the nesting deepened and c) measured this way one level can never hold
more than `1 / MIN_SHARE` boxes whatever the nesting.

The nesting reaches ten. `/usr` holding 240,271 files was measured at each
setting.

| Nesting | Threshold | Boxes held | Frame |
| --- | --- | --- | --- |
| 6 | share of the parent | 96,401 | 2.2 ms |
| 6 | share of the outer box | 1,526 | 0.43 ms |
| 10 | share of the outer box | 5,555 | 1.02 ms |

Ten levels now cost half of what six used to.

## Colour

The palette comes from the validated dark categorical set. The eight file type
groups take slots one to eight and `Other` takes a neutral grey.

A treemap puts any two groups side by side so the palette was checked against
every pair rather than adjacent pairs only. It fails that gate.

```
node scripts/validate_palette.js "<the eight hues>" --mode dark --pairs all
  [FAIL] CVD separation      worst #d55181 vs #199e70  ΔE 1.6 deutan
  [FAIL] Normal-vision floor worst #e66767 vs #d95926  ΔE 7.1
```

Every subset of the eight was then checked. Four hues is the largest set that
passes. No set of five clears the normal vision floor of 15.

Four groups is not enough to read a disk. The eight were kept and the loss is
paid for elsewhere. Because a) the pointer names the group for any box under it
and b) clicking a group in the legend dims every other box which answers "where
is all my video" exactly rather than by eye.

A third reason used to stand here. It said every box carries its own name so
colour is never the only way to tell one from another. It was not true. A name
is drawn only where the box is at least 32 pixels wide and tall enough for the
text, and `MIN_SHARE` keeps boxes far below that. Measured on `/usr` at ten
levels, 230 of 3,471 boxes carry a name. For the other 93 per cent colour is the
only cue, and those are the small boxes where a reader needs the help most. The
trade now rests on the two reasons above.

The text on a box that does carry a name is whichever of near black and near
white reads further from the fill, measured as a contrast ratio on relative
luminance. A brightness threshold was used before and it chose the worse of the
two for five of the nine groups. `Image` read at 2.79 to one where 4.5 is the
floor for text of this size. Every group now clears 4.5 and `every_group_label_clears_the_contrast_floor`
holds it there. `Audio` sits exactly on the floor and is the group to watch if
the palette moves.

Revisit this if a reader reports confusing magenta with aqua. The fix is to cut
`Document` or `Archive` and fold it into `Other`. A pattern on boxes below the
label gate would buy back the reason that was withdrawn.

## Duplicates

A pool of any size and two folders against each other are the same search. Both
end in a set of files holding one content. Two folders keeps only the sets that
reach both sides. A pool keeps every set holding more than one copy. That is why
one engine serves both. One folder on its own is a pool of one.

A folder held inside another on the list is dropped before anything is read.
Because a) the same file would otherwise be listed under both b) the two
listings hold one path each rather than two names for one file so the hard link
test cannot throw it out and c) the search would then report every file below
the inner folder as a copy of itself.

One folder needs the shortest path treated as the one to keep. Because a) some
copy has to be the one that stays b) the shortest path is the least buried and
so the most likely original and c) the choice has to be the same on every run or
the list moves under the reader.

A second hard link to a file is not reported. Because deleting that name frees
nothing and a list of things that free nothing wastes the reader's time. Windows
gives the link count only for an open file so the tool cannot tell there.

A duplicate is a file holding the same bytes as one on the other side. Because
a) a copy under a new name is still a copy so the name cannot be part of the
test b) two files of one length are very often not one file so the length cannot
be the test on its own and c) the wrong answer here costs a person their data.

The bytes decide every pair. A digest still runs first. Because a) comparing
every file against every file of its length is a square of the count b) the
digest turns that into one read for each file and c) the byte pass then runs
only for pairs that already agree.

A size held by one side only is dropped before anything is read. That is what
keeps the comparison cheap on a real disk.

An empty file is left out. Every empty file matches every other one and saying
so is noise.

The folders are held as plain paths rather than as places in the tree. Because
a) they can sit on different disks b) only one walk lives at a time so marking
the second would throw the first away and c) a path survives switching disks.

One file reached under two of the folders is listed once. The first name it was
found under is the one kept. Because a pool that held both names would pair the
file with itself and offer a deletion that frees nothing.

Deleting a duplicate is not built. The tool only reads.

The result fills the window rather than a panel down the side. Because a) a pair
is two paths and neither fits a narrow strip b) reading one path without the
other says nothing and c) the map is still one button away.

The duplicates are gathered under the folder on side B and the fullest folder
comes first. Because a) a flat list of pairs is a wall with no shape b) the
question is always which folder to deal with rather than which file and c) the
answer is then the first row.

## Diagnostics

Everything a fault report needs is on one page with a button that copies it as
text. Because a) the first question asked of any fault is what the machine was
and b) asking someone to find a cache file in an application data folder they
have never opened wastes both sides a round trip.

## One answer for one question

An answer is keyed on the whole question. That is the shape of the search and
every folder it names in order. Because a) a search now names any number of
folders so no pair of columns can hold the key b) the same folders in another
order are the same pool but not the same two sided comparison and c) a pool of
two of three folders must never be handed the answer for all three.

Which folders the answer covers and what each one held are kept in a table of
their own. Because the cache is there to be queried by hand and a list folded
into one text column cannot be.

The stored answer is cleared before a new one lands rather than left to a unique
constraint. Because SQLite counts two NULLs as different, so a search of one
folder against itself never conflicted with anything, and every run added
another row.

The cost was not only clutter. The pairs were written against whichever row came
back first while the mark matched a different one. A real cache was found
holding two answers for one folder where the one that matched the mark named no
copies at all. The next run would have shown a headline of 37 GB across 47,362
copies over an empty list.

An answer saying copies were found but naming none of them is now refused.
Refusing costs one search. Telling costs trust.

## Looking at some groups only

A file outside the chosen groups is still listed and still kept in the cache. It
is only left out of the matching. Because a) the walk has to see everything for
the cache to stay whole and b) a narrower search would otherwise throw away the
digests a wider one paid for.

The matching drops it again at the last moment rather than trusting the listing.
Because the cache may still hold a digest for it from a wider run and a digest
is all the matching needs to pull something in.

What was asked about is folded into the mark the stored answer is keyed on. Both
halves of the pick go in. Because a) the same folder searched for pictures and
searched for everything are two different questions b) nothing on the disk has
to move between them and c) without it the second would be handed the first
one's answer.

The extensions are folded in after the groups and each one ends with a byte no
extension can hold. Because otherwise `ab` and `c` would fold to what `a` and
`bc` folds to.

A pick that names every group folds to the same number as a pick that names
none. Because they are one question and one question takes one stored answer.

Each group carries a number written out by hand rather than taken from its place
in the list. Because adding a group later would otherwise quietly change what an
answer stored under the old numbering meant.

## Making the search fast

Reading files is the whole cost. Everything else is noise beside it. Three
changes attack it and the phase timings in the probe say what each one bought.

**The opening block is digested first.** Only files that still collide after
that are read in full. Because a) two files of one size almost always differ in
their first block b) the block is a fixed 64 KiB whatever the file holds and c)
a file no larger than one block is finished by the first read anyway. On
`/usr/lib` the opening blocks took 1,729 ms and the whole files that followed
took 19 ms.

**The walk is shared out too.** Reading a folder waits on the drive in the same
way reading a file does. One thread took 288 ms over a tree that eight covered in
158 ms. A worker stops only when the queue is empty and no other worker is still
inside a folder, and both are read under the one lock so a worker about to add
folders has already been counted.

The order files come back in then depends on which thread got there first, so
each group of one size is put in path order before it is matched. Without that
the pair reported would move between runs. It costs about fifteen milliseconds
on a hundred thousand files and it buys an answer that does not wander.

**Reading follows the drive.** A solid state drive serves many reads at once. A
spinning disk does the opposite because every extra reader pulls the head away
from the one before it. The kind is read from `queue/rotational` on Linux and
from the seek penalty the volume reports on Windows.

Twice the core count up to sixteen for solid state. Because a) reading waits on
the drive rather than the processor so more threads than cores still pays b) one
NVMe measured 9.6 s at one reader and 2.5 s at sixteen for the same work and c)
past sixteen each doubling bought under a tenth.

One reader for a spinning disk. It also reads in the order the filesystem laid
the files down and compares two files eight megabytes at a time rather than
sixty four kilobytes. Because a) a seek costs more than the transfer it
interrupts b) the folder order says nothing about where the blocks sit and c)
switching between two files every sixty four kilobytes is the worst thing that
can be asked of a head.

Nothing rotational was to hand. The spinning path is reasoned from how the
hardware works and is not measured. `SPACEMONGOR_READERS` overrides the count
for anyone whose drive does not behave like its kind suggests.

**A set of files confirmed identical is given a content number.** Two files
carrying one number need no byte comparison ever again. Because a) the byte
comparison is the one part the digest cannot replace b) it costs two whole file
reads for every pair and c) a folder that is mostly copies pays it in full. On
`/usr/lib` a cold run confirmed 920 pairs by reading and a warm run confirmed
none.

The reverse does not hold. Two different numbers do not prove two files differ
because they may never have been compared. Only a match is trusted.

`/usr/lib` at 37,553 files went from 2.17 seconds cold to 0.19 seconds warm.

## The cache

A digest costs a whole file read. Holding it means a second run over a folder
nothing has touched reads nothing.

The cache is SQLite rather than a format of our own. Because a) the point is to
query it later with whatever tool is to hand b) a format of our own would need a
reader written before anyone could ask it anything and c) SQLite costs one
dependency and no design.

A row is trusted while the size and the modified time both hold. Because a) a
digest is the one thing worth holding and the only thing that makes it wrong is
the file changing b) those two fields come free with the listing and c) reading
the file to check whether the digest is stale would cost exactly what the cache
saves.

A cache of an older shape is carried forward rather than thrown away. Because
every digest in it cost a whole file read and losing them because a column was
added makes the next run pay for all of them again.

A stored answer of a shape that cannot be read is dropped while the digests
under it are kept. Because an answer is only a list of pairs that the digests
produce again in one matching pass.

The work follows the shape rather than the version number. Because a real cache
was found carrying a version of two over tables that already held the columns of
three. The number is written last and a run that stops before it reaches the
file leaves the two disagreeing. Only the tables can be trusted.

A cache written by a later build is started again. Its shape is not known here
and guessing at it is worse than reading the files once more.

Each search records which cache file it uses when it starts rather than looking
it up on the thread doing the work. Because a) the worker knows nothing about
who asked for it and b) a test needs its own cache and only the thread that
started it knows which test it is.

A second writer waits rather than gives up. Without `busy_timeout` a comparison
running beside another one silently cached nothing and the next run paid for it.

The digest is a 64 bit number stored as a signed integer. SQLite holds no
unsigned type so the bits are reinterpreted. A test covers `u64::MAX` making the
round trip.

The cache is the only thing the program writes and it never sits under a scanned
folder unless the host puts it there.

Deciding a pair from the cache alone is not built. The bytes still settle every
pair and that needs both files. Because a) a digest is 64 bits against a file of
any size b) the whole promise is that a reported pair is never a guess and c)
the size pass already means the byte pass runs for very few files.

## The unaccounted space

The gap was stated and left there. A figure with no explanation reads as a
fault in the tool. The button now asks the machine every question it can put.

A folder that could not be opened carries what the host said about it and the
reasons are gathered so one reason repeated a thousand times reads as one thing
to deal with. Because a count on its own only raises the question again.

Long paths were listed here as an unknown. They are not. The standard library
puts the verbatim prefix on before it opens a folder or a file so the old limit
does not apply.

Nothing is guessed at where it can be counted. A denied folder is named and its
size is left blank because nothing outside it can know. A deleted file a program
still holds is read from `/proc` so the bytes are exact. The tail of the last
cluster of every file is an estimate and it says so.

Whatever is left over is stated as its own figure rather than folded into a
cause. Because a) the residue is real and naming it wrongly would be worse than
naming it not at all and b) a reader who sees the parts add up short knows to
stop looking for a file.

Deleted files held open cannot be asked on Windows. The kernel handle table is
not exposed the way `/proc` is. The finding is simply absent there.

## The icon

A tunnel drawn as frames inside one another receding to a light point. It is
computed rather than shipped. Because a) the binary stays one file b) the icon
can be made at whatever size the host asks for and c) the geometry is checked by
a test rather than by eye.

## The picker

A folder is measured on demand rather than as the list is drawn. Because a
picker that walked every folder below it to fill in a column would take as long
as the thing it is there to save.

A folder drawn in the map is given no occupied figure to stand against. Because
the outer box then stands for what the walk found and there is no gap to
explain. A gap only means something when it is measured against what the
operating system says a whole filesystem holds.

The twenty largest files are kept and the rest are counted. A folder of millions
then costs nothing to hold.

## Extracting by file type

The folders are walked again rather than the search being trusted for the list.
Because a search only names what it found more than once and this has to bring
across everything, the one of a kind included.

The extractor starts the search itself rather than waiting to be handed one.
Because a) the search is the slow part and the listing that follows it costs
nothing next to it and b) a person reorganising backups never wants the pairs on
their own.

Every path is flattened against the folder it was found under rather than
against the first folder on the list. Because two backups laid out the same way
would otherwise land on top of each other and the second would be renamed all
the way through.

A path none of the folders holds is cut to its name. Because joining a path that
still names its old folder onto the new one writes outside the new one.

A folder for each file type is offered and is not the default. Because a) the
layout that says where a file came from and the layout that sorts by type answer
different questions and b) the one that keeps the old paths is the one that can
be checked against the backup it came from.

A bundle is offered beside the group. Because a) nobody sorting a backup thinks
of photos and video as two things b) the nine groups are read off an extension
and are a fact about the file rather than a question anyone asked and c) a
folder for each group scatters one holiday across Image and Video.

Every group sits in exactly one bundle. Because a file whose group sat in none
would have nowhere to land under a bundle layout.

Extensions narrow what the groups already hold rather than replacing them.
Because a) a raw photo hunt is a picture hunt cut down to three extensions b) an
extension that replaced the groups would need its own answer to what a file with
no extension is and c) the step can say when nothing ticked could ever match.

A file deferring to a copy the listing never brought across comes across itself.
Because a) the search and the listing pick their own name for a hard linked file
and can disagree b) deferring to a name that is not coming loses the content
altogether and c) the guard costs one set of the paths already in hand.

What the folders hold by type is measured on demand. Because a) ticking a group
that is not there wastes a search and b) the walk that counts them is the same
one the picker already runs.

The pair list is held to five hundred thousand rather than five thousand.
Because a) the list is no longer only for reading and b) a disk of fifty
thousand copies is exactly the one worth doing this to.

The cap throws the smallest pair away rather than refusing whatever arrives
after the cap is reached. Because the walk hands pairs over in the order a hash
map happened to store them, so refusing late arrivals keeps an arbitrary set and
the set moves between runs over one unchanged disk.

The filter is worked out once when it moves rather than on every frame. A third
reason used to stand beside the two above saying the view draws only the rows on
screen so a long list costs it nothing. That was not true. Every pair was read
on every frame to work out which rows the filter left, and worst while someone
was typing because each keystroke redraws. Measured with a filter typed:

| Pairs | Per frame before | Per frame now |
| --- | --- | --- |
| 1,000 | 0.35 ms | 0.26 ms |
| 50,000 | 7.72 ms | 0.73 ms |
| 200,000 | 36.77 ms | 0.83 ms |

The cost is now flat in the length of the list rather than linear in it.
`how_long_a_dupes_frame_takes` is the probe.

Flattening keeps the ends and drops the middle. The first part says broadly
where a file lived and the part just above it says what it sat with. Neither of
those is in the middle.

Two different files can flatten onto one place. The second takes a number and
the count is shown before anything is written, because a silent rename is a file
someone later cannot find.

Nothing is moved. One copy is laid down and the old tree is left standing. A
list of what can then go is written separately. Because a) a move that fails
half way leaves neither tree whole and b) reading the list is the point at which
a person can still change their mind.

The list names a file only once its copy is really standing in the new folder.
A list that named something whose copy never landed is a list that loses it.

What arrived is taken from the copying rather than read off the disk. Asking
whether the destination exists cannot tell our copy from someone else's file of
the same name. The copying refuses that case and writes nothing, the destination
exists all the same, and the list then named the only copy of the file it
refused. The job records every destination it really put bytes at and the list
is built from that.

The folder written into cannot be one of the folders being read, nor hold one,
nor sit inside one. Because every file would be laid on top of itself, the
copying would report it as already there, and the list would name the original.

What comes back covers every file the list names rather than the redundant
copies alone. Because the two figures are shown side by side and one counting
the copies while the other counted the copies plus the original described two
different sets.

The record of a clear out goes to the data folder beside the cache rather than
beside the trashed files. Because a) a clear out is given no destination to
write to b) inside the bin it is an entry with no record of its own, which the
host shows as trashed and cannot put back, and c) emptying the bin would destroy
the record of what the emptying removed.

A group on the gather worklist is marked done when its job finishes with nothing
refused and nothing failed. Marking it as the job starts says a group is dealt
with when the job may have been stopped or the disk may have filled, and the
worklist then skips the group that still needs doing.

The extractor asks its five questions one step at a time. Because a) extracting
is one question that nobody answers in one breath b) each part changes what the
next part is worth asking c) the search costs minutes and is only worth starting
once the first three are settled and d) a plan read at the moment it is made is
a plan that can still be refused.

A step ahead of the first unanswered one cannot be opened. Because its question
has no meaning until the ones it rests on have answers.

A step already answered can be gone back to and answering it again throws the
plan away. Because a plan built against settings that have since moved is a plan
that lies about what it would do.

## Gathering the copies

Copying only. Nothing is moved and nothing is deleted. Because a) this is the
first part of the program that writes anywhere a person keeps things b) a copy
that goes wrong costs disk space and a move that goes wrong costs the file and
c) moving and hard linking both build on a path that has to be trusted first.

The groups are a worklist rather than a row of chips. Because a) a disk holding
tens of thousands of copies is not dealt with in one go b) the question asked of
each group differs since video is worth moving and code is worth leaving and c)
without a mark for what is done the place is lost the moment the view is left.

Somewhere to put them is chosen with the picker that already exists rather than
typed or asked for through the host. Because a) the picker already walks folders
and reads them b) a dialog from the host would be a dependency and a different
one on each system and c) coming back to where the question was asked is the
part that matters.

Only the redundant copy is offered. The file being kept is never in the list.
Because a gather that could take the original is how someone loses the only copy
they had.

The plan is worked out and shown before anything is written. It names every file
and every destination and what it comes to and what is free where it is going.
Because the confirmation has to say what will actually happen rather than ask
whether to go ahead.

The source tree is laid out again under the destination rather than flattened.
Because a) two files of one name from two folders would otherwise land on each
other and b) a path that still reads the same is one a person can check.

Nothing is written over. A destination holding the same bytes is left alone so
the whole gather can be run again safely. A destination holding anything else is
refused and named.

Each file goes to a name of its own and is read back before it takes the real
one. Because a copy that stops halfway must not leave something that looks
finished, and a copy nobody checked is a copy nobody can trust.

A manifest is written beside what was copied. Because the gather has to be
traceable by hand, and that file is what a later move or a later undo would be
built on.

## Taking things away

The recycle bin and never an outright delete. Because a) this is the only part
of the program that takes anything away and b) a person who picks the wrong row
has to be able to put it back.

Windows is asked through the shell rather than having the file unlinked. Only
the shell writes the record that lets it be brought back.

The warning about destroying a file is kept even though the confirmation is
suppressed. Because a) a drive with no recycle bin makes the shell fall back to
deleting outright b) removable drives have no recycle bin by default and c)
without that one flag a clear out on a memory stick would destroy the files
while reporting it had put them somewhere they could be fetched back from.

Linux follows the freedesktop rules rather than guessing at them. The record
saying where the entry came from is written first and only then is the entry
moved. Because a record with nothing behind it is litter and an entry with no
record can never be put back. The record takes its name with `create_new` so two
programs trashing one name at once cannot both win it.

The trash has to sit on the same filesystem as the entry. A rename cannot cross
one and a copy would defeat the point.

A tick box stands between reading the list and taking anything away, and it
clears itself the moment it is used.

A single entry is asked about in a strip drawn above whatever view is showing
rather than where it was asked from. Because a) the menu it came from has closed
by the time the question is put and b) a strip inside one view would be missed
by anyone looking at another.

A folder to copy into is only asked for when something is being copied. Wanting
one before anything could be cleared out sent people looking for a folder they
were never going to use.

## Reading the recycle bin

The records the host wrote are read and nothing is moved. The tool puts things
in. Taking them back out is the desktop's job and it already does it well.

The Windows record reader lives with the platform neutral code rather than with
the rest of the Windows work. Because a) it is only bytes and b) it is the
fiddliest parsing here and it cannot be tried on a Windows machine from this
one. Both shapes and four ways of being malformed are covered by tests that run
anywhere.

Anything emptied out is beyond this tool and it says so rather than implying
otherwise. Reaching those bytes means reading the raw disk and rebuilding the
filesystem's tables. That is a different program and a risky one.

## Walking up to something real

A path can name a folder that has gone. Reload this folder moves up the tree
until it reaches one that is really there rather than refusing. Because a) the
folder above is what the reader wanted to look at anyway and b) refusing leaves
them with nothing.

The same walk settles whether the trash sits on the right filesystem. A trash
folder that has not been made yet has no device of its own so the nearest folder
that is really there answers for the whole chain. Looking only one level up got
that wrong when nothing in the chain existed.

## Opening a location

A path is written as a URI before it is handed to the file manager. Every byte
outside the unreserved set is escaped. Because a space or a hash in a path cuts
an unescaped URI short and the file manager then opens the wrong place or
nothing at all.

On Windows the argument goes to Explorer raw. Because Rust wraps an argument
holding a space in quotes and that puts `/select,` inside the quotes where
Explorer cannot see it. Explorer wants the quotes around the path alone. A path
with no space worked and any path with one did not.

The menu carries two entries rather than one. Opening a folder and showing that
folder inside its parent are different acts. One entry that guessed between them
would be wrong half the time.

## What Windows has and has not shown

The Windows build is cross built from Linux with zig as the linker and type
checked against the `x86_64-pc-windows-msvc` target. It was confirmed running on
Windows on 15 September 2026.

These parts have still never been exercised on a real Windows machine as far as
this document knows.

`explorer /select,` for showing an entry in its folder and `explorer` for opening
a folder. Neither has an error path because Explorer reports failure through a
window rather than an exit code.

The drive picker against an optical drive holding no disc and against a mapped
network drive that is no longer reachable. `volumes()` runs on the window thread
and the free space call waits for the share. A stale network mount on Linux
stalls it the same way.

## Looking at a layout with no display

`step_probe` in `src/app.rs` draws each step of the extractor into a headless
context and prints every piece of text with the position it was given. It is
marked ignored and is not a check.

It found that a plain label in a wrapped row is drawn at the start of the row
rather than where the row put it. The space is still reserved so the widgets
around it sit correctly and only the label itself is wrong. The steps row and
the group list were rebuilt without a label in a wrapped row.

The first frame of a panel has no size stored for it yet so what it holds is not
placed. The probe reads the second frame.

## Not built

Continuous watching. The brief asked for a manual reload and nothing else.

Deleting or moving files. The tool is read only.
