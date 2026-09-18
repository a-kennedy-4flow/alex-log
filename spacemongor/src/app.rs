//! The window. Picks a filesystem then draws the treemap the walk is filling in.

use crate::browse;
use crate::cats::{self, Cat};
use crate::consolidate;
use crate::dupes;
use crate::fmt;
use crate::gap;
use crate::gather;
use crate::scan::{self, Shared, Want};
use crate::store;
use crate::sys::{self, Volume};
use crate::tree::ViewNode;
use crate::treemap;
use eframe::egui::{
    self, Align2, Color32, CornerRadius, FontId, Rect, Sense, Stroke, StrokeKind, Ui, pos2, vec2,
};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::Ordering::Relaxed;
use std::time::Duration;

/// A box on screen and what it stands for.
struct Hit {
    rect: Rect,
    name: String,
    path: PathBuf,
    size: u64,
    cat: Cat,
    dir: Option<u32>,
    extra: u32,
}

/// The box the right hand menu is acting on. Held apart from `boxes` because
/// those are thrown away and rebuilt on every frame.
#[derive(Clone)]
struct Target {
    path: PathBuf,
    size: u64,
    cat: Cat,
    dir: Option<u32>,
    /// False for the gap box and for the box that lumps small items. Neither
    /// names a path so neither can be acted on.
    real: bool,
}

impl From<&Hit> for Target {
    fn from(h: &Hit) -> Self {
        Target {
            path: h.path.clone(),
            size: h.size,
            cat: h.cat,
            dir: h.dir,
            real: h.extra == 0 && h.cat != Cat::Pending,
        }
    }
}

pub struct App {
    volumes: Vec<Volume>,
    selected: usize,
    depth: u8,
    scan: Option<Arc<Shared>>,
    /// Occupied bytes the kernel reports for the filesystem being scanned. The
    /// outer box is sized to this from the first frame so the picture fills in
    /// rather than resizing under the reader.
    target: u64,
    highlight: Option<Cat>,
    boxes: Vec<Hit>,
    menu: Option<Target>,
    /// The two folders held for comparison. They are plain paths so a mark
    /// survives switching to the other disk.
    first: Option<PathBuf>,
    second: Option<PathBuf>,
    compare: Option<Arc<dupes::Job>>,
    asking: Option<Arc<gap::Ask>>,
    /// What fills the window.
    view: View,
    filter: String,
    /// Duplicates gathered under the folder on side B that holds them. Built
    /// once for a report rather than on every frame. The number is the report
    /// the grouping was built from.
    groups: Option<(usize, Vec<Folder>)>,
    /// Folders and files the cache holds. Read once when a report lands rather
    /// than on every frame.
    held: Option<(u64, u64)>,
    /// Pages in the cache file nothing is using.
    slack: Option<u64>,
    meter: Meter,
    /// Which file type groups to gather and where to put them.
    chosen: std::collections::HashSet<Cat>,
    destination: String,
    /// What each group of the copies holds. Worked out once when the gather
    /// view opens.
    by_cat: Vec<(Cat, u64, u64)>,
    plan: Option<gather::Plan>,
    gathering: Option<Arc<gather::Job>>,
    /// Ticked before anything is taken away. Cleared the moment it is used.
    sure: bool,
    /// Set while the picker is being used to name somewhere rather than to look
    /// at something.
    picking: bool,
    /// Where the picker came from so it can go back there.
    picking_back: View,
    /// How many parts of a path survive the flattening.
    levels: usize,
    working: Option<Arc<consolidate::Working>>,
    across: Option<Arc<consolidate::Plan>>,
    /// Groups already acted on. Marked so a long list can be worked through
    /// without losing the place.
    settled: std::collections::HashSet<Cat>,
    /// Groups a search looks at. Empty means everything.
    only: std::collections::HashSet<Cat>,
    /// An entry waiting to be sent to the recycle bin and what it holds. A
    /// single click is not enough to take something away.
    confirm: Option<(PathBuf, u64)>,
    /// What happened to the last thing sent there.
    said: Option<String>,
    /// The folder the picker is standing in and what is directly below it.
    at: PathBuf,
    at_text: String,
    here: Vec<PathBuf>,
    measure: Option<Arc<browse::Measure>>,
    /// What the recycle bin is holding. Read when the view opens rather than on
    /// every frame.
    gone: Vec<sys::Gone>,
}

/// What the middle of the window is showing.
#[derive(PartialEq, Eq, Clone, Copy, Debug)]
enum View {
    Map,
    Duplicates,
    Gap,
    Diagnostics,
    Gather,
    Browse,
    Recycled,
    Consolidate,
}

/// Rates worked out from two readings a moment apart. A counter on its own
/// says how much has happened. Two say how fast it is happening.
#[derive(Default)]
struct Meter {
    taken: Option<std::time::Instant>,
    bytes: u64,
    files: u64,
    ticks: u64,
    /// Bytes a second.
    speed: f64,
    /// Files a second.
    rate: f64,
    /// Share of the last moment the drive had work in flight.
    busy: Option<f32>,
}

impl Meter {
    /// Takes a reading. Readings closer together than this say more about the
    /// clock than about the work.
    fn sample(&mut self, now: std::time::Instant, bytes: u64, files: u64, ticks: Option<u64>) {
        let Some(before) = self.taken else {
            self.taken = Some(now);
            self.bytes = bytes;
            self.files = files;
            self.ticks = ticks.unwrap_or(0);
            return;
        };
        let over = now.duration_since(before).as_secs_f64();
        if over < 0.4 {
            return;
        }
        self.speed = bytes.saturating_sub(self.bytes) as f64 / over;
        self.rate = files.saturating_sub(self.files) as f64 / over;
        if let Some(ticks) = ticks {
            let moving = ticks.saturating_sub(self.ticks) as f64;
            self.busy = Some((moving / (over * 1000.0)).clamp(0.0, 1.0) as f32);
            self.ticks = ticks;
        }
        self.taken = Some(now);
        self.bytes = bytes;
        self.files = files;
    }
}

/// One folder on side B and the duplicates it holds.
struct Folder {
    path: PathBuf,
    bytes: u64,
    /// Places in the report rather than copies of it.
    pairs: Vec<usize>,
}

impl App {
    pub fn new() -> Self {
        App {
            volumes: sys::volumes(),
            selected: 0,
            depth: 3,
            scan: None,
            target: 0,
            highlight: None,
            boxes: Vec::new(),
            menu: None,
            first: None,
            second: None,
            compare: None,
            asking: None,
            view: View::Map,
            filter: String::new(),
            groups: None,
            held: None,
            slack: None,
            meter: Meter::default(),
            chosen: std::collections::HashSet::new(),
            destination: String::new(),
            by_cat: Vec::new(),
            plan: None,
            gathering: None,
            sure: false,
            picking: false,
            picking_back: View::Gather,
            levels: 3,
            working: None,
            across: None,
            settled: std::collections::HashSet::new(),
            only: std::collections::HashSet::new(),
            confirm: None,
            said: None,
            at: PathBuf::new(),
            at_text: String::new(),
            here: Vec::new(),
            measure: None,
            gone: Vec::new(),
        }
    }

    fn start(&mut self, ctx: &egui::Context) {
        if let Some(old) = self.scan.take() {
            old.stop();
        }
        // The occupied figure ages the moment it is read. Read it again so the
        // outer box stands for what the filesystem holds now rather than for
        // what it held when the window opened.
        let chosen = self.volumes.get(self.selected).map(|v| v.path.clone());
        self.volumes = sys::volumes();
        self.selected = chosen
            .and_then(|p| self.volumes.iter().position(|v| v.path == p))
            .unwrap_or(0);

        let Some(v) = self.volumes.get(self.selected) else {
            return;
        };
        self.target = v.used;
        self.highlight = None;
        self.boxes.clear();
        self.scan = Some(scan::start(v.path.clone(), self.depth, ctx.clone()));
    }

    fn ask(&self, root: u32) {
        if let Some(sh) = &self.scan {
            sh.ask(Want {
                root,
                depth: self.depth,
            });
        }
    }

    fn bar(&mut self, ui: &mut Ui) {
        let ctx = ui.ctx().clone();
        ui.horizontal(|ui| {
            let current = self
                .volumes
                .get(self.selected)
                .map(Volume::label)
                .unwrap_or_else(|| "no filesystem found".to_string());
            let mut pick = self.selected;
            egui::ComboBox::from_id_salt("disk")
                .selected_text(current)
                .width(420.0)
                .show_ui(ui, |ui| {
                    for (i, v) in self.volumes.iter().enumerate() {
                        ui.selectable_value(&mut pick, i, v.label());
                    }
                });
            if pick != self.selected {
                self.selected = pick;
                self.start(&ctx);
            }
            if ui
                .button("Reload")
                .on_hover_text("Walks the whole filesystem again")
                .clicked()
            {
                self.start(&ctx);
            }
            let here = self
                .scan
                .as_ref()
                .and_then(|s| s.snapshot())
                .map(|s| s.path.clone());
            if ui
                .add_enabled(here.is_some(), egui::Button::new("Reload this folder"))
                .on_hover_text("Walks only the folder shown. Moves up if it has gone")
                .clicked()
                && let Some(here) = here
            {
                self.reload_at(&here, &ctx);
            }
            // What a search looks at. Named here rather than in the search
            // because a search can be started from the map menu without ever
            // coming past a view.
            let looking = match self.only.len() {
                0 => "everything".to_string(),
                1 => self
                    .only
                    .iter()
                    .next()
                    .map(|c| c.label().to_lowercase())
                    .unwrap_or_default(),
                n => format!("{n} groups"),
            };
            egui::ComboBox::from_id_salt("only")
                .selected_text(format!("Searching {looking}"))
                .width(190.0)
                .show_ui(ui, |ui| {
                    if ui.button("Everything").clicked() {
                        self.only.clear();
                    }
                    if ui.button("Pictures").clicked() {
                        self.only = [Cat::Image].into_iter().collect();
                    }
                    if ui.button("Music").clicked() {
                        self.only = [Cat::Audio].into_iter().collect();
                    }
                    if ui.button("Pictures and music").clicked() {
                        self.only = [Cat::Image, Cat::Audio].into_iter().collect();
                    }
                    ui.separator();
                    for cat in cats::LEGEND {
                        let mut on = self.only.contains(&cat);
                        if ui.checkbox(&mut on, cat.label()).changed() {
                            if on {
                                self.only.insert(cat);
                            } else {
                                self.only.remove(&cat);
                            }
                        }
                    }
                    ui.separator();
                    ui.label(
                        egui::RichText::new(
                            "Nothing ticked looks at everything. A narrower search \
                             reads far less.",
                        )
                        .small()
                        .weak(),
                    );
                });
            if ui
                .selectable_label(self.view == View::Browse, "Browse")
                .clicked()
            {
                if self.view == View::Browse {
                    self.view = View::Map;
                } else {
                    if self.at.as_os_str().is_empty() {
                        let start = self
                            .volumes
                            .get(self.selected)
                            .map(|v| v.path.clone())
                            .unwrap_or_else(|| PathBuf::from("/"));
                        self.go_to(start);
                    }
                    self.view = View::Browse;
                }
            }
            if ui
                .selectable_label(self.view == View::Recycled, "Recycle bin")
                .clicked()
            {
                self.view = if self.view == View::Recycled {
                    View::Map
                } else {
                    self.read_recycled();
                    View::Recycled
                };
            }
            if ui
                .selectable_label(self.view == View::Diagnostics, "Diagnostics")
                .clicked()
            {
                self.view = if self.view == View::Diagnostics {
                    View::Map
                } else {
                    self.held = store::Store::open().map(|held| held.counts());
                    self.slack = store::Store::open().map(|held| held.slack());
                    View::Diagnostics
                };
            }
            ui.separator();
            let mut depth = self.depth as i32;
            if ui
                .add(egui::Slider::new(&mut depth, 1..=10).text("nesting"))
                .changed()
            {
                self.depth = depth as u8;
                let root = self
                    .scan
                    .as_ref()
                    .and_then(|s| s.snapshot())
                    .and_then(|s| s.root.dir)
                    .unwrap_or(0);
                self.ask(root);
            }
        });

        ui.horizontal(|ui| {
            let snap = self.scan.as_ref().and_then(|s| s.snapshot());
            let up = snap.as_ref().and_then(|s| s.parent);
            if ui
                .add_enabled(up.is_some(), egui::Button::new("Up"))
                .clicked()
                && let Some(p) = up
            {
                self.ask(p);
            }
            if let Some(s) = &snap {
                ui.label(egui::RichText::new(s.path.display().to_string()).monospace());
            }
        });

        if self.first.is_some() || self.second.is_some() {
            ui.horizontal(|ui| {
                ui.label("Compare");
                ui.label(egui::RichText::new(held(&self.first)).monospace().small());
                ui.label("against");
                ui.label(egui::RichText::new(held(&self.second)).monospace().small());
                let ready = self.first.is_some() && self.second.is_some();
                if ui
                    .add_enabled(ready, egui::Button::new("Find duplicates"))
                    .clicked()
                {
                    self.start_compare(&ctx);
                }
                if ui.button("Forget").clicked() {
                    self.first = None;
                    self.second = None;
                }
                if self.compare.is_some()
                    && self.view != View::Duplicates
                    && ui.button("Show the duplicates").clicked()
                {
                    self.view = View::Duplicates;
                }
            });
        }
    }

