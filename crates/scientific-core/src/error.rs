use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type ScientificResult<T> = Result<T, ScientificError>;

#[derive(Debug, Clone, PartialEq, Error, Serialize, Deserialize)]
#[serde(tag = "kind", content = "details")]
pub enum ScientificError {
    #[error("Dimension mismatch: expected {expected} elements, got {actual}")]
    DimensionMismatch { expected: usize, actual: usize },

    #[error("Insufficient valid observations: required at least {required}, found {actual}")]
    InsufficientData { required: usize, actual: usize },

    #[error("Degenerate dataset: {0}")]
    DegenerateData(String),

    #[error("Non-finite value at index {index}: {description}")]
    NonFiniteValue { index: usize, description: String },

    #[error("Convergence failed after {iterations} iterations: {reason}")]
    ConvergenceFailed { iterations: usize, reason: String },

    #[error("Invalid parameter '{name}': {reason}")]
    InvalidParameter { name: String, reason: String },

    #[error("{entity} with ID '{id}' was not found")]
    NotFound { entity: String, id: String },

    #[error("Circular dependency detected between '{from}' and '{to}'")]
    CyclicDependency { from: String, to: String },

    #[error("I/O error: {0}")]
    IoError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Unsupported project format version {found} (maximum supported: {max_supported})")]
    UnsupportedVersion { found: u32, max_supported: u32 },

    #[error("Data parse error: {0}")]
    ParseError(String),
}

impl From<std::io::Error> for ScientificError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err.to_string())
    }
}

impl From<serde_json::Error> for ScientificError {
    fn from(err: serde_json::Error) -> Self {
        Self::SerializationError(err.to_string())
    }
}
