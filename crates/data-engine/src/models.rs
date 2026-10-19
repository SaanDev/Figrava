use scientific_core::{ColumnId, DatasetId, ScientificError, ScientificResult, WorksheetId};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnRole {
    X,
    Y,
    Z,
    XError,
    YError,
    Label,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ColumnDataType {
    Numeric,
    Text,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum CellValue {
    Numeric(f64),
    Text(String),
    Missing,
}

impl CellValue {
    pub fn parse_raw(raw: &str) -> Self {
        let trimmed = raw.trim();
        if trimmed.is_empty()
            || trimmed.eq_ignore_ascii_case("na")
            || trimmed.eq_ignore_ascii_case("n/a")
            || trimmed.eq_ignore_ascii_case("nan")
            || trimmed.eq_ignore_ascii_case("null")
            || trimmed == "--"
        {
            return Self::Missing;
        }

        if let Ok(num) = trimmed.parse::<f64>() {
            if num.is_finite() {
                Self::Numeric(num)
            } else {
                Self::Missing
            }
        } else {
            Self::Text(trimmed.to_string())
        }
    }

    pub fn as_f64(&self) -> f64 {
        match self {
            Self::Numeric(v) => *v,
            Self::Text(_) | Self::Missing => f64::NAN,
        }
    }

    pub fn display_string(&self) -> String {
        match self {
            Self::Numeric(v) => {
                if v.abs() >= 1e6 || (v.abs() > 0.0 && v.abs() < 1e-4) {
                    format!("{v:.5e}")
                } else {
                    format!("{v}")
                }
            }
            Self::Text(s) => s.clone(),
            Self::Missing => String::new(),
        }
    }

    pub fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DataColumn {
    pub id: ColumnId,
    pub name: String,
    pub long_name: Option<String>,
    pub unit: Option<String>,
    pub comments: Option<String>,
    pub role: ColumnRole,
    pub data_type: ColumnDataType,
    pub values: Vec<CellValue>,
    pub formula: Option<String>,
}

impl DataColumn {
    pub fn new_numeric(
        name: impl Into<String>,
        role: ColumnRole,
        unit: Option<String>,
        values: Vec<f64>,
    ) -> Self {
        let cell_values = values
            .into_iter()
            .map(|v| {
                if v.is_finite() {
                    CellValue::Numeric(v)
                } else {
                    CellValue::Missing
                }
            })
            .collect();

        Self {
            id: ColumnId::new(),
            name: name.into(),
            long_name: None,
            unit,
            comments: None,
            role,
            data_type: ColumnDataType::Numeric,
            values: cell_values,
            formula: None,
        }
    }

    /// Returns a `Vec<f64>` of the same length as `self.values`, with `f64::NAN` for missing/text cells.
    pub fn numeric_values(&self) -> Vec<f64> {
        self.values.iter().map(CellValue::as_f64).collect()
    }

    pub fn missing_count(&self) -> usize {
        self.values.iter().filter(|v| v.is_missing()).count()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "source_type", rename_all = "snake_case")]
pub enum DatasetSource {
    Manual,
    ImportedDelimited {
        file_name: String,
        delimiter: String,
        has_header: bool,
    },
    ImportedExcel {
        file_name: String,
        sheet_name: String,
    },
    Synthesized {
        description: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "transform", rename_all = "snake_case")]
pub enum ColumnTransform {
    ScaleOffset { scale: f64, offset: f64 },
    Log10,
    Ln,
    NormalizeMinMax,
    StandardizeZScore,
    FirstDerivative { x_col: ColumnId },
    CumulativeIntegral { x_col: ColumnId },
    MovingAverage { window: usize },
    SavitzkyGolay5,
    BaselineSubtractLinear,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "condition", rename_all = "snake_case")]
pub enum FilterCondition {
    GreaterThan { value: f64 },
    LessThan { value: f64 },
    Between { min: f64, max: f64 },
    NotMissing,
    TextContains { query: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dataset {
    pub id: DatasetId,
    pub name: String,
    pub source: DatasetSource,
    pub columns: Vec<DataColumn>,
}

impl Dataset {
    pub fn new(name: impl Into<String>, source: DatasetSource, columns: Vec<DataColumn>) -> Self {
        Self {
            id: DatasetId::new(),
            name: name.into(),
            source,
            columns,
        }
    }

    pub fn row_count(&self) -> usize {
        self.columns
            .iter()
            .map(|c| c.values.len())
            .max()
            .unwrap_or(0)
    }

    pub fn column_count(&self) -> usize {
        self.columns.len()
    }

    pub fn column(&self, col_id: &ColumnId) -> ScientificResult<&DataColumn> {
        self.columns
            .iter()
            .find(|c| &c.id == col_id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "DataColumn".to_string(),
                id: col_id.to_string(),
            })
    }

    pub fn column_mut(&mut self, col_id: &ColumnId) -> ScientificResult<&mut DataColumn> {
        self.columns
            .iter_mut()
            .find(|c| &c.id == col_id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "DataColumn".to_string(),
                id: col_id.to_string(),
            })
    }

    pub fn set_cell(
        &mut self,
        col_id: &ColumnId,
        row_index: usize,
        raw_value: &str,
    ) -> ScientificResult<()> {
        let row_cnt = self.row_count();
        if row_index >= row_cnt {
            // Auto-expand all columns up to row_index + 1
            let new_len = row_index + 1;
            for col in &mut self.columns {
                if col.values.len() < new_len {
                    col.values.resize(new_len, CellValue::Missing);
                }
            }
        }
        let col = self.column_mut(col_id)?;
        col.values[row_index] = CellValue::parse_raw(raw_value);
        Ok(())
    }

    pub fn add_row(&mut self) -> usize {
        let next_len = self.row_count() + 1;
        for col in &mut self.columns {
            col.values.resize(next_len, CellValue::Missing);
        }
        next_len - 1
    }

    pub fn delete_row(&mut self, row_index: usize) -> ScientificResult<()> {
        let rows = self.row_count();
        if row_index >= rows {
            return Err(ScientificError::InvalidParameter {
                name: "row_index".to_string(),
                reason: format!("Row index {row_index} out of bounds for {rows} rows"),
            });
        }
        for col in &mut self.columns {
            if row_index < col.values.len() {
                col.values.remove(row_index);
            }
        }
        Ok(())
    }

    pub fn add_column(
        &mut self,
        name: impl Into<String>,
        role: ColumnRole,
        unit: Option<String>,
    ) -> ColumnId {
        let rows = self.row_count().max(1);
        let col = DataColumn {
            id: ColumnId::new(),
            name: name.into(),
            long_name: None,
            unit,
            comments: None,
            role,
            data_type: ColumnDataType::Numeric,
            values: vec![CellValue::Missing; rows],
            formula: None,
        };
        let id = col.id.clone();
        self.columns.push(col);
        id
    }

    pub fn remove_column(&mut self, col_id: &ColumnId) -> ScientificResult<()> {
        if self.columns.len() <= 1 {
            return Err(ScientificError::InvalidParameter {
                name: "col_id".to_string(),
                reason: "Cannot remove the last remaining column in a dataset".to_string(),
            });
        }
        let pos = self
            .columns
            .iter()
            .position(|c| &c.id == col_id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "DataColumn".to_string(),
                id: col_id.to_string(),
            })?;
        self.columns.remove(pos);
        Ok(())
    }

    pub fn duplicate_column(&mut self, col_id: &ColumnId) -> ScientificResult<ColumnId> {
        let existing = self.column(col_id)?.clone();
        let new_id = ColumnId::new();
        let mut duplicated = existing;
        duplicated.id = new_id.clone();
        duplicated.name = format!("{} (Copy)", duplicated.name);
        self.columns.push(duplicated);
        Ok(new_id)
    }

    pub fn rename_column(
        &mut self,
        col_id: &ColumnId,
        new_name: impl Into<String>,
        unit: Option<String>,
    ) -> ScientificResult<()> {
        let col = self.column_mut(col_id)?;
        col.name = new_name.into();
        col.unit = unit;
        Ok(())
    }

    pub fn set_column_role(&mut self, col_id: &ColumnId, role: ColumnRole) -> ScientificResult<()> {
        let col = self.column_mut(col_id)?;
        col.role = role;
        Ok(())
    }

    /// Sorts all columns in lockstep based on the values in `col_id`.
    /// `Missing` cells are always placed at the end.
    pub fn sort_by_column(&mut self, col_id: &ColumnId, ascending: bool) -> ScientificResult<()> {
        let target_col = self.column(col_id)?;
        let rows = self.row_count();
        let mut indices: Vec<usize> = (0..rows).collect();

        indices.sort_by(|&a, &b| {
            let va = target_col.values.get(a).unwrap_or(&CellValue::Missing);
            let vb = target_col.values.get(b).unwrap_or(&CellValue::Missing);
            match (va, vb) {
                (CellValue::Missing, CellValue::Missing) => Ordering::Equal,
                (CellValue::Missing, _) => Ordering::Greater,
                (_, CellValue::Missing) => Ordering::Less,
                (CellValue::Numeric(na), CellValue::Numeric(nb)) => {
                    let ord = na.partial_cmp(nb).unwrap_or(Ordering::Equal);
                    if ascending {
                        ord
                    } else {
                        ord.reverse()
                    }
                }
                (sa, sb) => {
                    let ord = sa.display_string().cmp(&sb.display_string());
                    if ascending {
                        ord
                    } else {
                        ord.reverse()
                    }
                }
            }
        });

        for col in &mut self.columns {
            let old_vals = col.values.clone();
            col.values = indices
                .iter()
                .map(|&idx| old_vals.get(idx).cloned().unwrap_or(CellValue::Missing))
                .collect();
        }
        Ok(())
    }

    /// Returns row indices that match the given filter condition on `col_id`.
    pub fn filter_row_indices(
        &self,
        col_id: &ColumnId,
        condition: &FilterCondition,
    ) -> ScientificResult<Vec<usize>> {
        let col = self.column(col_id)?;
        let mut matching = Vec::new();
        for (idx, val) in col.values.iter().enumerate() {
            let matched = match condition {
                FilterCondition::GreaterThan { value } => {
                    matches!(val, CellValue::Numeric(v) if *v > *value)
                }
                FilterCondition::LessThan { value } => {
                    matches!(val, CellValue::Numeric(v) if *v < *value)
                }
                FilterCondition::Between { min, max } => {
                    matches!(val, CellValue::Numeric(v) if *v >= *min && *v <= *max)
                }
                FilterCondition::NotMissing => !val.is_missing(),
                FilterCondition::TextContains { query } => val
                    .display_string()
                    .to_lowercase()
                    .contains(&query.to_lowercase()),
            };
            if matched {
                matching.push(idx);
            }
        }
        Ok(matching)
    }

    /// Creates a new derived column by applying a mathematical transformation to `source_col_id`.
    pub fn apply_column_transform(
        &mut self,
        source_col_id: &ColumnId,
        transform: &ColumnTransform,
        result_name: Option<String>,
    ) -> ScientificResult<ColumnId> {
        let src = self.column(source_col_id)?;
        let src_name = src.name.clone();
        let src_vals = src.numeric_values();

        let (derived_vals, default_name, formula_desc) = match transform {
            ColumnTransform::ScaleOffset { scale, offset } => {
                let vals = src_vals.iter().map(|&v| v * scale + offset).collect();
                (
                    vals,
                    format!("{src_name} (Scaled)"),
                    format!("{scale} * {src_name} + {offset}"),
                )
            }
            ColumnTransform::Log10 => {
                let vals = src_vals
                    .iter()
                    .map(|&v| if v > 0.0 { v.log10() } else { f64::NAN })
                    .collect();
                (
                    vals,
                    format!("log10({src_name})"),
                    format!("log10({src_name})"),
                )
            }
            ColumnTransform::Ln => {
                let vals = src_vals
                    .iter()
                    .map(|&v| if v > 0.0 { v.ln() } else { f64::NAN })
                    .collect();
                (vals, format!("ln({src_name})"), format!("ln({src_name})"))
            }
            ColumnTransform::NormalizeMinMax => {
                let finite: Vec<f64> = src_vals.iter().copied().filter(|v| v.is_finite()).collect();
                if finite.is_empty() {
                    return Err(ScientificError::InsufficientData {
                        required: 1,
                        actual: 0,
                    });
                }
                let min_v = finite.iter().copied().fold(f64::INFINITY, f64::min);
                let max_v = finite.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                let span = (max_v - min_v).max(1e-15);
                let vals = src_vals.iter().map(|&v| (v - min_v) / span).collect();
                (
                    vals,
                    format!("{src_name} (Norm)"),
                    format!("({src_name} - min) / (max - min)"),
                )
            }
            ColumnTransform::StandardizeZScore => {
                let finite: Vec<f64> = src_vals.iter().copied().filter(|v| v.is_finite()).collect();
                if finite.len() < 2 {
                    return Err(ScientificError::InsufficientData {
                        required: 2,
                        actual: finite.len(),
                    });
                }
                let mean = finite.iter().sum::<f64>() / (finite.len() as f64);
                let var = finite.iter().map(|&v| (v - mean).powi(2)).sum::<f64>()
                    / ((finite.len() - 1) as f64);
                let sd = var.sqrt().max(1e-15);
                let vals = src_vals.iter().map(|&v| (v - mean) / sd).collect();
                (
                    vals,
                    format!("{src_name} (Z-Score)"),
                    format!("({src_name} - mean) / sd"),
                )
            }
            ColumnTransform::FirstDerivative { x_col } => {
                let x_vals = self.column(x_col)?.numeric_values();
                let n = src_vals.len().min(x_vals.len());
                if n < 2 {
                    return Err(ScientificError::InsufficientData {
                        required: 2,
                        actual: n,
                    });
                }
                let mut deriv = vec![f64::NAN; n];
                for i in 0..n {
                    if i == 0 {
                        let dx = x_vals[1] - x_vals[0];
                        deriv[0] = if dx.abs() > 1e-15 {
                            (src_vals[1] - src_vals[0]) / dx
                        } else {
                            f64::NAN
                        };
                    } else if i == n - 1 {
                        let dx = x_vals[n - 1] - x_vals[n - 2];
                        deriv[n - 1] = if dx.abs() > 1e-15 {
                            (src_vals[n - 1] - src_vals[n - 2]) / dx
                        } else {
                            f64::NAN
                        };
                    } else {
                        let dx = x_vals[i + 1] - x_vals[i - 1];
                        deriv[i] = if dx.abs() > 1e-15 {
                            (src_vals[i + 1] - src_vals[i - 1]) / dx
                        } else {
                            f64::NAN
                        };
                    }
                }
                (
                    deriv,
                    format!("d({src_name})/dx"),
                    format!("central_diff({src_name})"),
                )
            }
            ColumnTransform::CumulativeIntegral { x_col } => {
                let x_vals = self.column(x_col)?.numeric_values();
                let n = src_vals.len().min(x_vals.len());
                if n < 2 {
                    return Err(ScientificError::InsufficientData {
                        required: 2,
                        actual: n,
                    });
                }
                let mut integral = vec![f64::NAN; n];
                let mut acc = 0.0;
                integral[0] = 0.0;
                for i in 1..n {
                    let dx = x_vals[i] - x_vals[i - 1];
                    let y_avg = 0.5 * (src_vals[i] + src_vals[i - 1]);
                    if dx.is_finite() && y_avg.is_finite() {
                        acc += y_avg * dx;
                        integral[i] = acc;
                    }
                }
                (
                    integral,
                    format!("Int({src_name})"),
                    format!("trapezoidal_integral({src_name})"),
                )
            }
            ColumnTransform::MovingAverage { window } => {
                let w = (*window).max(1);
                let half = w / 2;
                let n = src_vals.len();
                let mut smoothed = vec![f64::NAN; n];
                for (i, out_val) in smoothed.iter_mut().enumerate() {
                    let start = i.saturating_sub(half);
                    let end = (i + half + 1).min(n);
                    let mut sum = 0.0;
                    let mut cnt = 0usize;
                    for &val in &src_vals[start..end] {
                        if val.is_finite() {
                            sum += val;
                            cnt += 1;
                        }
                    }
                    if cnt > 0 {
                        *out_val = sum / (cnt as f64);
                    }
                }
                (
                    smoothed,
                    format!("{src_name} (MA-{w})"),
                    format!("moving_avg({src_name}, {w})"),
                )
            }
            ColumnTransform::SavitzkyGolay5 => {
                let n = src_vals.len();
                let mut smoothed = src_vals.clone();
                // 5-point quadratic Savitzky-Golay filter: (-3*y_{i-2} + 12*y_{i-1} + 17*y_i + 12*y_{i+1} - 3*y_{i+2}) / 35
                if n >= 5 {
                    for i in 2..(n - 2) {
                        let y_m2 = src_vals[i - 2];
                        let y_m1 = src_vals[i - 1];
                        let y_0 = src_vals[i];
                        let y_p1 = src_vals[i + 1];
                        let y_p2 = src_vals[i + 2];
                        if y_m2.is_finite()
                            && y_m1.is_finite()
                            && y_0.is_finite()
                            && y_p1.is_finite()
                            && y_p2.is_finite()
                        {
                            smoothed[i] = (-3.0 * y_m2 + 12.0 * y_m1 + 17.0 * y_0 + 12.0 * y_p1
                                - 3.0 * y_p2)
                                / 35.0;
                        }
                    }
                }
                (
                    smoothed,
                    format!("{src_name} (SG5)"),
                    format!("savgol5({src_name})"),
                )
            }
            ColumnTransform::BaselineSubtractLinear => {
                let first = src_vals.iter().position(|v| v.is_finite());
                let last = src_vals.iter().rposition(|v| v.is_finite());
                let mut out = src_vals.clone();
                if let (Some(i0), Some(i1)) = (first, last) {
                    let y0 = src_vals[i0];
                    let y1 = src_vals[i1];
                    let span = (i1.saturating_sub(i0)).max(1) as f64;
                    for (i, v) in out.iter_mut().enumerate() {
                        if v.is_finite() {
                            let t = ((i as f64) - (i0 as f64)) / span;
                            let base = y0 + t * (y1 - y0);
                            *v -= base;
                        }
                    }
                }
                (
                    out,
                    format!("{src_name} (BaseSub)"),
                    format!("baseline_subtract({src_name})"),
                )
            }
        };

        let mut new_col = DataColumn::new_numeric(
            result_name.unwrap_or(default_name),
            ColumnRole::Y,
            None,
            derived_vals,
        );
        new_col.formula = Some(formula_desc);
        let id = new_col.id.clone();
        self.columns.push(new_col);
        Ok(id)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Worksheet {
    pub id: WorksheetId,
    pub name: String,
    pub dataset_id: DatasetId,
    pub active_filter_col: Option<ColumnId>,
    pub active_filter: Option<FilterCondition>,
}

impl Worksheet {
    pub fn new(name: impl Into<String>, dataset_id: DatasetId) -> Self {
        Self {
            id: WorksheetId::new(),
            name: name.into(),
            dataset_id,
            active_filter_col: None,
            active_filter: None,
        }
    }
}
