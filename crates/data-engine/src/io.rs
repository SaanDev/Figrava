use crate::models::{CellValue, ColumnDataType, ColumnRole, DataColumn, Dataset, DatasetSource};
use scientific_core::{ColumnId, ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct ImportOptions {
    /// Optional explicit delimiter (`","`, `"\t"`, `";"`, `" "`). If `None`, auto-detected.
    pub delimiter: Option<String>,
    /// Optional explicit header flag. If `None`, auto-detected.
    pub has_header: Option<bool>,
    /// Optional name for the imported dataset.
    pub dataset_name: Option<String>,
}

/// Detects the most likely delimiter in a delimited text sample.
pub fn detect_delimiter(content: &str) -> char {
    let sample_lines: Vec<&str> = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .take(10)
        .collect();

    if sample_lines.is_empty() {
        return ',';
    }

    let candidates = [',', '\t', ';', '|'];
    for cand in candidates {
        let counts: Vec<usize> = sample_lines
            .iter()
            .map(|l| l.chars().filter(|&c| c == cand).count())
            .collect();
        if let Some(&first_cnt) = counts.first() {
            if first_cnt > 0 && counts.iter().all(|&c| c == first_cnt) {
                return cand;
            }
        }
    }

    // Fallback: check which candidate appears most in the first line
    for cand in candidates {
        if sample_lines[0].contains(cand) {
            return cand;
        }
    }

    // Check if whitespace-delimited
    if sample_lines[0].split_whitespace().count() > 1 {
        return ' ';
    }

    ','
}

fn split_row(line: &str, delimiter: char) -> Vec<String> {
    if delimiter == ' ' {
        line.split_whitespace().map(ToString::to_string).collect()
    } else {
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(false)
            .delimiter(delimiter as u8)
            .from_reader(line.as_bytes());
        if let Some(Ok(record)) = rdr.records().next() {
            record.iter().map(|s| s.trim().to_string()).collect()
        } else {
            line.split(delimiter)
                .map(|s| s.trim().to_string())
                .collect()
        }
    }
}

/// Extracts optional unit from a header like `"Wavelength [nm]"` or `"Concentration (uM)"`.
fn parse_header_name_and_unit(raw: &str) -> (String, Option<String>) {
    let trimmed = raw.trim();
    if let (Some(open), Some(close)) = (trimmed.rfind('['), trimmed.rfind(']')) {
        if open < close && close == trimmed.len() - 1 {
            let name = trimmed[..open].trim().to_string();
            let unit = trimmed[open + 1..close].trim().to_string();
            if !name.is_empty() && !unit.is_empty() {
                return (name, Some(unit));
            }
        }
    }
    if let (Some(open), Some(close)) = (trimmed.rfind('('), trimmed.rfind(')')) {
        if open < close && close == trimmed.len() - 1 {
            let name = trimmed[..open].trim().to_string();
            let unit = trimmed[open + 1..close].trim().to_string();
            if !name.is_empty() && !unit.is_empty() {
                return (name, Some(unit));
            }
        }
    }
    (trimmed.to_string(), None)
}

fn infer_role(col_index: usize, col_name: &str, data_type: ColumnDataType) -> ColumnRole {
    if data_type == ColumnDataType::Text {
        return ColumnRole::Label;
    }
    let lower = col_name.trim().to_lowercase();
    if lower.contains("x_err") || lower.contains("xerr") || lower.contains("dx") {
        return ColumnRole::XError;
    }
    if lower.contains("err")
        || lower.contains("sigma")
        || lower.contains("unc")
        || lower.contains("sd")
        || lower.contains("std")
    {
        return ColumnRole::YError;
    }
    if lower == "z"
        || lower.starts_with("z_")
        || lower.starts_with("z ")
        || lower.starts_with("z-")
        || lower.ends_with("_z")
        || lower.ends_with(" z")
    {
        return ColumnRole::Z;
    }
    if col_index == 0 {
        ColumnRole::X
    } else {
        ColumnRole::Y
    }
}

/// Imports a dataset from CSV, TSV, or whitespace-delimited text content.
pub fn import_delimited_str(
    content: &str,
    file_name: &str,
    options: &ImportOptions,
) -> ScientificResult<Dataset> {
    let lines: Vec<&str> = content
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect();

    if lines.is_empty() {
        return Err(ScientificError::ParseError(
            "Input file contains no non-empty data rows".to_string(),
        ));
    }

    let delimiter = options
        .delimiter
        .as_deref()
        .and_then(|s| s.chars().next())
        .unwrap_or_else(|| detect_delimiter(content));

    let rows: Vec<Vec<String>> = lines.iter().map(|l| split_row(l, delimiter)).collect();
    let max_cols = rows.iter().map(Vec::len).max().unwrap_or(0);
    if max_cols == 0 {
        return Err(ScientificError::ParseError(
            "No columns detected in delimited input".to_string(),
        ));
    }

    // Auto-detect header if not explicitly specified:
    // If the first row has at least one token that is non-numeric text (and not a missing marker),
    // treat the first row as a header row.
    let has_header = options.has_header.unwrap_or_else(|| {
        rows[0]
            .iter()
            .any(|token| matches!(CellValue::parse_raw(token), CellValue::Text(_)))
    });

    let (header_tokens, data_rows) = if has_header {
        (Some(&rows[0]), &rows[1..])
    } else {
        (None, &rows[..])
    };

    if data_rows.is_empty() {
        return Err(ScientificError::ParseError(
            "File contains a header row but no data rows".to_string(),
        ));
    }

    let mut columns = Vec::with_capacity(max_cols);

    for col_idx in 0..max_cols {
        let raw_header = header_tokens
            .and_then(|h| h.get(col_idx))
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("Col{}", col_idx + 1));

        let (name, unit) = parse_header_name_and_unit(&raw_header);

        let mut values = Vec::with_capacity(data_rows.len());
        let mut numeric_count = 0usize;
        let mut text_count = 0usize;

        for row in data_rows {
            let cell = row
                .get(col_idx)
                .map(|s| CellValue::parse_raw(s))
                .unwrap_or(CellValue::Missing);
            match cell {
                CellValue::Numeric(_) => numeric_count += 1,
                CellValue::Text(_) => text_count += 1,
                CellValue::Missing => {}
            }
            values.push(cell);
        }

        let data_type = if text_count > numeric_count && numeric_count == 0 {
            ColumnDataType::Text
        } else {
            ColumnDataType::Numeric
        };

        let role = infer_role(col_idx, &name, data_type);

        columns.push(DataColumn {
            id: ColumnId::new(),
            name,
            long_name: Some(raw_header),
            unit,
            comments: None,
            role,
            data_type,
            values,
            formula: None,
        });
    }

    let dataset_name = options.dataset_name.clone().unwrap_or_else(|| {
        file_name
            .trim_end_matches(".csv")
            .trim_end_matches(".tsv")
            .to_string()
    });

    Ok(Dataset::new(
        dataset_name,
        DatasetSource::ImportedDelimited {
            file_name: file_name.to_string(),
            delimiter: delimiter.to_string(),
            has_header,
        },
        columns,
    ))
}

