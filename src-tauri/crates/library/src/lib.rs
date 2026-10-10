//! The user's presentation library for the Rhema application.
//!
//! Unlike the bundled, read-only Bible database, this is a writable `SQLite`
//! file in the app data directory holding everything a church builds up
//! over time: songs (with their sections and arrangement), service
//! schedules, imported presentation decks (whose slide images live on disk
//! beside the database) and imported videos (copied in beside them).
//!
//! # Key types
//!
//! - [`LibraryDb`] — connection wrapper; opens and migrates the database
//! - [`Song`], [`SongSection`], [`SongSummary`] — song models
//! - [`Schedule`], [`ScheduleItem`] — service order models
//! - [`Deck`], [`DeckSlide`], [`DeckStore`] — imported decks and where their images live
//! - [`Video`], [`VideoStore`] — imported videos and where their copies live
//! - [`LibraryError`] — error type for all library operations

pub mod db;
pub mod decks;
pub mod error;
mod folders;
pub mod models;
pub mod schedules;
pub mod songs;
pub mod videos;

mod schema;

pub use db::LibraryDb;
pub use decks::DeckStore;
pub use error::LibraryError;
pub use models::*;
pub use videos::VideoStore;