    fn read_recycled(&mut self) {
        let where_ = self
            .volumes
            .get(self.selected)
            .map(|v| v.path.clone())
            .unwrap_or_else(|| PathBuf::from("/"));
        self.gone = sys::recycled(&where_);
    }

    /// What the recycle bin is holding and where each thing came from.
    fn recycled_ui(&mut self, ui: &mut Ui) {
        let where_ = self
            .volumes
            .get(self.selected)
            .map(|v| v.path.clone())
            .unwrap_or_else(|| PathBuf::from("/"));

        ui.horizontal(|ui| {
            if ui.button("Back to the map").clicked() {
                self.view = View::Map;
            }
            ui.separator();
            ui.heading("The recycle bin");
            if ui.button("Read it again").clicked() {
                self.read_recycled();
            }
        });
        let bin = sys::bin_for(&where_);
        ui.label(
            egui::RichText::new(match &bin {
                Some(bin) => format!("for {}  ·  {}", where_.display(), bin.display()),
                None => format!("for {}  ·  not known", where_.display()),
            })
            .monospace()
            .small()
            .weak(),
        );
        if let Some(bin) = bin
            && ui.button("Open it in the file manager").clicked()
        {
            sys::open_folder(&bin);
        }
        ui.separator();

        if self.gone.is_empty() {
            ui.label("Nothing from this disk is in it.");
            ui.label(
                egui::RichText::new(
                    "It may still hold things from another account. Only what this \
                     account put there can be read.",
                )
                .small()
                .weak(),
            );
            return;
        }

        let held: u64 = self.gone.iter().map(|g| g.size).sum();
        ui.horizontal(|ui| {
            ui.heading(fmt::bytes(held));
            ui.label(format!(
                "across {} entries",
                fmt::count(self.gone.len() as u64)
            ));
        });
        ui.label(
            egui::RichText::new(
                "Anything emptied out of here is gone as far as this tool can see. \
                 Getting it back after that means reading the disk itself and that is \
                 a different job.",
            )
            .small()
            .weak(),
        );
        ui.separator();

        let row = ui.text_style_height(&egui::TextStyle::Body) + 4.0;
        let gone = &self.gone;
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show_rows(ui, row, gone.len(), |ui, range| {
                for entry in &gone[range] {
                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new(fmt::bytes(entry.size))
                                .monospace()
                                .strong(),
                        );
                        ui.label(egui::RichText::new(&entry.when).monospace().small().weak());
                        if !entry.now.as_os_str().is_empty()
                            && ui
                                .small_button("show")
                                .on_hover_text(entry.now.display().to_string())
                                .clicked()
                        {
                            sys::reveal(&entry.now);
                        }
                        ui.label(
                            egui::RichText::new(entry.was.display().to_string())
                                .monospace()
                                .small(),
                        );
                    });
                }
            });
    }

    /// Stands between one click and something being taken away.
    ///
    /// Drawn above whatever else is showing. Because a) the menu it was asked
    /// from has already closed by then and b) a strip inside one view would be
    /// missed by anyone looking at another.
    fn confirm_bar(&mut self, ui: &mut Ui) {
        if let Some(said) = self.said.clone() {
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new(said).small());
                if ui.small_button("Reload this folder").clicked() {
                    let ctx = ui.ctx().clone();
                    let here = self
                        .scan
                        .as_ref()
                        .and_then(|s| s.snapshot())
                        .map(|s| s.path.clone());
                    if let Some(here) = here {
                        self.reload_at(&here, &ctx);
                    }
                    self.said = None;
                }
                if ui.small_button("Dismiss").clicked() {
                    self.said = None;
                }
            });
        }

        let Some((path, size)) = self.confirm.clone() else {
            return;
        };
        ui.horizontal(|ui| {
            ui.label(
                egui::RichText::new("Send to the recycle bin?")
                    .strong()
                    .color(Cat::System.colour()),
            );
            ui.label(egui::RichText::new(path.display().to_string()).monospace());
            ui.label(egui::RichText::new(fmt::bytes(size)).monospace().weak());
            if ui.button("Yes, send it").clicked() {
                self.said = Some(match sys::trash(&path) {
                    Ok(landed) => format!(
                        "{} went to {}. The map still shows it until it is walked again.",
                        path.display(),
                        landed.display()
                    ),
                    Err(why) => format!("{} did not go: {why}", path.display()),
                });
                self.confirm = None;
            }
            if ui.button("Cancel").clicked() {
                self.confirm = None;
            }
        });
        let mut says = "A folder goes with everything under it.".to_string();
        match sys::bin_for(&path) {
            Some(bin) => says.push_str(&format!(" It goes to {}.", bin.display())),
            None => says.push_str(" Where it goes could not be worked out."),
        }
        ui.label(egui::RichText::new(says).small().weak());
    }

    /// The menu the right hand button opens over a box.
    fn menu_ui(&mut self, ui: &mut Ui, target: &Target) {
        ui.label(
            egui::RichText::new(target.path.display().to_string())
                .monospace()
                .small()
                .weak(),
        );
        ui.label(format!(
            "{}  ·  {}",
            fmt::bytes(target.size),
            target.cat.label()
        ));
        ui.separator();

        if let Some(dir) = target.dir
            && ui.button("Draw this folder").clicked()
        {
            self.ask(dir);
            ui.close();
        }
        if target.dir.is_some() && ui.button("Reload this folder").clicked() {
            let ctx = ui.ctx().clone();
            self.reload_at(&target.path.clone(), &ctx);
            ui.close();
        }
        if target.dir.is_some() && ui.button("Open this folder").clicked() {
            sys::open_folder(&target.path);
            ui.close();
        }
        if ui.button("Open containing folder").clicked() {
            sys::reveal(&target.path);
            ui.close();
        }
        if ui.button("Copy path").clicked() {
            ui.ctx().copy_text(target.path.display().to_string());
            ui.close();
        }
        if ui.button("Highlight this file type").clicked() {
            self.highlight = Some(target.cat);
            ui.close();
        }
        ui.separator();
        if ui
            .button(egui::RichText::new("Send to the recycle bin").color(Cat::System.colour()))
            .clicked()
        {
            self.confirm = Some((target.path.clone(), target.size));
            ui.close();
        }

        if target.dir.is_some() {
            ui.separator();
            if ui.button("Scan this folder for duplicates").clicked() {
                let ctx = ui.ctx().clone();
                self.start_alone(target.path.clone(), &ctx);
                ui.close();
            }
            if ui.button("Compare as the first folder").clicked() {
                self.first = Some(target.path.clone());
                ui.close();
            }
            if ui.button("Compare as the second folder").clicked() {
                self.second = Some(target.path.clone());
                ui.close();
            }
        }
    }

    /// Which groups a search should look at. `None` looks at everything.
    fn looking(&self) -> Option<std::collections::HashSet<Cat>> {
        (!self.only.is_empty()).then(|| self.only.clone())
    }

    fn start_compare(&mut self, ctx: &egui::Context) {
        if let Some(old) = self.compare.take() {
            old.stop();
        }
        let (Some(a), Some(b)) = (self.first.clone(), self.second.clone()) else {
            return;
        };
        self.groups = None;
        self.filter.clear();
        self.view = View::Duplicates;
        self.compare = Some(dupes::start(a, Some(b), self.looking(), ctx.clone()));
    }

    /// Searches one folder on its own rather than setting two against each
    /// other.
    fn start_alone(&mut self, root: PathBuf, ctx: &egui::Context) {
        if let Some(old) = self.compare.take() {
            old.stop();
        }
        self.groups = None;
        self.filter.clear();
        self.view = View::Duplicates;
        self.compare = Some(dupes::start(root, None, self.looking(), ctx.clone()));
    }

    /// Everything worth telling someone who is reporting a fault.
    fn diagnostics_ui(&mut self, ui: &mut Ui) {
        let where_ = self
            .volumes
            .get(self.selected)
            .map(|v| v.path.clone())
            .unwrap_or_else(|| PathBuf::from("/"));
        let drive = sys::drive(&where_);

        // Whichever job is running is the one worth metering.
        let (bytes, files, running) = match (&self.compare, &self.scan) {
            (Some(job), _) if !job.done.load(Relaxed) => (
                job.bytes_read.load(Relaxed),
                job.read.load(Relaxed),
                "duplicate search",
            ),
            (_, Some(sh)) if !sh.done.load(Relaxed) => {
                (sh.bytes.load(Relaxed), sh.files.load(Relaxed), "disk walk")
            }
            _ => (0, 0, "nothing"),
        };
        self.meter.sample(
            std::time::Instant::now(),
            bytes,
            files,
            sys::io_busy(&where_),
        );

        ui.horizontal(|ui| {
            if ui.button("Back to the map").clicked() {
                self.view = View::Map;
            }
            ui.separator();
            ui.heading("Diagnostics");
        });
        ui.separator();

        ui.label(egui::RichText::new("The cache").strong());
        ui.label(
            egui::RichText::new(store::path().display().to_string())
                .monospace()
                .small(),
        );
        let on_disk = cache_bytes();
        let counts = self.held.unwrap_or((0, 0));
        ui.label(
            egui::RichText::new(format!(
                "{} on disk  ·  {} files across {} folders",
                fmt::bytes(on_disk),
                fmt::count(counts.1),
                fmt::count(counts.0)
            ))
            .small()
            .weak(),
        );
        ui.horizontal(|ui| {
            if ui.button("Copy the path").clicked() {
                ui.ctx().copy_text(store::path().display().to_string());
            }
            if ui.button("Open containing folder").clicked() {
                sys::reveal(&store::path());
            }
            if ui.button("Read it again").clicked() {
                self.held = store::Store::open().map(|held| held.counts());
                self.slack = store::Store::open().map(|held| held.slack());
            }
            if ui
                .button("Tidy it")
                .on_hover_text("Squeezes the file back down. Nothing held is lost")
                .clicked()
                && let Some(mut held) = store::Store::open()
            {
                held.tidy();
                self.held = Some(held.counts());
                self.slack = Some(held.slack());
            }
        });
        if let Some(slack) = self.slack
            && slack > 0
        {
            ui.label(
                egui::RichText::new(format!(
                    "{} of that file is pages nothing is using",
                    fmt::bytes(slack)
                ))
                .small()
                .weak(),
            );
        }
        ui.separator();

        ui.label(egui::RichText::new("The recycle bin").strong());
        ui.label(
            egui::RichText::new(match sys::bin_for(&where_) {
                Some(bin) => format!("anything taken from here goes to {}", bin.display()),
                None => "where anything taken from here would go is not known".to_string(),
            })
            .monospace()
            .small()
            .weak(),
        );
        ui.label(
            egui::RichText::new(
                "Every drive keeps its own. A drive with none of its own deletes outright \
                 instead and the host asks before it does.",
            )
            .small()
            .weak(),
        );
        ui.separator();

        ui.label(egui::RichText::new("The drive").strong());
        let mut lines = vec![
            format!("{} under {}", drive.label(), where_.display()),
            format!("{} reader threads", drive.readers()),
            format!(
                "{} taken from each side when two files are compared",
                fmt::bytes(drive.compare_chunk() as u64)
            ),
        ];
        if let Some(cluster) = sys::cluster_size(&where_) {
            lines.push(format!("{} to a cluster", fmt::bytes(cluster)));
        }
        for line in &lines {
            ui.label(egui::RichText::new(line).small().weak());
        }
        ui.separator();

        ui.label(egui::RichText::new("Now").strong());
        ui.label(format!("running: {running}"));
        ui.label(format!(
            "{} a second  ·  {} files a second  ·  {} read so far",
            fmt::bytes(self.meter.speed as u64),
            fmt::count(self.meter.rate as u64),
            fmt::count(files)
        ));
        match self.meter.busy {
            Some(busy) => {
                ui.add(
                    egui::ProgressBar::new(busy)
                        .desired_height(6.0)
                        .fill(Color32::from_rgb(0x39, 0x87, 0xe5)),
                );
                ui.label(
                    egui::RichText::new(format!(
                        "the drive had work in flight {:.0}% of the last moment",
                        busy * 100.0
                    ))
                    .small()
                    .weak(),
                );
            }
            None => {
                ui.label(
                    egui::RichText::new("this host does not publish how busy the drive is")
                        .small()
                        .weak(),
                );
            }
        }
        ui.separator();

        if ui.button("Copy a report").clicked() {
            ui.ctx()
                .copy_text(self.report_text(&where_, drive, running, files, on_disk, counts));
        }
        ui.label(
            egui::RichText::new(
                "The report holds everything on this page as text. Send the cache file \
                 beside it when something looks wrong.",
            )
            .small()
            .weak(),
        );

        ui.ctx().request_repaint_after(Duration::from_millis(400));
    }

    fn report_text(
        &self,
        where_: &Path,
        drive: sys::Drive,
        running: &str,
        files: u64,
        on_disk: u64,
        counts: (u64, u64),
    ) -> String {
        let mut out = String::new();
        out.push_str(&format!("spacemongor {}\n", env!("CARGO_PKG_VERSION")));
        out.push_str(&format!("built for {}\n", std::env::consts::OS));
        out.push_str(&format!("volume       {}\n", where_.display()));
        out.push_str(&format!("drive        {}\n", drive.label()));
        out.push_str(&format!("readers      {}\n", drive.readers()));
        out.push_str(&format!("cache        {}\n", store::path().display()));
        out.push_str(&format!(
            "cache holds  {} files across {} folders in {}\n",
            fmt::count(counts.1),
            fmt::count(counts.0),
            fmt::bytes(on_disk)
        ));
        out.push_str(&format!("running      {running}\n"));
        out.push_str(&format!(
            "speed        {} a second over {} files a second\n",
            fmt::bytes(self.meter.speed as u64),
            fmt::count(self.meter.rate as u64)
        ));
        out.push_str(&format!("read so far  {}\n", fmt::count(files)));
        match self.meter.busy {
            Some(busy) => out.push_str(&format!("drive busy   {:.0}%\n", busy * 100.0)),
            None => out.push_str("drive busy   not published by this host\n"),
        }
        if let Some(sh) = &self.scan {
            out.push_str(&format!(
                "walk         {} in {} files and {} folders with {} unreadable\n",
                fmt::bytes(sh.bytes.load(Relaxed)),
                fmt::count(sh.files.load(Relaxed)),
                fmt::count(sh.dirs.load(Relaxed)),
                fmt::count(sh.denied.load(Relaxed))
            ));
        }
        out
    }

    /// Stands the picker in a folder and lists what is directly below it.
    fn go_to(&mut self, at: PathBuf) {
        self.at_text = at.display().to_string();
        self.here = browse::children(&at);
        self.at = at;
        if let Some(old) = self.measure.take() {
            old.stop();
        }
    }

    /// Walks one folder rather than a whole filesystem.
    ///
    /// A folder that has gone is not an error. The walk moves up the tree until
    /// it reaches one that is really there. Because a) a folder named from a
    /// snapshot may have been taken away since b) the parent is what the reader
    /// wanted to look at anyway and c) refusing would leave them with nothing.
    ///
    /// The occupied figure is kept only when the folder is a whole filesystem.
    /// Anywhere else there is no unaccounted space to explain.
    fn reload_at(&mut self, asked: &Path, ctx: &egui::Context) -> Option<PathBuf> {
        let at = sys::first_real(asked)?;
        if let Some(old) = self.scan.take() {
            old.stop();
        }
        self.target = self
            .volumes
            .iter()
            .find(|v| v.path == at)
            .map(|v| v.used)
            .unwrap_or(0);
        self.highlight = None;
        self.boxes.clear();
        self.scan = Some(scan::start(at.clone(), self.depth, ctx.clone()));
        self.view = View::Map;
        Some(at)
    }

    /// Going to a folder and reading it on its own.
    fn browse_ui(&mut self, ui: &mut Ui) {
        let ctx = ui.ctx().clone();
        ui.horizontal(|ui| {
            if ui.button("Back to the map").clicked() {
                self.picking = false;
                self.view = View::Map;
            }
            ui.separator();
            ui.heading("Browse");
        });
        if self.picking {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("Choosing where the copies go")
                        .strong()
                        .color(Cat::Code.colour()),
                );
                if ui.button("Use this folder").clicked() {
                    self.destination = self.at.display().to_string();
                    self.plan = None;
                    self.across = None;
                    self.picking = false;
                    self.view = self.picking_back;
                }
                if ui.button("Cancel").clicked() {
                    self.picking = false;
                    self.view = self.picking_back;
                }
            });
            ui.label(
                egui::RichText::new(
                    "Walk to the folder you want and press Use this folder. Nothing is \
                     written by choosing.",
                )
                .small()
                .weak(),
            );
            ui.separator();
        }

        ui.horizontal(|ui| {
            let typed = ui.add(
                egui::TextEdit::singleline(&mut self.at_text)
                    .hint_text("a folder")
                    .desired_width(620.0),
            );
            let go = ui.button("Go").clicked()
                || (typed.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)));
            if go {
                let asked = PathBuf::from(self.at_text.trim());
                if asked.is_dir() {
                    self.go_to(asked);
                }
            }
            let up = self.at.parent().map(Path::to_path_buf);
            if ui
                .add_enabled(up.is_some(), egui::Button::new("Up"))
                .clicked()
                && let Some(up) = up
            {
                self.go_to(up);
            }
        });

        ui.horizontal_wrapped(|ui| {
            ui.label(egui::RichText::new("Jump to").small().weak());
            let roots: Vec<PathBuf> = self.volumes.iter().map(|v| v.path.clone()).collect();
            for root in roots {
                if ui.small_button(root.display().to_string()).clicked() {
                    self.go_to(root);
                }
            }
        });
        ui.separator();

        let facts = self.measure.as_ref().and_then(|m| m.facts());
        egui::Panel::left("here")
            .default_size(360.0)
            .size_range(200.0..=700.0)
            .show(ui, |ui| {
                ui.label(egui::RichText::new("Folders here").strong());
                if self.here.is_empty() {
                    ui.label(egui::RichText::new("nothing below this one").small().weak());
                }
                let row = ui.text_style_height(&egui::TextStyle::Body) + 6.0;
                let here = self.here.clone();
                let mut into = None;
                egui::ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .show_rows(ui, row, here.len(), |ui, range| {
                        for folder in &here[range] {
                            let name = folder
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .into_owned();
                            if ui.selectable_label(false, name).clicked() {
                                into = Some(folder.clone());
                            }
                        }
                    });
                if let Some(into) = into {
                    self.go_to(into);
                }
            });

        ui.label(
            egui::RichText::new(self.at.display().to_string())
                .monospace()
                .small()
                .weak(),
        );

        match (&self.measure, &facts) {
            (Some(running), None) => {
                ui.label("measuring");
                ui.label(format!(
                    "{} files  ·  {}",
                    fmt::count(running.files.load(Relaxed)),
                    fmt::bytes(running.bytes.load(Relaxed))
                ));
                ui.label(
                    egui::RichText::new(running.current())
                        .monospace()
                        .small()
                        .weak(),
                );
                if ui.button("Stop").clicked() {
                    running.stop();
                }
                ui.ctx().request_repaint_after(Duration::from_millis(200));
            }
            _ => {
                if ui.button("Measure this folder").clicked() {
                    let at = self.at.clone();
                    self.measure = Some(browse::start(at, ctx.clone()));
                }
            }
        }

        if let Some(facts) = facts {
            ui.separator();
            ui.horizontal(|ui| {
                ui.heading(fmt::bytes(facts.bytes));
                ui.label(format!(
                    "{} files in {} folders",
                    fmt::count(facts.files),
                    fmt::count(facts.folders)
                ));
            });
            if facts.denied > 0 {
                ui.label(
                    egui::RichText::new(format!(
                        "{} folders could not be opened so this reads short",
                        fmt::count(facts.denied)
                    ))
                    .small()
                    .weak(),
                );
            }

            ui.horizontal_wrapped(|ui| {
                for (cat, count, bytes) in &facts.by_cat {
                    let (chip, _) = ui.allocate_exact_size(vec2(10.0, 10.0), Sense::hover());
                    ui.painter()
                        .rect_filled(chip, CornerRadius::same(2), cat.colour());
                    ui.label(
                        egui::RichText::new(format!(
                            "{} {} ({})",
                            cat.label(),
                            fmt::bytes(*bytes),
                            fmt::count(*count)
                        ))
                        .small(),
                    );
                }
            });
            ui.separator();

            ui.horizontal(|ui| {
                if ui.button("Draw it in the map").clicked() {
                    let at = facts.root.clone();
                    self.reload_at(&at, &ctx);
                }
                if ui.button("Scan it for duplicates").clicked() {
                    let at = facts.root.clone();
                    self.start_alone(at, &ctx);
                }
                if ui.button("Hold as the first folder").clicked() {
                    self.first = Some(facts.root.clone());
                }
                if ui.button("Hold as the second folder").clicked() {
                    self.second = Some(facts.root.clone());
                }
                if ui.button("Open in the file manager").clicked() {
                    sys::open_folder(&facts.root);
                }
                ui.separator();
                if ui
                    .button(
                        egui::RichText::new("Send it to the recycle bin")
                            .color(Cat::System.colour()),
                    )
                    .clicked()
                {
                    self.confirm = Some((facts.root.clone(), facts.bytes));
                }
            });
            ui.separator();

            ui.label(egui::RichText::new("The largest files").strong());
            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for (path, size) in &facts.biggest {
                        ui.horizontal(|ui| {
                            ui.label(egui::RichText::new(fmt::bytes(*size)).monospace().strong());
                            if ui.small_button("show").clicked() {
                                sys::reveal(path);
                            }
                            ui.label(
                                egui::RichText::new(under_root(path, &facts.root))
                                    .monospace()
                                    .small(),
                            );
                        });
                    }
                });
        }
    }

    /// Bringing one copy of everything into a new folder.
    fn consolidate_ui(&mut self, ui: &mut Ui) {
        let Some(job) = self.compare.clone() else {
            return;
        };
        let Some(report) = job.report() else {
            return;
        };
        let ctx = ui.ctx().clone();

        ui.horizontal(|ui| {
            if ui.button("Back to the duplicates").clicked() {
                self.view = View::Duplicates;
            }
            ui.separator();
            ui.heading("Bring one of each across");
        });
        ui.label(
            egui::RichText::new(
                "Lays one copy of every file under a new folder. A file held in five \
                 places arrives once. Nothing under the old folder is touched and a \
                 list of what can then go is written at the end.",
            )
            .small()
            .weak(),
        );
        ui.separator();

        ui.horizontal(|ui| {
            ui.label("Where it goes");
            if ui
                .add(
                    egui::TextEdit::singleline(&mut self.destination)
                        .hint_text("a folder that already exists")
                        .desired_width(420.0),
                )
                .changed()
            {
                self.across = None;
            }
            if ui.button("Choose a folder").clicked() {
                self.picking = true;
                self.picking_back = View::Consolidate;
                if self.at.as_os_str().is_empty() {
                    self.go_to(job.base().to_path_buf());
                }
                self.view = View::Browse;
            }
        });
        ui.horizontal(|ui| {
            let mut levels = self.levels as i32;
            if ui
                .add(egui::Slider::new(&mut levels, 1..=5).text("parts of the path kept"))
                .changed()
            {
                self.levels = levels as usize;
                self.across = None;
            }
            ui.label(
                egui::RichText::new(match self.levels {
                    1 => "everything lands in one folder",
                    2 => "the folder it sat in then the file",
                    _ => "the folder it came from then the folder it sat in then the file",
                })
                .small()
                .weak(),
            );
        });

        if let Some(working) = self.working.clone() {
            if !working.done.load(Relaxed) {
                ui.label("listing the folder");
                ui.label(format!(
                    "{} files so far",
                    fmt::count(working.found.load(Relaxed))
                ));
                ui.ctx().request_repaint_after(Duration::from_millis(200));
                return;
            }
            if self.across.is_none() {
                self.across = working.plan();
                self.working = None;
            }
        }

        let ready = !self.destination.trim().is_empty();
        if ui
            .add_enabled(ready, egui::Button::new("Work out what would happen"))
            .on_disabled_hover_text("Name a folder above first")
            .clicked()
        {
            self.across = None;
            self.working = Some(consolidate::start(
                job.base().to_path_buf(),
                report.pairs.clone(),
                job.only.clone(),
                PathBuf::from(self.destination.trim()),
                self.levels,
                ctx.clone(),
            ));
        }
        ui.separator();

        if let Some(running) = self.gathering.clone() {
            self.copying_ui(ui, &running);
            if running.done.load(Relaxed)
                && let Some(across) = self.across.clone()
                && ui.button("Write the list of what can go").clicked()
            {
                self.said = Some(match consolidate::write_removals(&across) {
                    Ok((at, named)) => format!(
                        "{} names {} files that can now be removed.",
                        at.display(),
                        fmt::count(named as u64)
                    ),
                    Err(why) => format!("the list could not be written: {why}"),
                });
            }
            return;
        }

        let Some(across) = self.across.clone() else {
            ui.label(
                egui::RichText::new("Nothing is written until you have seen what would happen.")
                    .small()
                    .weak(),
            );
            return;
        };

        ui.horizontal(|ui| {
            ui.heading(fmt::bytes(across.bytes));
            ui.label(format!(
                "across {} files of their own into {}",
                fmt::count(across.items.len() as u64),
                across.destination.display()
            ));
        });
        ui.label(format!(
            "{} comes back once the old ones go  ·  {} files would be listed for removal",
            fmt::bytes(across.frees),
            fmt::count(across.removals as u64)
        ));
        // The slider can be moved after the plan was made so the plan says what
        // it was actually built with.
        if across.levels != self.levels {
            ui.label(
                egui::RichText::new(format!(
                    "this was worked out keeping {} parts of the path. The slider now \
                     says {}. Work it out again to use that.",
                    across.levels, self.levels
                ))
                .small()
                .color(Cat::System.colour()),
            );
        }
        if across.renamed > 0 {
            ui.label(
                egui::RichText::new(format!(
                    "{} had to be renamed because two different files flattened onto one place",
                    fmt::count(across.renamed as u64)
                ))
                .small()
                .weak(),
            );
        }
        match across.free {
            Some(free) => ui.label(
                egui::RichText::new(format!("{} free where it is going", fmt::bytes(free)))
                    .small()
                    .weak(),
            ),
            None => ui.label(
                egui::RichText::new("the free space there could not be read")
                    .small()
                    .weak(),
            ),
        };
        if across.too_big() {
            ui.label(
                egui::RichText::new("This will not fit.")
                    .strong()
                    .color(Cat::System.colour()),
            );
        }

        if ui
            .add_enabled(
                !across.items.is_empty() && !across.too_big(),
                egui::Button::new("Copy them across"),
            )
            .clicked()
        {
            let carry = gather::Plan {
                items: across
                    .items
                    .iter()
                    .map(|i| gather::Item {
                        from: i.from.clone(),
                        to: i.to.clone(),
                        size: i.size,
                        cat: cats::of(&leaf_of(&i.from)),
                        taken: i.to.exists(),
                    })
                    .collect(),
                bytes: across.bytes,
                taken: across.items.iter().filter(|i| i.to.exists()).count(),
                free: across.free,
                destination: across.destination.clone(),
            };
            self.gathering = Some(gather::start(carry, gather::Action::Copy, ctx.clone()));
        }
        ui.separator();

        let row = ui.text_style_height(&egui::TextStyle::Body) + 4.0;
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show_rows(ui, row, across.items.len(), |ui, range| {
                for item in &across.items[range] {
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new(fmt::bytes(item.size)).monospace());
                        ui.label(
                            egui::RichText::new(under_root(&item.to, &across.destination))
                                .monospace()
                                .small(),
                        );
                        if item.same.len() > 1 {
                            ui.label(
                                egui::RichText::new(format!("{} places", item.same.len()))
                                    .small()
                                    .weak(),
                            );
                        }
                    });
                }
            });
    }

    /// Opens the gather view and works out what each group holds.
    fn open_gather(&mut self, report: &Arc<dupes::Report>) {
        let mut totals: std::collections::HashMap<Cat, (u64, u64)> =
            std::collections::HashMap::new();
        for pair in &report.pairs {
            let leaf = pair.b.file_name().unwrap_or_default().to_string_lossy();
            let seen = totals.entry(cats::of(&leaf)).or_insert((0, 0));
            seen.0 += 1;
            seen.1 += pair.size;
        }
        let mut by_cat: Vec<(Cat, u64, u64)> = totals
            .into_iter()
            .map(|(cat, (count, bytes))| (cat, count, bytes))
            .collect();
        by_cat.sort_by_key(|(_, _, bytes)| std::cmp::Reverse(*bytes));
        self.by_cat = by_cat;
        self.plan = None;
        self.view = View::Gather;
    }

    /// Copying the redundant copies to one place. Nothing is moved and nothing
    /// is deleted and nothing is written over.
    fn gather_ui(&mut self, ui: &mut Ui) {
        let Some(job) = self.compare.clone() else {
            return;
        };
        let Some(report) = job.report() else {
            return;
        };

        ui.horizontal(|ui| {
            if ui.button("Back to the duplicates").clicked() {
                self.view = View::Duplicates;
            }
            ui.separator();
            ui.heading("Gather the copies");
        });
        ui.label(
            egui::RichText::new(
                "Only the redundant copy of each pair is ever offered. The file being \
                 kept is never touched. Nothing is moved and nothing is deleted.",
            )
            .small()
            .weak(),
        );
        ui.separator();

        ui.label(egui::RichText::new("Which groups").strong());
        ui.label(
            egui::RichText::new(
                "Only takes just that group so a long list can be worked through one \
                 group at a time. A group already acted on is marked.",
            )
            .small()
            .weak(),
        );

        let groups = self.by_cat.clone();
        let mut only: Option<Cat> = None;
        let mut moved = false;
        egui::Grid::new("groups")
            .num_columns(5)
            .striped(true)
            .spacing([12.0, 3.0])
            .show(ui, |ui| {
                for (cat, count, bytes) in &groups {
                    let (chip, _) = ui.allocate_exact_size(vec2(11.0, 11.0), Sense::hover());
                    ui.painter()
                        .rect_filled(chip, CornerRadius::same(2), cat.colour());

                    let mut on = self.chosen.contains(cat);
                    if ui.checkbox(&mut on, cat.label()).changed() {
                        if on {
                            self.chosen.insert(*cat);
                        } else {
                            self.chosen.remove(cat);
                        }
                        moved = true;
                    }
                    ui.label(
                        egui::RichText::new(format!(
                            "{} · {}",
                            fmt::count(*count),
                            fmt::bytes(*bytes)
                        ))
                        .monospace()
                        .small(),
                    );
                    if ui.small_button("Only").clicked() {
                        only = Some(*cat);
                    }
                    if self.settled.contains(cat) {
                        ui.label(egui::RichText::new("done").small().weak());
                    } else {
                        ui.label("");
                    }
                    ui.end_row();
                }
            });
        if let Some(cat) = only {
            self.chosen.clear();
            self.chosen.insert(cat);
            moved = true;
        }

        ui.horizontal(|ui| {
            if ui.button("All").clicked() {
                self.chosen = groups.iter().map(|(c, _, _)| *c).collect();
                moved = true;
            }
            if ui.button("None").clicked() {
                self.chosen.clear();
                moved = true;
            }
            let next = groups
                .iter()
                .map(|(c, _, _)| *c)
                .find(|c| !self.settled.contains(c));
            if ui
                .add_enabled(next.is_some(), egui::Button::new("Next group to do"))
                .clicked()
                && let Some(next) = next
            {
                self.chosen.clear();
                self.chosen.insert(next);
                moved = true;
            }
            if ui.button("Forget what is done").clicked() {
                self.settled.clear();
            }
        });
        if moved {
            self.plan = None;
        }
        ui.separator();

        ui.label(egui::RichText::new("Where they go").strong());
        ui.horizontal(|ui| {
            if ui
                .add(
                    egui::TextEdit::singleline(&mut self.destination)
                        .hint_text("a folder that already exists")
                        .desired_width(440.0),
                )
                .changed()
            {
                self.plan = None;
            }
            if ui
                .button("Choose a folder")
                .on_hover_text("Opens the picker. It comes back here with what you pick")
                .clicked()
            {
                self.picking = true;
                self.picking_back = View::Gather;
                if self.at.as_os_str().is_empty() {
                    let start = self
                        .volumes
                        .get(self.selected)
                        .map(|v| v.path.clone())
                        .unwrap_or_else(|| PathBuf::from("/"));
                    self.go_to(start);
                }
                self.view = View::Browse;
            }
            // A destination is only needed to copy. Asking for one before
            // anything can be cleared out sent people looking for a folder they
            // were never going to use.
            if ui
                .add_enabled(
                    !self.chosen.is_empty(),
                    egui::Button::new("Work out what would happen"),
                )
                .clicked()
            {
                self.plan = Some(gather::plan(
                    &report.pairs,
                    job.base(),
                    &gather::Choice {
                        cats: self.chosen.clone(),
                        destination: PathBuf::from(self.destination.trim()),
                    },
                ));
            }
        });
        ui.separator();

        if let Some(running) = self.gathering.clone() {
            self.copying_ui(ui, &running);
            return;
        }

        let Some(plan) = &self.plan else {
            ui.label(
                egui::RichText::new("Nothing is written until you have seen what would happen.")
                    .small()
                    .weak(),
            );
            return;
        };

        ui.horizontal(|ui| {
            ui.heading(fmt::bytes(plan.bytes));
            ui.label(format!(
                "across {} files into {}",
                fmt::count(plan.items.len() as u64),
                plan.destination.display()
            ));
        });
        match plan.free {
            Some(free) => ui.label(
                egui::RichText::new(format!("{} free where they are going", fmt::bytes(free)))
                    .small()
                    .weak(),
            ),
            None => ui.label(
                egui::RichText::new("the free space there could not be read")
                    .small()
                    .weak(),
            ),
        };
        if plan.too_big() {
            ui.label(
                egui::RichText::new("This will not fit.")
                    .strong()
                    .color(Cat::System.colour()),
            );
        }
        if plan.taken > 0 {
            ui.label(
                egui::RichText::new(format!(
                    "{} of these places already hold a file. Any holding the same \
                     bytes is left alone and any holding anything else is refused.",
                    fmt::count(plan.taken as u64)
                ))
                .small()
                .weak(),
            );
        }

        let has_where = !self.destination.trim().is_empty();
        let can_copy = !plan.items.is_empty() && !plan.too_big() && has_where;
        let can_clear = !plan.items.is_empty();
        let mut start: Option<gather::Action> = None;
        ui.horizontal(|ui| {
            if ui
                .add_enabled(can_copy, egui::Button::new("Copy them"))
                .on_disabled_hover_text("Name a folder above to copy them into")
                .clicked()
            {
                start = Some(gather::Action::Copy);
            }
            ui.separator();
            ui.checkbox(&mut self.sure, "I have read the list above");
            if ui
                .add_enabled(
                    can_clear && self.sure,
                    egui::Button::new("Send them to the recycle bin"),
                )
                .clicked()
            {
                start = Some(gather::Action::Trash);
            }
        });
        ui.label(
            egui::RichText::new(
                "Nothing is deleted outright. The recycle bin of this machine is where \
                 they go and it is where they can be brought back from.",
            )
            .small()
            .weak(),
        );
        if let Some(action) = start
            && let Some(plan) = self.plan.take()
        {
            self.sure = false;
            for item in &plan.items {
                self.settled.insert(item.cat);
            }
            self.gathering = Some(gather::start(plan, action, ui.ctx().clone()));
        }
        ui.separator();

        let Some(plan) = &self.plan else {
            return;
        };
        let row = ui.text_style_height(&egui::TextStyle::Body) + 4.0;
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show_rows(ui, row, plan.items.len(), |ui, range| {
                for item in &plan.items[range] {
                    ui.horizontal(|ui| {
                        let (chip, _) = ui.allocate_exact_size(vec2(9.0, 9.0), Sense::hover());
                        ui.painter()
                            .rect_filled(chip, CornerRadius::same(2), item.cat.colour());
                        ui.label(egui::RichText::new(fmt::bytes(item.size)).monospace());
                        ui.label(
                            egui::RichText::new(item.from.display().to_string())
                                .monospace()
                                .small(),
                        );
                        ui.label(egui::RichText::new("→").weak());
                        ui.label(
                            egui::RichText::new(item.to.display().to_string())
                                .monospace()
                                .small()
                                .weak(),
                        );
                        if item.taken {
                            ui.label(egui::RichText::new("already holds a file").small().weak());
                        }
                    });
                }
            });
    }

    fn copying_ui(&mut self, ui: &mut Ui, job: &Arc<gather::Job>) {
        let done = job.done.load(Relaxed);
        ui.label(egui::RichText::new(if done { "Done" } else { job.action.verb() }).strong());
        if job.of_bytes > 0 {
            let share = job.bytes.load(Relaxed) as f32 / job.of_bytes as f32;
            ui.add(
                egui::ProgressBar::new(share.clamp(0.0, 1.0))
                    .desired_height(6.0)
                    .fill(Color32::from_rgb(0x39, 0x87, 0xe5)),
            );
        }
        ui.label(format!(
            "{} of {} done  ·  {} of {}",
            fmt::count(job.acted.load(Relaxed)),
            fmt::count(job.of),
            fmt::bytes(job.bytes.load(Relaxed)),
            fmt::bytes(job.of_bytes)
        ));
        let (already, refused, failed) = (
            job.already.load(Relaxed),
            job.refused.load(Relaxed),
            job.failed.load(Relaxed),
        );
        if already + refused + failed > 0 {
            ui.label(
                egui::RichText::new(format!(
                    "{} were already there  ·  {} refused  ·  {} failed",
                    fmt::count(already),
                    fmt::count(refused),
                    fmt::count(failed)
                ))
                .small()
                .weak(),
            );
        }
        if !done {
            ui.label(
                egui::RichText::new(job.current())
                    .monospace()
                    .small()
                    .weak(),
            );
            if ui.button("Stop").clicked() {
                job.stop();
            }
            ui.ctx().request_repaint_after(Duration::from_millis(200));
        } else {
            ui.horizontal(|ui| {
                if job.action == gather::Action::Copy && ui.button("Open where they went").clicked()
                {
                    sys::open_folder(&job.destination);
                }
                if ui.button("Start again").clicked() {
                    self.gathering = None;
                    self.plan = None;
                }
            });
        }

        let trouble = job.trouble();
        if !trouble.is_empty() {
            ui.separator();
            ui.label(egui::RichText::new("What did not happen").strong());
            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for line in &trouble {
                        ui.label(egui::RichText::new(line).monospace().small());
                    }
                });
        }
    }

    /// Asks the machine what it can about the unaccounted space.
    fn start_gap(&mut self, gap: u64, ctx: &egui::Context) {
        let (Some(sh), Some(volume)) = (&self.scan, self.volumes.get(self.selected)) else {
            return;
        };
        let seen = gap::Seen {
            root: volume.path.clone(),
            gap,
            denied: sh.denied.load(Relaxed),
            denied_paths: sh.denied_paths.lock().unwrap().clone(),
            files: sh.files.load(Relaxed),
        };
        self.view = View::Gap;
        self.asking = Some(gap::start(seen, ctx.clone()));
    }

    /// What the machine could work out about the unaccounted space.
    fn gap_ui(&mut self, ui: &mut Ui) {
        let Some(ask) = self.asking.clone() else {
            return;
        };
        ui.horizontal(|ui| {
            if ui.button("Back to the map").clicked() {
                self.view = View::Map;
            }
            ui.separator();
            ui.heading("Where the space went");
            if ui.button("Forget this answer").clicked() {
                self.asking = None;
                self.view = View::Map;
            }
        });
        ui.label(
            egui::RichText::new(ask.root.display().to_string())
                .monospace()
                .small()
                .weak(),
        );
        ui.separator();

        let Some(answer) = ask.answer() else {
            ui.label("asking the machine");
            ui.ctx().request_repaint_after(Duration::from_millis(150));
            return;
        };

        ui.horizontal(|ui| {
            ui.heading(fmt::bytes(answer.gap));
            ui.label("the walk could not account for");
        });
        ui.separator();

        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for finding in &answer.findings {
                    ui.horizontal(|ui| {
                        ui.label(egui::RichText::new(finding.cause).strong());
                        match finding.bytes {
                            Some(b) if finding.sure => {
                                ui.label(egui::RichText::new(fmt::bytes(b)).monospace());
                            }
                            Some(b) => {
                                ui.label(
                                    egui::RichText::new(format!("about {}", fmt::bytes(b)))
                                        .monospace(),
                                );
                            }
                            None => {
                                ui.label(egui::RichText::new("size unknown").weak());
                            }
                        }
                    });
                    ui.label(egui::RichText::new(&finding.note).small().weak());
                    if !finding.detail.is_empty() {
                        egui::CollapsingHeader::new(format!(
                            "{} named",
                            fmt::count(finding.detail.len() as u64)
                        ))
                        .id_salt(finding.cause)
                        .show(ui, |ui| {
                            for line in &finding.detail {
                                ui.label(egui::RichText::new(line).monospace().small());
                            }
                            if finding.more > 0 {
                                ui.label(
                                    egui::RichText::new(format!(
                                        "and {} more",
                                        fmt::count(finding.more as u64)
                                    ))
                                    .small()
                                    .weak(),
                                );
                            }
                        });
                    }
                    ui.separator();
                }

                ui.horizontal(|ui| {
                    ui.label(egui::RichText::new("Nothing here accounts for").strong());
                    ui.label(egui::RichText::new(fmt::bytes(answer.left)).monospace());
                });
                ui.label(
                    egui::RichText::new(
                        "A filesystem spends space on itself. The journal and the tables \
                         that record where every file sits are not files and no walk can \
                         reach them. On a copy on write filesystem a snapshot holds blocks \
                         that no living path names.",
                    )
                    .small()
                    .weak(),
                );
            });
    }

    /// Gathers the pairs under the folder on side B that holds them.
    fn regroup(&mut self, report: &Arc<dupes::Report>) {
        let key = Arc::as_ptr(report) as usize;
        if matches!(&self.groups, Some((held, _)) if *held == key) {
            return;
        }
        let mut by: std::collections::HashMap<&Path, (u64, Vec<usize>)> =
            std::collections::HashMap::new();
        for (i, pair) in report.pairs.iter().enumerate() {
            let folder = pair.b.parent().unwrap_or(&pair.b);
            let seen = by.entry(folder).or_insert((0, Vec::new()));
            seen.0 += pair.size;
            seen.1.push(i);
        }
        let mut groups: Vec<Folder> = by
            .into_iter()
            .map(|(path, (bytes, pairs))| Folder {
                path: path.to_path_buf(),
                bytes,
                pairs,
            })
            .collect();
        groups.sort_by_key(|g| std::cmp::Reverse(g.bytes));
        self.groups = Some((key, groups));
        self.held = store::Store::open().map(|held| held.counts());
    }

    /// The duplicates. It fills the window because two paths never fit a strip
    /// down the side.
    fn dupes_ui(&mut self, ui: &mut Ui) {
        let Some(job) = self.compare.clone() else {
            return;
        };
        ui.horizontal(|ui| {
            if ui.button("Back to the map").clicked() {
                self.view = View::Map;
            }
            ui.separator();
            ui.heading("Duplicates");
            if ui
                .add_enabled(
                    job.report().is_some_and(|r| r.total > 0),
                    egui::Button::new("Gather the copies"),
                )
                .clicked()
                && let Some(report) = job.report()
            {
                self.open_gather(&report);
            }
            if ui
                .button("Bring one of each across")
                .on_hover_text("Lays one copy of every file under a new folder")
                .clicked()
            {
                self.across = None;
                self.working = None;
                self.view = View::Consolidate;
            }
            if ui.button("Forget this comparison").clicked() {
                job.stop();
                self.compare = None;
                self.groups = None;
                self.view = View::Map;
            }
        });
        let alone = job.alone();
        if alone {
            ui.label(
                egui::RichText::new(job.a_root.display().to_string())
                    .monospace()
                    .small()
                    .weak(),
            );
        } else {
            for (tag, root) in [
                ("A   ", job.a_root.clone()),
                ("B   ", job.b_root.clone().unwrap_or_default()),
            ] {
                ui.label(
                    egui::RichText::new(format!("{tag}{}", root.display()))
                        .monospace()
                        .small()
                        .weak(),
                );
            }
        }
        ui.label(
            egui::RichText::new(format!(
                "{} · reading with {} threads",
                job.drive.label(),
                job.drive.readers()
            ))
            .small()
            .weak(),
        );
        ui.separator();

        if !job.done.load(Relaxed) {
            ui.label(egui::RichText::new(job.stage()).strong());

            let of = job.of.load(Relaxed);
            let bytes_of = job.bytes_of.load(Relaxed);
            if bytes_of > 0 {
                let share = job.bytes_read.load(Relaxed) as f32 / bytes_of as f32;
                ui.add(
                    egui::ProgressBar::new(share.clamp(0.0, 1.0))
                        .desired_height(6.0)
                        .fill(Color32::from_rgb(0x39, 0x87, 0xe5)),
                );
            }

            if of == 0 {
                ui.label(format!(
                    "{} files found",
                    fmt::count(job.listed.load(Relaxed))
                ));
            } else {
                let cached = job.cached.load(Relaxed);
                let mut line = format!(
                    "{} of {} files read  ·  {} of {}",
                    fmt::count(job.read.load(Relaxed)),
                    fmt::count(of),
                    fmt::bytes(job.bytes_read.load(Relaxed)),
                    fmt::bytes(bytes_of)
                );
                if cached > 0 {
                    line.push_str(&format!(
                        "  ·  {} answered by the cache",
                        fmt::count(cached)
                    ));
                }
                ui.label(line);
            }

            let found = job.found.load(Relaxed);
            if found > 0 {
                ui.label(format!(
                    "{} copies so far holding {}",
                    fmt::count(found),
                    fmt::bytes(job.freed.load(Relaxed))
                ));
            }
            ui.label(
                egui::RichText::new(job.current())
                    .monospace()
                    .small()
                    .weak(),
            );

            if ui.button("Stop").clicked() {
                job.stop();
            }
            ui.ctx().request_repaint_after(Duration::from_millis(150));
            ui.separator();
        }

        let Some(report) = job.report() else {
            return;
        };
        if report.total == 0 {
            ui.label(if alone {
                "Nothing under this folder is held more than once."
            } else {
                "Nothing in B is also held in A."
            });
            return;
        }
        self.regroup(&report);

        ui.horizontal(|ui| {
            ui.heading(fmt::bytes(report.bytes));
            ui.label(if alone {
                format!("held in {} copies beyond the first", report.total)
            } else {
                format!("across {} files in B that A already holds", report.total)
            });
        });
        let mut read = if alone {
            format!("{} files under the folder", fmt::count(report.a_files))
        } else {
            format!(
                "{} files in A against {} in B",
                fmt::count(report.a_files),
                fmt::count(report.b_files)
            )
        };
        if report.from_cache {
            read.push_str("  ·  neither folder had moved so this is the last answer");
        } else {
            if report.cached > 0 {
                read.push_str(&format!(
                    "  ·  {} digests came from the cache",
                    fmt::count(report.cached)
                ));
            }
            read.push_str(&format!(
                "  ·  {} pairs needed a byte comparison",
                fmt::count(report.confirmed)
            ));
        }
        ui.label(egui::RichText::new(read).small().weak());

        ui.horizontal(|ui| {
            ui.label(
                egui::RichText::new(format!("cache  {}", store::path().display()))
                    .monospace()
                    .small()
                    .weak(),
            );
            if ui.small_button("copy the path").clicked() {
                ui.ctx().copy_text(store::path().display().to_string());
            }
            if ui.small_button("forget these folders").clicked() {
                forget(&job);
                self.held = store::Store::open().map(|held| held.counts());
            }
        });
        if let Some((folders, files)) = self.held {
            ui.label(
                egui::RichText::new(format!(
                    "the cache holds {} files across {} folders",
                    fmt::count(files),
                    fmt::count(folders)
                ))
                .small()
                .weak(),
            );
        }
        if report.total as usize > report.pairs.len() {
            ui.label(
                egui::RichText::new(format!(
                    "the largest {} are listed below",
                    report.pairs.len()
                ))
                .small()
                .weak(),
            );
        }

        ui.horizontal(|ui| {
            ui.label("Filter");
            ui.add(
                egui::TextEdit::singleline(&mut self.filter)
                    .hint_text("part of a name or a folder")
                    .desired_width(320.0),
            );
            if ui.button("Clear").clicked() {
                self.filter.clear();
            }
        });
        ui.separator();

        let needle = self.filter.to_lowercase();
        let Some((_, groups)) = &self.groups else {
            return;
        };
        let wide = groups.len() <= 4;
        let (copy_label, kept_label) = if alone {
            ("show the copy", "show the one kept")
        } else {
            ("show in B", "show in A")
        };
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .show(ui, |ui| {
                for group in groups {
                    let rows: Vec<usize> = group
                        .pairs
                        .iter()
                        .copied()
                        .filter(|i| carries(&report.pairs[*i], &needle))
                        .collect();
                    if rows.is_empty() {
                        continue;
                    }
                    let title = format!(
                        "{}   {}   ·   {} files",
                        fmt::bytes(group.bytes),
                        under_root(&group.path, job.base()),
                        rows.len()
                    );
                    egui::CollapsingHeader::new(egui::RichText::new(title).monospace())
                        .id_salt(&group.path)
                        .default_open(wide)
                        .show(ui, |ui| {
                            egui::Grid::new(egui::Id::new(("rows", &group.path)))
                                .num_columns(5)
                                .striped(true)
                                .spacing([10.0, 2.0])
                                .show(ui, |ui| {
                                    for i in rows {
                                        let pair = &report.pairs[i];
                                        ui.label(
                                            egui::RichText::new(fmt::bytes(pair.size))
                                                .monospace()
                                                .strong(),
                                        );
                                        ui.label(egui::RichText::new(leaf(&pair.b)).monospace());
                                        if ui.small_button(copy_label).clicked() {
                                            sys::reveal(&pair.b);
                                        }
                                        ui.label(
                                            egui::RichText::new(under_root(&pair.a, &job.a_root))
                                                .monospace()
                                                .weak(),
                                        );
                                        if ui.small_button(kept_label).clicked() {
                                            sys::reveal(&pair.a);
                                        }
                                        ui.end_row();
                                    }
                                });
                        });
                }
            });
    }

    fn status(&mut self, ui: &mut Ui) {
        ui.horizontal_wrapped(|ui| {
            for c in cats::LEGEND {
                let on = self.highlight == Some(c);
                let (rect, _) = ui.allocate_exact_size(vec2(11.0, 11.0), Sense::hover());
                ui.painter()
                    .rect_filled(rect, CornerRadius::same(2), c.colour());
                if ui.selectable_label(on, c.label()).clicked() {
                    self.highlight = if on { None } else { Some(c) };
                }
            }
        });

        let Some(sh) = &self.scan else {
            ui.label("Pick a filesystem to begin. Nothing on disk is ever written.");
            return;
        };
        let bytes = sh.bytes.load(Relaxed);
        let files = sh.files.load(Relaxed);
        let dirs = sh.dirs.load(Relaxed);
        let denied = sh.denied.load(Relaxed);
        let done = sh.done.load(Relaxed);
        let share = if self.target > 0 {
            (bytes as f32 / self.target as f32).clamp(0.0, 1.0)
        } else {
            0.0
        };
        ui.add(
            egui::ProgressBar::new(if done { 1.0 } else { share })
                .desired_height(6.0)
                .fill(Color32::from_rgb(0x39, 0x87, 0xe5)),
        );
        let head = if done { "Done" } else { "Scanning" };
        let mut line = format!(
            "{head}  ·  {} of {}  ·  {files} files in {dirs} folders",
            fmt::bytes(bytes),
            fmt::bytes(self.target)
        );
        if denied > 0 {
            line.push_str(&format!("  ·  {denied} unreadable"));
        }
        let gap = self.target.saturating_sub(bytes);
        if done && gap > 0 {
            line.push_str(&format!("  ·  {} unaccounted", fmt::bytes(gap)));
        }
        let mut asked = false;
        ui.horizontal(|ui| {
            ui.label(line);
            if done && gap > 0 && ui.button("Where did it go?").clicked() {
                asked = true;
            }
        });
        if !done && let Ok(cur) = sh.current.lock() {
            ui.label(egui::RichText::new(cur.as_str()).small().weak());
        }
        if asked {
            let ctx = ui.ctx().clone();
            self.start_gap(gap, &ctx);
        }
    }

    fn map(&mut self, ui: &mut Ui) {
        let Some(snap) = self.scan.as_ref().and_then(|s| s.snapshot()) else {
            ui.centered_and_justified(|ui| ui.label("No filesystem selected."));
            return;
        };
        let (resp, painter) = ui.allocate_painter(ui.available_size(), Sense::click());
        let area = resp.rect.shrink(1.0);
        painter.rect_filled(resp.rect, CornerRadius::ZERO, Color32::from_gray(14));
        if area.width() < 8.0 || area.height() < 8.0 {
            return;
        }

        // The outer box stands for every occupied byte on the filesystem. The
        // difference between that figure and what the walk has added up is drawn
        // as one dim box so the picture completes in place.
        //
        // The difference rarely reaches zero. A folder the walk could not open
        // leaves a gap. So does every byte a filesystem spends on itself. On
        // Windows the walk reads the length of a file rather than the room it
        // takes so a drive full of small files leaves a wide gap. The box is
        // named for what it means once the walk has finished.
        let done = self.scan.as_ref().is_some_and(|s| s.done.load(Relaxed));
        let missing = if snap.parent.is_none() {
            self.target.saturating_sub(snap.root.size)
        } else {
            0
        };
        let pending = ViewNode {
            name: if done {
                "unaccounted space".to_string()
            } else {
                "not scanned yet".to_string()
            },
            size: missing,
            cat: Cat::Pending,
            dir: None,
            extra: 0,
            children: Vec::new(),
        };
        let mut list: Vec<&ViewNode> = snap.root.children.iter().collect();
        if missing > 0 {
            list.push(&pending);
        }

        self.boxes.clear();
        self.paint(&painter, area, &list, &snap.path);

        let under: Option<(String, Target)> = resp
            .hover_pos()
            .and_then(|p| self.boxes.iter().find(|b| b.rect.contains(p)))
            .map(|hit| {
                let text = match hit.cat {
                    Cat::Pending if done => format!(
                        "{}\n{}\nFolders the walk could not open and room no file claims.",
                        hit.name,
                        fmt::bytes(hit.size)
                    ),
                    Cat::Pending => format!("{}\n{}", hit.name, fmt::bytes(hit.size)),
                    _ if hit.extra > 0 => format!("{} — {}", hit.name, fmt::bytes(hit.size)),
                    _ => format!(
                        "{}\n{}  ·  {}",
                        hit.path.display(),
                        fmt::bytes(hit.size),
                        hit.cat.label()
                    ),
                };
                (text, Target::from(hit))
            });

        if let Some((text, target)) = &under {
            let tip = text.clone();
            resp.clone().on_hover_ui_at_pointer(|ui| {
                ui.label(egui::RichText::new(tip).monospace());
            });
            if resp.clicked()
                && let Some(dir) = target.dir
            {
                self.ask(dir);
            }
        }

        if resp.secondary_clicked() {
            self.menu = under.map(|(_, t)| t).filter(|t| t.real);
        }
        if let Some(target) = self.menu.clone() {
            resp.context_menu(|ui| self.menu_ui(ui, &target));
        }

        if ui.input(|i| i.key_pressed(egui::Key::Backspace))
            && let Some(p) = snap.parent
        {
            self.ask(p);
        }
    }

    fn paint(&mut self, painter: &egui::Painter, area: Rect, nodes: &[&ViewNode], parent: &Path) {
        let values: Vec<u64> = nodes.iter().map(|n| n.size).collect();
        for (n, r) in nodes.iter().zip(treemap::squarify(&values, area)) {
            if r.width() >= 1.0 && r.height() >= 1.0 {
                self.paint_one(painter, r, n, parent);
            }
        }
    }

    fn paint_one(&mut self, painter: &egui::Painter, r: Rect, n: &ViewNode, parent: &Path) {
        let path = parent.join(&n.name);
        let dim = matches!(self.highlight, Some(c) if c != n.cat);

        if n.children.is_empty() {
            let fill = shade(n.cat.colour(), dim);
            painter.rect_filled(r, CornerRadius::same(1), fill);
            label(painter, r, &n.name, ink(fill), 10.0);
        } else {
            painter.rect_filled(r, CornerRadius::same(2), shade(Cat::Folder.colour(), dim));
            painter.rect_stroke(
                r,
                CornerRadius::same(2),
                Stroke::new(1.0, Color32::from_gray(12)),
                StrokeKind::Inside,
            );
            let header = if r.height() >= 32.0 && r.width() >= 54.0 {
                label(painter, r, &n.name, Color32::from_gray(210), 11.0);
                13.0
            } else {
                1.0
            };
            let inner = Rect::from_min_max(
                pos2(r.left() + 2.0, r.top() + header + 1.0),
                pos2(r.right() - 2.0, r.bottom() - 2.0),
            );
            if inner.width() > 3.0 && inner.height() > 3.0 {
                let kids: Vec<&ViewNode> = n.children.iter().collect();
                self.paint(painter, inner, &kids, &path);
            }
        }

        self.boxes.push(Hit {
            rect: r,
            name: n.name.clone(),
            path,
            size: n.size,
            cat: n.cat,
            dir: n.dir,
            extra: n.extra,
        });
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        self.body(ui);
    }
}

