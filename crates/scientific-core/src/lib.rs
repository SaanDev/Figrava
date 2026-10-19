//! Core mathematical utilities, stable entity identifiers, error definitions,
//! numerical validation, and dependency tracking for Scientific Plot Studio.

pub mod dependency;
pub mod error;
pub mod ids;
pub mod validation;

pub use dependency::{DependencyGraph, DependencyNodeKind};
pub use error::{ScientificError, ScientificResult};
pub use ids::{
    AnalysisId, AnnotationId, ColumnId, DatasetId, LayerId, PanelId, PlotId, ProjectId, WorksheetId,
};
pub use validation::{
    clean_paired_data, clean_single_series, is_constant_series, CleanedPairedData,
};
