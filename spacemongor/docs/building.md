# Building

Every command here was run. None is written from memory.

## What is needed

Rust 1.96 or later. The crate is on edition 2024. A C compiler is needed because
SQLite is built from source. Any working `cc` does on Linux.

Building the Windows binary from Linux needs three more pieces. They are listed
further down and none of them needs root.

## Every day

Run these from the crate root.

| Command | What it does |
| --- | --- |
| `cargo build` | Debug build |
| `cargo run --release` | Builds and opens the window |
| `cargo test` | The whole suite |
| `cargo fmt` | Formats. Run it before calling any work done |
| `cargo clippy --all-targets` | Lints the crate and the tests |
| `cargo build --release` | `target/release/spacemongor` |

## Building the Windows binary from Linux

Four commands set it up once.

```
rustup target add x86_64-pc-windows-gnu
cargo install cargo-zigbuild
python3 -m venv ~/.local/zig
~/.local/zig/bin/pip install ziglang
mkdir -p ~/.local/bin
ln -sf ~/.local/zig/bin/python-zig ~/.local/bin/zig
```

Then build.

```
cargo zigbuild --release --target x86_64-pc-windows-gnu
```

The result is `target/x86_64-pc-windows-gnu/release/spacemongor.exe`.

Zig does the linking. Because a) the MSVC linker does not run on Linux b) the
mingw-w64 package needs root to install and c) zig carries its own linker and
the mingw headers with it so nothing has to be installed system wide.

`~/.local/bin` must be on `PATH`. `cargo-zigbuild` 0.23.4 finds zig by that name
alone. Setting `ZIG_COMMAND` was tried and it failed with `cannot find binary
path` so the symlink is what makes this work.

## Linting the Windows build from Linux

```
cargo-zigbuild clippy --target x86_64-pc-windows-gnu --all-targets
```

Note the hyphen. `cargo` forwards only the `zigbuild` subcommand so
`cargo zigbuild clippy` is rejected. This form calls the binary directly and
needs `~/.cargo/bin` on `PATH`.

The MSVC target cannot be checked from Linux any more. SQLite is built from
source so the check now needs a C compiler for the target and the MSVC one does
not run on Linux. The GNU target answers the same question because zig carries a
C compiler with it.

## Building on Windows

Install Rust with the MSVC toolchain then run the everyday commands unchanged.
The binary lands at `target\release\spacemongor.exe`.

## Checking what came out

```
file target/x86_64-pc-windows-gnu/release/spacemongor.exe
python3 tools/peinfo.py target/x86_64-pc-windows-gnu/release/spacemongor.exe
```

`tools/peinfo.py` reports the machine and the subsystem and every DLL the binary
imports. A release build must report `windows (no console)`. A console subsystem
binary opens a black window behind the app. `src/main.rs` asks for the windows
subsystem in release and leaves the console in debug so a panic can still be
read.

Every import should be a system DLL. Anything else would have to ship beside the
binary.

## The timing probes

Two tests are measurements rather than checks so they never run on their own.

```
PROBE=/usr cargo test --release -- --ignored --nocapture
```

`PROBE` names the folder to walk. One probe reports the walk time and the
snapshot time and the frame time. The other runs a duplicate search twice and
reports the cold time against the warm time. Use them before and after any
change to the tree or the layout or the cache.

## The cache during a test run

A test run never writes to the real cache. `store::path()` sends it to a file
named after the process when `cfg!(test)` holds. `SPACEMONGOR_DB` overrides the
location either way.

## The release profile

Set in `Cargo.toml`.

| Setting | Why |
| --- | --- |
| `opt-level = 3` | The walk and the layout are the whole cost |
| `lto = true` | Whole program inlining across the crate boundary |
| `codegen-units = 1` | Lets the optimiser see everything |
| `strip = true` | Drops the symbols nobody reads |

## Before calling any change done

```
cargo fmt
cargo test
cargo clippy --all-targets
cargo-zigbuild clippy --target x86_64-pc-windows-gnu --all-targets
cargo zigbuild --release --target x86_64-pc-windows-gnu
python3 tools/peinfo.py target/x86_64-pc-windows-gnu/release/spacemongor.exe
```