impl App {
    /// The whole window. Kept apart from the trait method so a test can draw a
    /// frame without a window and without an `eframe::Frame`.
    pub fn body(&mut self, ui: &mut Ui) {
        egui::Panel::top("bar").show(ui, |ui| self.bar(ui));
        egui::Panel::bottom("status").show(ui, |ui| self.status(ui));
        if self.confirm.is_some() || self.said.is_some() {
            egui::Panel::top("confirm").show(ui, |ui| self.confirm_bar(ui));
        }
        match self.view {
            View::Duplicates if self.compare.is_some() => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.dupes_ui(ui));
            }
            View::Gap if self.asking.is_some() => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.gap_ui(ui));
            }
            View::Diagnostics => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.diagnostics_ui(ui));
            }
            View::Gather if self.compare.is_some() => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.gather_ui(ui));
            }
            View::Browse => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.browse_ui(ui));
            }
            View::Recycled => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.recycled_ui(ui));
            }
            View::Consolidate if self.compare.is_some() => {
                egui::CentralPanel::default_margins().show(ui, |ui| self.consolidate_ui(ui));
            }
            _ => {
                egui::CentralPanel::no_frame().show(ui, |ui| self.map(ui));
            }
        }

        // The walk asks for a repaint whenever it publishes. This timer only
        // covers the gap before the first snapshot arrives.
        if let Some(sh) = &self.scan
            && !sh.done.load(Relaxed)
        {
            ui.ctx().request_repaint_after(Duration::from_millis(200));
        }
    }
}

