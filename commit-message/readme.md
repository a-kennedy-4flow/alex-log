# commit-message

A global `prepare-commit-msg` hook. It prefills your commit message with a
summary of what is staged.

Written in Rust. It replaces the shell and awk version that used to sit in
`~/.config/git/hooks/prepare-commit-msg` alongside `lib/commit-stats.sh`.

## What it prints

```
PLRS-1234 

# Commit stats:
#   files                      17   (13 added, 2 modified, 1 deleted, 1 renamed)
#   lines changed              22   (+19 / -3)
#     ignoring whitespace      20   (+18 / -2)
#     test                      9   (+9 / -0)
#     non-test                  7   (+4 / -3)
#     generated                 6   (+6 / -0)
#   1 binary file(s) excluded from line counts
#   characters                278   (+241 / -37)
#     test                    105   (+105 / -0)
#     non-test                118   (+81 / -37)
#     generated                55   (+55 / -0)
#   review time            20 min   (10 min to 40 min; 1 sitting)
#     naming up to 1.60x on 1 file
#     indentation 2.1x on src/parse.rs
#     prose 300 words
#   branch                commit 2 on PLRS-1234-my-feature; vs main +20 / -3
#
# Please enter the commit message for your changes. Lines starting
```

Three terms are used throughout and mean this. A **bucket** is one of the three
groups a changed path falls into. A **trunk** is whichever of `main` or `master`
or `origin/main` or `origin/master` exists first. **Stripped** means git
discarding comment lines when you save the editor.

## The review time row

The estimate comes from the `review-time` crate under `code_reviewing`. It is
read at the standard depth of 300 lines per hour. The three notes under it only
appear when they apply.

It needs the text of the diff and not just the counts. Because a) an opaque
identifier cost 1.63x on the snippet task b) nested control flow without
indentation cost 113% more time in the replication trial and c) prose is read at
a words per minute rate rather than a lines per hour one the same line count can
mean very different reading. That is one more `git diff --cached` per commit. It
costs about a tenth of a second on a fifty thousand line stage.

Binary files and lock files and anything under `node_modules` or `dist` or
`vendor` are left out of the estimate. The line counts above it still include
them.

The research behind every constant is in `code_reviewing/reading-speed.md` and
the papers are in `code_reviewing/knowledge_base/`.

## The rules it holds to

It never rejects a commit. Every failure path leaves your message untouched and
exits zero. A hook that can block a commit is a hook you end up disabling.

It only writes where the comments are certain to be stripped again. Otherwise
the summary lands in the commit for real. Because the comments only go when the
message is edited a) an empty source and a template both guarantee an editor b)
`-m` and `-F` and a merge and an `--amend --no-edit` can all reach the commit
with no editor at all and c) a `commit.cleanup` of verbatim or whitespace keeps
the comments even when there is an editor.

A repo shipping its own `prepare-commit-msg` wins outright. This one hands over
with `exec` and gets out of the way. Running both would print the summary twice.

It never hands over to itself. The check is on device and inode rather than on
the path. See the history below for why that guard is not paranoia.

It never writes the git index. Read the history below before you add anything
here that does.

## How paths are bucketed

Generated beats test. A generated test file is still noise.

**Generated** is any path with a `generated` or `__generated__` or `gen`
directory component. It is also any filename ending `.pb.go` or `_pb2.py` or
`.g.dart` or `.g.ts`. It is also any filename holding `Generated` or `generated`
in front of a lowercase extension.

**Test** is any path with a `test` or `tests` or `__tests__` or `spec` or `e2e`
directory component. It is also `.spec.` and `.test.` before a js or jsx or ts
or tsx extension. It is also a filename ending `Test.java` or `Tests.java` or
`IT.java` or `_test.go` or `_spec.rb`. It is also a filename starting `test_`
and ending `.py`.

**Non-test** is everything else. The patterns are broad rather than tuned to one
language. Because the split only has to be roughly right to be worth reading a)
a wrong guess costs nothing b) every repo gets the same answer with no
configuration and c) there is nothing here to keep in step with a repo that
moves on.

## One deliberate change from the shell version

The old row labelled `characters` counted bytes. `mawk` has no multibyte
support so `length($0)` returned a byte count. This version counts characters.

For an ASCII diff the two agree exactly. For a diff carrying accents or symbols
or CJK the new number is smaller and it is the correct one. The label now tells
the truth.

Everything else is unchanged. That was verified rather than assumed.

## Build and install

```sh
cargo build --release
./install.sh
```

`install.sh` copies the binary to `~/.config/git/hooks/prepare-commit-msg`. A
copy rather than a symlink. Because a hook is run on every commit a) a missing
symlink target makes git complain every single time and b) a copy keeps working
when this repo is moved or archived.

The hook is found through `core.hooksPath`:

```sh
git config --global core.hooksPath ~/.config/git/hooks
```

Rebuilt the binary? Run `./install.sh` again.

## Tests

`cargo test` covers the path bucketing and the hunk arithmetic and the message
rewriting and the ticket parsing.

The end to end check was a comparison against the shell version it replaces. A
fixture repo was built holding an addition and a modification and a deletion and
a rename and a whitespace only change and a binary file and files in every
bucket. On ASCII input the two produced byte for byte identical output. Six
further cases matched as well: a branch ahead of its trunk; a branch carrying no
ticket; a `message` source; a `verbatim` cleanup; an empty stage; a first commit
with no HEAD.

The Rust version is also quiet on a first commit. The shell version printed a
`fatal: ambiguous argument 'HEAD'` to your terminal every time.

## History. Read this before extending it

On 2026-09-21 this machine died twice from a fork storm. It was killed by a git
hook. Roughly 24500 processes. All 32 GB of memory and all 8 GB of swap gone.
The same thing had already happened on 2026-09-17.

The cause was a build gate script copied into `~/.config/git/hooks/_chain` and
then symlinked to all 28 hook names. One of those names was
`post-index-change`. That hook fires whenever the git index is written. The
script wrote the index itself through `git add` and through `git stash push`. So
it re-entered itself without limit.

The trigger needed no human. VS Code's git extension refreshes the index on its
own schedule.

Three rules come out of that and they are the reason this crate is shaped the
way it is. First a hook must never write the git index. Second a hook must never
be wired to an event it was not written for. Third a hook must never be able to
invoke itself. The inode check in `repo_hook` is the third rule made concrete.

The full post-mortem is in `../69.log`.
