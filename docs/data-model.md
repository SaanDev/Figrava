# Data & Worksheet Model Specification (`crates/data-engine`)

## 1. Core Entities

- **`Dataset`**:
  - `id: DatasetId` (`ds-<uuid>`)
  - `name: String`
  - `source: DatasetSource` (`Manual`, `ImportedDelimited`, `Synthesized`)
  - `columns: Vec<DataColumn>`
- **`DataColumn`**:
  - `id: ColumnId` (`col-<uuid>`)
  - `name: String`, `long_name: Option<String>`, `unit: Option<String>`
  - `role: ColumnRole` (`X`, `Y`, `XError`, `YError`, `Label`, `None`)
  - `data_type: ColumnDataType` (`Numeric`, `Text`)
  - `values: Vec<CellValue>` (`Numeric(f64)`, `Text(String)`, `Missing`)
  - `formula: Option<String>`
- **`Worksheet`**:
  - `id: WorksheetId` (`ws-<uuid>`)
  - `name: String`
  - `dataset_id: DatasetId`

## 2. Missing Value Semantics

Missing values (`""`, `"NA"`, `"N/A"`, `"NaN"`, `"null"`, `"--"`) are stored explicitly as `CellValue::Missing`. When extracting numeric vectors (`DataColumn::numeric_values`), missing cells yield `f64::NAN` so row indices remain aligned across paired columns prior to paired filtering in `scientific_core::clean_paired_data`.
