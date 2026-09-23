# pre-commit

A global `pre-commit` hook that only fires in the repos you list. Everywhere else
it exits zero without printing anything.

Written in Rust. It replaces the shell hook that ran Gradle and Terraform and
squawk in every repository whether or not that repository had any of them.

## The list

The list lives at `~/.config/git/hooks/pre-commit.conf`. An install seeds it once
and never overwrites it again.

```
profile rust marker Cargo.toml
profile rust cargo clippy --all-targets -- -D warnings
profile rust cargo test --all-targets

repo /home/alex/repos/alex-log rust
repo /home/alex/repos/alex-log.worktrees/* rust
```

A `profile` line holds one command. They run in order. A `repo` line names a path
and a profile. A path closing in `/*` covers every repository under it. The first
entry that matches wins so a specific line can sit above a wide one.

Run `pre-commit --list` inside any repository to see what applies to it.

## Markers

A `marker` names the file at the root of one project. The commands then run once
in each project holding a staged change rather than once at the root of the
repository.

`alex-log` is the reason it exists. It holds four crates and no manifest of its
own so a bare `cargo test` at the root fails before it starts. With
`marker Cargo.toml` a change under `commit-message` runs the checks there and a
change to a note runs nothing at all.

A repository whose manifest sits at its own root needs no special handling. The
root is found like any other project directory.

## What it will not do

It never stashes. The old script stashed everything unstaged so the checks saw
exactly what was staged. Because a) a stash that goes wrong costs real work b)
that script needed a marker and a signal trap to be safe and c) a commit usually
stages everything anyway the checks here run against the working tree as it
stands. An unstaged break will stop a commit. That is the trade.

It never writes the index. It never formats your code. A gate that edits files
behind you is a gate you stop trusting.

It steps aside during a merge. A merge brings in work this gate never saw.

## Install

```
cargo build --release
./install.sh
```

The hook is found through `core.hooksPath` which is already set globally to
`~/.config/git/hooks`.

## The Gradle repos

Five repositories used to get their Gradle checks from the old global hook. Those
are `polaris-backend` and `polaris-backend2` and `vista` and `vista2` and
`intellij-pokemon-progress`. The seeded list defines a `gradle` profile and holds
a commented line for each of them. Uncomment the ones you want back.

The old script is kept whole at `~/.config/git/hooks/pre-commit.polaris-template`
because it also carried Terraform formatting and a squawk migration lint that no
profile here reproduces.
