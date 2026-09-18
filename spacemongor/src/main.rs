//! spacemongor. A read only treemap of a filesystem. Runs on Linux and Windows.

// A release build on Windows opens no console behind the window. A debug build
// keeps one so a panic can still be read.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod browse;
mod cats;
mod consolidate;
mod dupes;
mod fmt;
mod gap;
mod gather;
mod icon;
mod scan;
mod store;
mod sys;
mod tree;
mod treemap;

fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([1150.0, 760.0])
            .with_min_inner_size([640.0, 420.0])
            .with_title("spacemongor")
            .with_icon(icon::tunnel(256)),
        ..Default::default()
    };
    eframe::run_native(
        "spacemongor",
        options,
        Box::new(|cc| {
            cc.egui_ctx.set_visuals(eframe::egui::Visuals::dark());
            Ok(Box::new(app::App::new()))
        }),
    )
}
