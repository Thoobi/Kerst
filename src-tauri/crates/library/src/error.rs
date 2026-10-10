use thiserror::Error;

#[non_exhaustive]
#[derive(Debug, Error)]
pub enum LibraryError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("could not encode stored data: {0}")]
    Json(#[from] serde_json::Error),

    #[error("could not create library directory: {0}")]
    Io(#[from] std::io::Error),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("invalid input: {0}")]
    Invalid(String),
}