/// Names a folder held for comparison. Only the last two parts because the
/// whole path rarely fits the row.
fn held(path: &Option<PathBuf>) -> String {
    let Some(p) = path else {
        return "nothing yet".to_string();
    };
    let parts: Vec<_> = p.iter().collect();
    let tail: PathBuf = parts.iter().rev().take(2).rev().collect();
    format!("…/{}", tail.display())
}

/// What the cache takes up including the log it writes beside itself.
fn cache_bytes() -> u64 {
    let at = store::path();
    let mut total = std::fs::metadata(&at).map(|m| m.len()).unwrap_or(0);
    for beside in ["-wal", "-shm"] {
        let mut name = at.clone().into_os_string();
        name.push(beside);
        total += std::fs::metadata(PathBuf::from(name))
            .map(|m| m.len())
            .unwrap_or(0);
    }
    total
}

/// Drops what the cache holds for the folders this comparison covers. The next
/// run then reads every file again.
fn forget(job: &dupes::Job) {
    if let Some(mut held) = store::Store::open() {
        held.forget(&job.a_root);
        if let Some(b) = &job.b_root {
            held.forget(b);
        }
    }
}

/// True when the filter says nothing or when either side carries it.
fn carries(pair: &dupes::Pair, needle: &str) -> bool {
    needle.is_empty()
        || pair.b.to_string_lossy().to_lowercase().contains(needle)
        || pair.a.to_string_lossy().to_lowercase().contains(needle)
}