/// Exports a dataset (or selected columns) to a delimited string (CSV or TSV).
pub fn export_delimited_str(dataset: &Dataset, delimiter: char) -> ScientificResult<String> {
    let mut wtr = csv::WriterBuilder::new()
        .delimiter(delimiter as u8)
        .from_writer(Vec::new());

    // Header row with units if present
    let headers: Vec<String> = dataset
        .columns
        .iter()
        .map(|col| match &col.unit {
            Some(u) if !u.is_empty() => format!("{} [{}]", col.name, u),
            _ => col.name.clone(),
        })
        .collect();
    wtr.write_record(&headers)
        .map_err(|e| ScientificError::IoError(e.to_string()))?;

    let rows = dataset.row_count();
    for r in 0..rows {
        let record: Vec<String> = dataset
            .columns
            .iter()
            .map(|col| {
                col.values
                    .get(r)
                    .map(CellValue::display_string)
                    .unwrap_or_default()
            })
            .collect();
        wtr.write_record(&record)
            .map_err(|e| ScientificError::IoError(e.to_string()))?;
    }

    let bytes = wtr
        .into_inner()
        .map_err(|e| ScientificError::IoError(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| ScientificError::SerializationError(e.to_string()))
}

/// Imports an Excel `.xlsx` workbook from raw bytes (reads the specified sheet or first non-empty sheet).
pub fn import_xlsx_bytes(
    bytes: &[u8],
    file_name: &str,
    sheet_name: Option<&str>,
) -> ScientificResult<Dataset> {
    use calamine::{Data, Reader, Xlsx};
    use std::io::Cursor;

    let cursor = Cursor::new(bytes);
    let mut workbook: Xlsx<_> =
        Xlsx::new(cursor).map_err(|e| ScientificError::ParseError(format!("Excel error: {e}")))?;

    let names = workbook.sheet_names().to_vec();
    if names.is_empty() {
        return Err(ScientificError::ParseError(
            "Excel workbook contains no worksheets".to_string(),
        ));
    }

    let target_sheet = match sheet_name {
        Some(req) if names.iter().any(|n| n == req) => req.to_string(),
        _ => names[0].clone(),
    };

    let range = workbook.worksheet_range(&target_sheet).map_err(|e| {
        ScientificError::ParseError(format!("Failed reading sheet '{target_sheet}': {e}"))
    })?;

    let mut rows: Vec<Vec<String>> = Vec::new();
    for r in range.rows() {
        let row_tokens: Vec<String> = r
            .iter()
            .map(|cell| match cell {
                Data::Empty => String::new(),
                Data::Float(v) => format!("{v}"),
                Data::Int(v) => format!("{v}"),
                Data::String(s) => s.trim().to_string(),
                Data::Bool(b) => format!("{b}"),
                Data::DateTime(dt) => format!("{dt}"),
                Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
                Data::Error(_) => "NA".to_string(),
            })
            .collect();
        if row_tokens.iter().any(|t| !t.is_empty()) {
            rows.push(row_tokens);
        }
    }

    if rows.is_empty() {
        return Err(ScientificError::ParseError(format!(
            "Worksheet '{target_sheet}' contains no non-empty rows"
        )));
    }

    let max_cols = rows.iter().map(Vec::len).max().unwrap_or(0);
    let has_header = rows[0]
        .iter()
        .any(|token| matches!(CellValue::parse_raw(token), CellValue::Text(_)));

    let (header_tokens, data_rows) = if has_header {
        (Some(&rows[0]), &rows[1..])
    } else {
        (None, &rows[..])
    };

    if data_rows.is_empty() {
        return Err(ScientificError::ParseError(
            "Excel worksheet has a header row but no data rows".to_string(),
        ));
    }

    let mut columns = Vec::with_capacity(max_cols);
    for col_idx in 0..max_cols {
        let raw_header = header_tokens
            .and_then(|h| h.get(col_idx))
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("Col{}", col_idx + 1));
        let (name, unit) = parse_header_name_and_unit(&raw_header);
        let mut values = Vec::with_capacity(data_rows.len());
        let mut numeric_count = 0usize;
        let mut text_count = 0usize;

        for row in data_rows {
            let cell = row
                .get(col_idx)
                .map(|s| CellValue::parse_raw(s))
                .unwrap_or(CellValue::Missing);
            match cell {
                CellValue::Numeric(_) => numeric_count += 1,
                CellValue::Text(_) => text_count += 1,
                CellValue::Missing => {}
            }
            values.push(cell);
        }

        let data_type = if text_count > numeric_count && numeric_count == 0 {
            ColumnDataType::Text
        } else {
            ColumnDataType::Numeric
        };
        let role = infer_role(col_idx, &name, data_type);

        columns.push(DataColumn {
            id: ColumnId::new(),
            name,
            long_name: Some(raw_header),
            unit,
            comments: None,
            role,
            data_type,
            values,
            formula: None,
        });
    }

    let dataset_name = file_name
        .trim_end_matches(".xlsx")
        .trim_end_matches(".xls")
        .to_string();

    Ok(Dataset::new(
        dataset_name,
        DatasetSource::ImportedExcel {
            file_name: file_name.to_string(),
            sheet_name: target_sheet,
        },
        columns,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_csv_with_headers_units_and_missing_values() {
        let csv_text = "\
# Sample UV-Vis experiment
Concentration [uM],Absorbance [AU],Absorbance_Err [AU]
0.0,0.012,0.005
10.0,0.245,0.008
20.0,NA,0.009
30.0,0.731,0.010
";
        let ds = import_delimited_str(csv_text, "uv_vis.csv", &ImportOptions::default())
            .expect("import");
        assert_eq!(ds.name, "uv_vis");
        assert_eq!(ds.column_count(), 3);
        assert_eq!(ds.row_count(), 4);

        assert_eq!(ds.columns[0].name, "Concentration");
        assert_eq!(ds.columns[0].unit.as_deref(), Some("uM"));
        assert_eq!(ds.columns[0].role, ColumnRole::X);

        assert_eq!(ds.columns[1].name, "Absorbance");
        assert_eq!(ds.columns[1].role, ColumnRole::Y);
        assert_eq!(ds.columns[1].missing_count(), 1);

        assert_eq!(ds.columns[2].role, ColumnRole::YError);

        let exported = export_delimited_str(&ds, ',').expect("export");
        assert!(exported.contains("Concentration [uM],Absorbance [AU],Absorbance_Err [AU]"));
    }

    #[test]
    fn imports_whitespace_delimited_without_headers() {
        let raw = "1.0 2.5\n2.0 5.0\n3.0 7.5\n";
        let ds = import_delimited_str(raw, "xy.dat", &ImportOptions::default()).expect("import");
        assert_eq!(ds.column_count(), 2);
        assert_eq!(ds.row_count(), 3);
        assert_eq!(ds.columns[0].role, ColumnRole::X);
        assert_eq!(ds.columns[1].role, ColumnRole::Y);
    }

    #[test]
    fn imports_xyz_csv_with_z_role() {
        let raw = "x,y,z\n0.0,0.0,1.0\n1.0,0.0,2.5\n0.0,1.0,3.2\n1.0,1.0,4.8\n";
        let ds = import_delimited_str(raw, "surface.csv", &ImportOptions::default()).expect("import");
        assert_eq!(ds.column_count(), 3);
        assert_eq!(ds.columns[0].role, ColumnRole::X);
        assert_eq!(ds.columns[1].role, ColumnRole::Y);
        assert_eq!(ds.columns[2].role, ColumnRole::Z);
    }
}
