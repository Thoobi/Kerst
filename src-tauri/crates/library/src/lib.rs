//! The user's presentation library for the Rhema application.
//!
//! Unlike the bundled, read-only Bible database, this is a writable `SQLite`
//! file in the app data directory holding everything a church builds up
//! over time: songs (with their sections and arrangement) and service
//! schedules.
//!
//! # Key types
//!
//! - [`LibraryDb`] — connection wrapper; opens and migrates the database
//! - [`Song`], [`SongSection`], [`SongSummary`] — song models
//! - [`Schedule`], [`ScheduleItem`] — service order models
//! - [`LibraryError`] — error type for all library operations

pub mod db;
pub mod error;
pub mod models;
pub mod schedules;
pub mod songs;

mod schema;

pub use db::LibraryDb;
pub use error::LibraryError;
pub use models::*;