fn leaf(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

fn leaf_of(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

fn under_root(path: &Path, root: &Path) -> String {
    let under = path
        .strip_prefix(root)
        .unwrap_or(path)
        .display()
        .to_string();
    if under.is_empty() { leaf(root) } else { under }
}

fn shade(c: Color32, dim: bool) -> Color32 {
    if dim { c.gamma_multiply(0.16) } else { c }
}

/// Dark text on a light fill and light text on a dark one.
fn ink(c: Color32) -> Color32 {
    let l = 0.299 * c.r() as f32 + 0.587 * c.g() as f32 + 0.114 * c.b() as f32;
    if l > 140.0 {
        Color32::from_gray(16)
    } else {
        Color32::from_gray(244)
    }
}

fn label(painter: &egui::Painter, r: Rect, text: &str, colour: Color32, size: f32) {
    if r.width() < 32.0 || r.height() < size + 3.0 {
        return;
    }
    painter.with_clip_rect(r.shrink(2.0)).text(
        r.left_top() + vec2(3.0, 1.0),
        Align2::LEFT_TOP,
        text,
        FontId::proportional(size),
        colour,
    );
}

#[cfg(test)]
mod tests {
    use super::{App, View};
    use crate::cats::Cat;
    use crate::scan;
    use eframe::egui::{self, Rect, pos2, vec2};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::Ordering::Relaxed;
    use std::time::{Duration, Instant};

    fn fixture(tag: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("spacemongor-ui-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("films")).unwrap();
        fs::create_dir_all(root.join("src/lib")).unwrap();
        fs::write(root.join("films/holiday.mp4"), vec![0u8; 400_000]).unwrap();
        fs::write(root.join("src/lib/main.rs"), vec![0u8; 40_000]).unwrap();
        fs::write(root.join("src/notes.md"), vec![0u8; 20_000]).unwrap();
        root
    }

    fn input() -> egui::RawInput {
        egui::RawInput {
            screen_rect: Some(Rect::from_min_size(pos2(0.0, 0.0), vec2(1100.0, 760.0))),
            ..Default::default()
        }
    }

    /// Draws frames until the closure is happy or the deadline passes.
    fn draw_until(app: &mut App, ctx: &egui::Context, ready: impl Fn(&App) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            let mut out = ctx.run_ui(input(), |ui| app.body(ui));
            // The fonts arrive as a texture the real backend would upload.
            out.textures_delta.clear();
            if ready(app) {
                return;
            }
            assert!(Instant::now() < deadline, "the window never settled");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn a_frame_draws_every_file_it_found() {
        let root = fixture("found");
        let ctx = egui::Context::default();
        let mut app = App::new();
        app.target = 460_000;
        app.scan = Some(scan::start(root.clone(), 10, ctx.clone()));
        draw_until(&mut app, &ctx, |a| {
            a.scan.as_ref().is_some_and(|s| s.done.load(Relaxed)) && !a.boxes.is_empty()
        });

        let paths: Vec<&Path> = app.boxes.iter().map(|b| b.path.as_path()).collect();
        assert!(
            paths.iter().any(|p| p.ends_with("films/holiday.mp4")),
            "{paths:?}"
        );
        assert!(
            paths.iter().any(|p| p.ends_with("src/lib/main.rs")),
            "{paths:?}"
        );
        assert!(paths.iter().any(|p| *p == root.join("films")), "{paths:?}");
        assert!(
            paths.iter().all(|p| p.is_absolute()),
            "a box carried a path the menu could not act on"
        );

        let film = app
            .boxes
            .iter()
            .find(|b| b.path.ends_with("holiday.mp4"))
            .unwrap();
        let code = app
            .boxes
            .iter()
            .find(|b| b.path.ends_with("main.rs"))
            .unwrap();
        assert_eq!(film.cat, Cat::Video);
        assert_eq!(code.cat, Cat::Code);
        assert!(
            film.rect.area() > code.rect.area() * 5.0,
            "the larger file did not take more room"
        );

        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_unscanned_remainder_gets_its_own_box() {
        let root = fixture("gap");
        let ctx = egui::Context::default();
        let mut app = App::new();
        // Far more than is really there so the gap can never close.
        app.target = 2_000_000;
        app.scan = Some(scan::start(root.clone(), 10, ctx.clone()));
        draw_until(&mut app, &ctx, |a| {
            a.boxes.iter().any(|b| b.cat == Cat::Pending)
        });

        let pending = app.boxes.iter().find(|b| b.cat == Cat::Pending).unwrap();
        let film = app
            .boxes
            .iter()
            .find(|b| b.path.ends_with("holiday.mp4"))
            .unwrap();
        assert!(
            pending.rect.area() > film.rect.area(),
            "the gap should dominate while most of the disk is unread"
        );

        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// Reload must not measure today's disk against yesterday's free space.
    #[test]
    fn starting_a_walk_reads_the_free_space_again() {
        let ctx = egui::Context::default();
        let mut app = App::new();
        if app.volumes.is_empty() {
            return;
        }
        let chosen = app.volumes[0].path.clone();
        app.volumes[0].used = 1;
        app.selected = 0;
        app.start(&ctx);

        assert_eq!(app.volumes[app.selected].path, chosen, "the pick moved");
        assert_eq!(app.target, app.volumes[app.selected].used);
        assert_ne!(app.target, 1, "the stale figure was kept");
        app.scan.as_ref().unwrap().stop();
    }

    /// The gap rarely closes. A denied folder leaves one on Linux and the
    /// length of a file leaves one on Windows. It must stop claiming the walk
    /// is still running once the walk has stopped.
    #[test]
    fn the_gap_is_renamed_once_the_walk_has_finished() {
        let root = fixture("named");
        let ctx = egui::Context::default();
        let mut app = App::new();
        app.target = 2_000_000;
        app.scan = Some(scan::start(root.clone(), 10, ctx.clone()));
        draw_until(&mut app, &ctx, |a| {
            a.scan.as_ref().is_some_and(|s| s.done.load(Relaxed))
                && a.boxes.iter().any(|b| b.cat == Cat::Pending)
        });

        let gap = app.boxes.iter().find(|b| b.cat == Cat::Pending).unwrap();
        assert_eq!(gap.name, "unaccounted space");
        assert!(gap.size > 1_000_000);
        assert!(
            !super::Target::from(gap).real,
            "the gap box names no path so the menu must refuse it"
        );

        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn duplicates_are_gathered_under_the_folder_that_holds_them() {
        let report = std::sync::Arc::new(crate::dupes::Report {
            pairs: vec![
                crate::dupes::Pair {
                    a: PathBuf::from("/a/x.iso"),
                    b: PathBuf::from("/b/films/x.iso"),
                    size: 900,
                },
                crate::dupes::Pair {
                    a: PathBuf::from("/a/y.iso"),
                    b: PathBuf::from("/b/films/y.iso"),
                    size: 100,
                },
                crate::dupes::Pair {
                    a: PathBuf::from("/a/z.txt"),
                    b: PathBuf::from("/b/docs/z.txt"),
                    size: 500,
                },
            ],
            bytes: 1500,
            total: 3,
            a_files: 3,
            b_files: 3,
            cached: 0,
            confirmed: 0,
            from_cache: false,
        });
        let mut app = App::new();
        app.regroup(&report);

        let (_, groups) = app.groups.as_ref().unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].path, PathBuf::from("/b/films"));
        assert_eq!(groups[0].bytes, 1000, "the fullest folder comes first");
        assert_eq!(groups[0].pairs.len(), 2);
        assert_eq!(groups[1].path, PathBuf::from("/b/docs"));
        assert_eq!(groups[1].bytes, 500);
    }

    /// Covers the whole window against a real comparison. It would have caught
    /// the status bar going missing under an edit to the view beside it.
    #[test]
    fn the_duplicates_view_draws_a_frame() {
        // A fixture of its own so exactly one file is shared. Reusing the
        // treemap fixture would match every file because both sides are built
        // the same way.
        let a = std::env::temp_dir().join(format!("spacemongor-dv-a-{}", std::process::id()));
        let b = std::env::temp_dir().join(format!("spacemongor-dv-b-{}", std::process::id()));
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
        fs::create_dir_all(a.join("keep")).unwrap();
        fs::create_dir_all(b.join("archive")).unwrap();
        fs::write(a.join("keep/report.pdf"), vec![b'q'; 30_000]).unwrap();
        fs::write(a.join("only-in-a.bin"), vec![b'm'; 10_000]).unwrap();
        fs::write(b.join("archive/report-copy.pdf"), vec![b'q'; 30_000]).unwrap();
        fs::write(b.join("only-in-b.log"), vec![b'z'; 7_000]).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.first = Some(a.clone());
        app.second = Some(b.clone());
        app.start_compare(&ctx);
        assert_eq!(
            app.view,
            View::Duplicates,
            "the comparison takes the window"
        );

        draw_until(&mut app, &ctx, |app| {
            app.compare
                .as_ref()
                .is_some_and(|j| j.done.load(Relaxed) && j.report().is_some())
        });

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        let report = app.compare.as_ref().unwrap().report().unwrap();
        assert_eq!(report.total, 1);
        assert_eq!(report.bytes, 30_000);
        let (_, groups) = app.groups.as_ref().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].path, b.join("archive"));
        assert_eq!(groups[0].bytes, 30_000);

        // Back to the map and the window still draws.
        app.view = View::Map;
        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty());

        app.compare.as_ref().unwrap().stop();
        if let Some(s) = &app.scan {
            s.stop();
        }
        fs::remove_dir_all(&a).unwrap();
        fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn the_single_folder_view_draws_a_frame() {
        let root = std::env::temp_dir().join(format!("spacemongor-alone-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("backup")).unwrap();
        let payload = vec![b'r'; 25_000];
        fs::write(root.join("thesis.pdf"), &payload).unwrap();
        fs::write(root.join("backup/thesis.pdf"), &payload).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.start_alone(root.clone(), &ctx);
        assert_eq!(app.view, View::Duplicates);

        draw_until(&mut app, &ctx, |app| {
            app.compare
                .as_ref()
                .is_some_and(|j| j.done.load(Relaxed) && j.report().is_some())
        });

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        let job = app.compare.as_ref().unwrap();
        assert!(job.alone(), "one folder has no second side");
        assert_eq!(job.base(), root.as_path());
        let report = job.report().unwrap();
        assert_eq!(report.total, 1);
        assert_eq!(report.bytes, 25_000);

        let (_, groups) = app.groups.as_ref().unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].path, root.join("backup"));

        job.stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// The whole window against a real answer about the gap.
    #[test]
    fn the_gap_view_draws_a_frame() {
        use std::io::Write;

        let root = std::env::temp_dir().join(format!("spacemongor-gapui-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("kept.bin"), vec![b'k'; 20_000]).unwrap();

        // A deleted file still held open is the one cause a test can create.
        let ghost = root.join("ghost.bin");
        let mut held = fs::File::create(&ghost).unwrap();
        held.write_all(&vec![b'g'; 300_000]).unwrap();
        held.sync_all().unwrap();
        fs::remove_file(&ghost).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.volumes = vec![crate::sys::Volume {
            source: "test".to_string(),
            path: root.clone(),
            kind: "test".to_string(),
            total: 100_000_000,
            used: 50_000_000,
        }];
        app.selected = 0;
        app.target = 50_000_000;
        app.scan = Some(scan::start(root.clone(), 3, ctx.clone()));
        draw_until(&mut app, &ctx, |app| {
            app.scan.as_ref().is_some_and(|s| s.done.load(Relaxed))
        });

        app.start_gap(
            app.target - app.scan.as_ref().unwrap().bytes.load(Relaxed),
            &ctx,
        );
        assert_eq!(app.view, View::Gap);
        draw_until(&mut app, &ctx, |app| {
            app.asking.as_ref().is_some_and(|a| a.answer().is_some())
        });

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        let answer = app.asking.as_ref().unwrap().answer().unwrap();
        let ghosts = answer
            .findings
            .iter()
            .find(|f| f.cause.starts_with("Deleted files"))
            .expect("the held file is named");
        assert!(ghosts.bytes.unwrap() >= 300_000);
        assert!(answer.left < answer.gap, "part of the gap is accounted for");

        // Back to the map and the window still draws.
        app.view = View::Map;
        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty());

        drop(held);
        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn two_readings_make_a_rate() {
        use std::time::{Duration, Instant};
        let start = Instant::now();
        let mut meter = super::Meter::default();

        meter.sample(start, 0, 0, Some(0));
        assert_eq!(meter.speed, 0.0, "one reading says nothing about speed");

        // Too soon. A reading this close says more about the clock.
        meter.sample(start + Duration::from_millis(100), 999, 9, Some(100));
        assert_eq!(meter.speed, 0.0);

        meter.sample(start + Duration::from_secs(2), 20_000_000, 400, Some(1_000));
        assert_eq!(meter.speed, 10_000_000.0, "bytes a second");
        assert_eq!(meter.rate, 200.0, "files a second");
        assert_eq!(meter.busy, Some(0.5), "busy one second in two");

        // A drive that never rests reads as full rather than over.
        meter.sample(start + Duration::from_secs(3), 20_000_000, 400, Some(9_000));
        assert_eq!(meter.busy, Some(1.0));
    }

    #[test]
    fn the_diagnostics_view_draws_a_frame() {
        let ctx = egui::Context::default();
        let mut app = App::new();
        app.view = View::Diagnostics;

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        // The report has to carry the cache path because that is the thing
        // anyone reporting a fault is asked to send.
        let volume = PathBuf::from("/");
        let text = app.report_text(&volume, crate::sys::drive(&volume), "nothing", 0, 0, (0, 0));
        assert!(
            text.contains(&crate::store::path().display().to_string()),
            "{text}"
        );
        assert!(text.contains("spacemongor"), "{text}");
        assert!(text.contains("readers"), "{text}");
    }

    /// The gather view against a real comparison. Nothing is copied here. The
    /// engine has its own tests for that.
    #[test]
    fn the_gather_view_draws_a_frame() {
        let root = std::env::temp_dir().join(format!("spacemongor-gui-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("backup")).unwrap();
        let payload = vec![b'g'; 30_000];
        fs::write(root.join("holiday.mp4"), &payload).unwrap();
        fs::write(root.join("backup/holiday.mp4"), &payload).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.start_alone(root.clone(), &ctx);
        draw_until(&mut app, &ctx, |app| {
            app.compare
                .as_ref()
                .is_some_and(|j| j.done.load(Relaxed) && j.report().is_some())
        });

        let report = app.compare.as_ref().unwrap().report().unwrap();
        app.open_gather(&report);
        assert_eq!(app.view, View::Gather);
        assert_eq!(app.by_cat.len(), 1, "one group is in play");
        assert_eq!(app.by_cat[0].0, Cat::Video);
        assert_eq!(app.by_cat[0].2, 30_000, "and it holds the copy");

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        // A plan names the copy and never the file being kept.
        app.chosen.insert(Cat::Video);
        app.destination = root.join("gathered").display().to_string();
        app.plan = Some(crate::gather::plan(
            &report.pairs,
            app.compare.as_ref().unwrap().base(),
            &crate::gather::Choice {
                cats: app.chosen.clone(),
                destination: PathBuf::from(&app.destination),
            },
        ));
        let plan = app.plan.as_ref().unwrap();
        assert_eq!(plan.items.len(), 1);
        assert_eq!(plan.items[0].from, root.join("backup/holiday.mp4"));
        assert!(!plan.items[0].taken);

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty());
        assert!(
            !root.join("gathered").exists(),
            "drawing the plan wrote something"
        );

        app.compare.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// The picker against a real folder. It must read what is there and offer
    /// the folder to everything else without writing anything.
    #[test]
    fn the_browse_view_draws_a_frame() {
        let root = std::env::temp_dir().join(format!("spacemongor-bui-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("music/live")).unwrap();
        fs::create_dir_all(root.join("photos")).unwrap();
        fs::write(root.join("music/live/set.mp3"), vec![b'm'; 80_000]).unwrap();
        fs::write(root.join("photos/cover.jpg"), vec![b'p'; 2_000]).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.go_to(root.clone());
        app.view = View::Browse;

        assert_eq!(app.here.len(), 2, "the folders below are listed");
        assert!(app.here.contains(&root.join("music")));

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        app.measure = Some(crate::browse::start(root.clone(), ctx.clone()));
        draw_until(&mut app, &ctx, |app| {
            app.measure.as_ref().is_some_and(|m| m.facts().is_some())
        });

        let facts = app.measure.as_ref().unwrap().facts().unwrap();
        assert_eq!(facts.files, 2);
        assert_eq!(facts.folders, 3);
        assert_eq!(facts.by_cat[0].0, Cat::Audio, "the fullest group leads");
        assert!(facts.biggest[0].0.ends_with("set.mp3"));

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty());

        // Going down and back up lands where it started.
        app.go_to(root.join("music"));
        assert_eq!(app.here, vec![root.join("music/live")]);
        assert!(app.measure.is_none(), "the old measure was left behind");
        app.go_to(root.clone());
        assert_eq!(app.here.len(), 2);

        // The picker hands the folder to the map without a filesystem behind it.
        app.reload_at(&root, &ctx);
        assert_eq!(app.view, View::Map);
        assert_eq!(
            app.target, 0,
            "a folder has no unaccounted space to explain"
        );
        draw_until(&mut app, &ctx, |app| {
            app.scan.as_ref().is_some_and(|s| s.done.load(Relaxed))
        });
        assert!(
            app.boxes.iter().any(|b| b.path.ends_with("set.mp3")),
            "the folder was not drawn"
        );
        assert!(
            !app.boxes.iter().any(|b| b.cat == Cat::Pending),
            "a gap box appeared for a folder"
        );

        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// Reloading a folder that has gone must land somewhere real rather than
    /// leave the reader with nothing.
    #[test]
    fn reloading_a_folder_that_has_gone_moves_up_the_tree() {
        let root = std::env::temp_dir().join(format!("spacemongor-rel-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("music/live")).unwrap();
        fs::write(root.join("music/kept.mp3"), vec![b'k'; 4_000]).unwrap();
        fs::write(root.join("music/live/set.mp3"), vec![b's'; 9_000]).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();

        // A folder that is there is walked as asked.
        let landed = app.reload_at(&root.join("music/live"), &ctx);
        assert_eq!(landed, Some(root.join("music/live")));
        assert_eq!(app.view, View::Map);
        draw_until(&mut app, &ctx, |app| {
            app.scan.as_ref().is_some_and(|s| s.done.load(Relaxed))
        });
        assert!(app.boxes.iter().any(|b| b.path.ends_with("set.mp3")));

        // Now take it away and ask again for the same path.
        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(root.join("music/live")).unwrap();
        let landed = app.reload_at(&root.join("music/live"), &ctx);
        assert_eq!(
            landed,
            Some(root.join("music")),
            "it did not move up to the folder above"
        );
        draw_until(&mut app, &ctx, |app| {
            app.scan.as_ref().is_some_and(|s| s.done.load(Relaxed))
        });
        assert!(
            app.boxes.iter().any(|b| b.path.ends_with("kept.mp3")),
            "the folder above was not drawn"
        );
        assert_eq!(
            app.target, 0,
            "a folder has no unaccounted space to explain"
        );

        app.scan.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// One click must never take anything away. The asking and the doing are
    /// two steps and cancelling really cancels.
    #[test]
    fn taking_something_away_is_asked_about_first() {
        let root = std::env::temp_dir().join(format!("spacemongor-bin-ui-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let doomed = root.join("spare.mp3");
        fs::write(&doomed, vec![b'd'; 1_500]).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.view = View::Map;

        // Asking writes nothing on its own.
        app.confirm = Some((doomed.clone(), 1_500));
        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the bar drew nothing");
        assert!(doomed.exists(), "asking took it away");

        // Cancelling really cancels.
        app.confirm = None;
        assert!(doomed.exists());

        // Going through with it moves the file and says so.
        app.confirm = Some((doomed.clone(), 1_500));
        app.said = Some(match crate::sys::trash(&doomed) {
            Ok(_) => "gone".to_string(),
            Err(why) => panic!("it did not go: {why}"),
        });
        app.confirm = None;
        assert!(!doomed.exists(), "it is still there");
        assert!(app.said.is_some(), "nothing was said about it");

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty());

        fs::remove_dir_all(&root).unwrap();
    }

    /// Clearing copies out must not ask for a folder to copy them into.
    #[test]
    fn a_destination_is_only_needed_to_copy() {
        let root = std::env::temp_dir().join(format!("spacemongor-nodest-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("copy")).unwrap();
        let payload = vec![b'q'; 12_000];
        fs::write(root.join("track.mp3"), &payload).unwrap();
        fs::write(root.join("copy/track.mp3"), &payload).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.start_alone(root.clone(), &ctx);
        draw_until(&mut app, &ctx, |app| {
            app.compare
                .as_ref()
                .is_some_and(|j| j.done.load(Relaxed) && j.report().is_some())
        });
        let report = app.compare.as_ref().unwrap().report().unwrap();
        app.open_gather(&report);
        app.chosen.insert(Cat::Audio);
        assert!(app.destination.is_empty(), "no folder has been named");

        // A plan can still be worked out with nowhere to copy to.
        app.plan = Some(crate::gather::plan(
            &report.pairs,
            app.compare.as_ref().unwrap().base(),
            &crate::gather::Choice {
                cats: app.chosen.clone(),
                destination: PathBuf::from(app.destination.trim()),
            },
        ));
        assert_eq!(app.plan.as_ref().unwrap().items.len(), 1);

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        app.compare.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// The recycle bin view against something really sent there.
    #[test]
    fn the_recycle_bin_view_shows_what_went() {
        let root = std::env::temp_dir().join(format!("spacemongor-binv-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let doomed = root.join("spare-track.mp3");
        fs::write(&doomed, vec![b'z'; 3_210]).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.volumes = vec![crate::sys::Volume {
            source: "test".to_string(),
            path: root.clone(),
            kind: "test".to_string(),
            total: 1_000_000,
            used: 10_000,
        }];
        app.selected = 0;

        app.read_recycled();
        let before = app.gone.len();

        crate::sys::trash(&doomed).expect("it goes");
        assert!(!doomed.exists());

        app.read_recycled();
        assert_eq!(app.gone.len(), before + 1, "the view did not see it");
        let seen = app
            .gone
            .iter()
            .find(|g| g.was.ends_with("spare-track.mp3"))
            .expect("it is not named");
        assert_eq!(seen.was, doomed, "it forgot where it came from");
        assert_eq!(seen.size, 3_210);
        assert!(seen.now.exists(), "it is not where the record says");
        assert!(!seen.when.is_empty(), "it did not say when");

        app.view = View::Recycled;
        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        fs::remove_dir_all(&root).unwrap();
    }

    /// Working through the groups one at a time and naming somewhere with the
    /// picker rather than typing it.
    #[test]
    fn groups_are_worked_through_one_at_a_time() {
        let root = std::env::temp_dir().join(format!("spacemongor-work-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("copies")).unwrap();
        fs::create_dir_all(root.join("somewhere")).unwrap();
        for (name, fill) in [("clip.mp4", b'v'), ("cover.jpg", b'p'), ("notes.txt", b't')] {
            let payload = vec![fill; 20_000];
            fs::write(root.join(name), &payload).unwrap();
            fs::write(root.join("copies").join(name), &payload).unwrap();
        }

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.start_alone(root.clone(), &ctx);
        draw_until(&mut app, &ctx, |app| {
            app.compare
                .as_ref()
                .is_some_and(|j| j.done.load(Relaxed) && j.report().is_some())
        });
        let report = app.compare.as_ref().unwrap().report().unwrap();
        app.open_gather(&report);
        assert_eq!(app.by_cat.len(), 3, "three groups are in play");
        assert!(app.settled.is_empty(), "nothing has been done yet");

        // Only takes one group and the plan covers that group alone.
        app.chosen.clear();
        app.chosen.insert(Cat::Video);
        let base = app.compare.as_ref().unwrap().base().to_path_buf();
        let one = crate::gather::plan(
            &report.pairs,
            &base,
            &crate::gather::Choice {
                cats: app.chosen.clone(),
                destination: root.join("somewhere"),
            },
        );
        assert_eq!(one.items.len(), 1);
        assert_eq!(one.items[0].cat, Cat::Video);

        // Acting on it marks that group and leaves the others to do.
        for item in &one.items {
            app.settled.insert(item.cat);
        }
        assert!(app.settled.contains(&Cat::Video));
        let next = app
            .by_cat
            .iter()
            .map(|(c, _, _)| *c)
            .find(|c| !app.settled.contains(c));
        assert!(next.is_some_and(|c| c != Cat::Video), "{next:?}");

        // The picker names somewhere and comes back with it.
        app.view = View::Gather;
        app.picking = true;
        app.go_to(root.join("somewhere"));
        app.view = View::Browse;
        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the picker drew nothing");

        app.destination = app.at.display().to_string();
        app.picking = false;
        app.view = View::Gather;
        assert_eq!(
            app.destination,
            root.join("somewhere").display().to_string()
        );
        assert!(
            fs::read_dir(root.join("somewhere"))
                .unwrap()
                .next()
                .is_none(),
            "choosing a folder wrote into it"
        );

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty());

        app.compare.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// Bringing one of each across against a real folder holding real copies.
    #[test]
    fn one_copy_of_each_comes_across_and_the_list_names_the_rest() {
        let root = std::env::temp_dir().join(format!("spacemongor-cons-ui-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        // A file in three places, one of a kind, and a deep path to flatten.
        fs::create_dir_all(root.join("music/live/2019/set")).unwrap();
        fs::create_dir_all(root.join("backup/old")).unwrap();
        let twice = vec![b'm'; 40_000];
        fs::write(root.join("music/song.mp3"), &twice).unwrap();
        fs::write(root.join("backup/song.mp3"), &twice).unwrap();
        fs::write(root.join("backup/old/song.mp3"), &twice).unwrap();
        fs::write(root.join("music/live/2019/set/rare.mp3"), vec![b'r'; 9_000]).unwrap();
        let into = root.join("one-of-each");
        fs::create_dir_all(&into).unwrap();

        let ctx = egui::Context::default();
        let mut app = App::new();
        app.start_alone(root.clone(), &ctx);
        draw_until(&mut app, &ctx, |app| {
            app.compare
                .as_ref()
                .is_some_and(|j| j.done.load(Relaxed) && j.report().is_some())
        });
        let report = app.compare.as_ref().unwrap().report().unwrap();
        assert_eq!(report.total, 2, "two of the three are copies");

        let stop = std::sync::atomic::AtomicBool::new(false);
        let all = crate::consolidate::files_under(&root, None, &stop);
        let across = crate::consolidate::plan(&all, &report.pairs, &root, &into, 3);

        // The four files hold two contents between them. One of each comes
        // across and the list it writes still names all four old paths.
        assert_eq!(across.items.len(), 2, "one of each was not kept");
        assert_eq!(across.frees, 80_000, "the two extra copies come back");
        assert_eq!(across.removals, 4, "every old file can go");

        // The deep one is cut to three parts and still says where it came from.
        let rare = across
            .items
            .iter()
            .find(|i| i.from.ends_with("rare.mp3"))
            .expect("the rare one is missing");
        assert_eq!(
            rare.to,
            into.join("music/set/rare.mp3"),
            "the path was not flattened the way it should be"
        );

        // Copying it across really lays the files down and touches nothing old.
        for item in &across.items {
            fs::create_dir_all(item.to.parent().unwrap()).unwrap();
            fs::copy(&item.from, &item.to).unwrap();
        }
        assert!(
            root.join("backup/old/song.mp3").exists(),
            "an old file went"
        );

        let (at, named) = crate::consolidate::write_removals(&across).unwrap();
        let text = fs::read_to_string(&at).unwrap();
        assert_eq!(named, 4);
        for gone in ["music/song.mp3", "backup/song.mp3", "backup/old/song.mp3"] {
            assert!(
                text.contains(&root.join(gone).display().to_string()),
                "{gone}"
            );
        }

        app.view = View::Consolidate;
        app.across = Some(std::sync::Arc::new(across));
        app.destination = into.display().to_string();
        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        assert!(!out.shapes.is_empty(), "the view drew nothing");

        app.compare.as_ref().unwrap().stop();
        fs::remove_dir_all(&root).unwrap();
    }

    /// Timing probe. Not a check. Run it with
    /// `PROBE=/usr cargo test --release -- --ignored --nocapture`.
    #[test]
    #[ignore = "timing probe"]
    fn how_long_a_frame_takes() {
        fn count(n: &crate::tree::ViewNode) -> usize {
            1 + n.children.iter().map(count).sum::<usize>()
        }

        let root = PathBuf::from(std::env::var("PROBE").unwrap_or_else(|_| "/usr".into()));
        let ctx = egui::Context::default();
        let mut app = App::new();
        // No gap box. It would swamp every real box and hide the real cost.
        app.target = 0;
        app.depth = 10;
        app.scan = Some(scan::start(root.clone(), 10, ctx.clone()));
        let sh = app.scan.clone().unwrap();

        let walk = Instant::now();
        while !sh.done.load(Relaxed) {
            std::thread::sleep(Duration::from_millis(20));
        }
        let walked = walk.elapsed();

        sh.ask(crate::scan::Want { root: 0, depth: 10 });
        let build = Instant::now();
        let snap = loop {
            let s = sh.snapshot().unwrap();
            if !sh.redraw.load(Relaxed) {
                break s;
            }
            std::thread::sleep(Duration::from_millis(2));
        };
        let built = build.elapsed();

        let mut out = ctx.run_ui(input(), |ui| app.body(ui));
        out.textures_delta.clear();
        let frames = Instant::now();
        for _ in 0..20 {
            let mut out = ctx.run_ui(input(), |ui| app.body(ui));
            out.textures_delta.clear();
        }
        let per = frames.elapsed() / 20;

        println!("path          {}", root.display());
        println!(
            "walk          {:?} for {} files",
            walked,
            sh.files.load(Relaxed)
        );
        println!(
            "snapshot      {built:?} holding {} nodes",
            count(&snap.root)
        );
        println!("frame         {per:?} drawing {} boxes", app.boxes.len());
        sh.stop();
    }
}
