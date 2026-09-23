//! Estimating how long a code review will take.
//!
//! The binary reads a diff and prints a report. This library is what the commit message hook calls so the estimate can sit beside the line counts.

pub mod diff;
pub mod lang;
pub mod model;
