//! Scientific dataset management, spreadsheet editing, column transformations,
//! and delimited file import/export engine.

pub mod io;
pub mod models;
pub mod samples;

pub use io::{
    detect_delimiter, export_delimited_str, import_delimited_str, import_xlsx_bytes, ImportOptions,
};
pub use models::{
    CellValue, ColumnDataType, ColumnRole, ColumnTransform, DataColumn, Dataset, DatasetSource,
    FilterCondition, Worksheet,
};
pub use samples::{
    create_calibration_sample_dataset, create_spectroscopy_sample_dataset,
    create_surface_3d_sample_dataset,
};
