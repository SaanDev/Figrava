use crate::error::{ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};

pub const DEFAULT_EPSILON: f64 = 1e-12;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CleanedPairedData {
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub y_err: Option<Vec<f64>>,
    pub original_indices: Vec<usize>,
    pub dropped_count: usize,
}

/// Validates and filters paired (X, Y) arrays and optional Y-error arrays.
///
/// Missing values (`NaN`) are dropped cleanly while recording the original indices
/// and `dropped_count`. Infinite values (`+Inf`, `-Inf`) or non-positive error bars
/// produce explicit errors so scientific calculations never silently corrupt results.
pub fn clean_paired_data(
    x: &[f64],
    y: &[f64],
    y_err: Option<&[f64]>,
    x_range: Option<(f64, f64)>,
    min_required: usize,
) -> ScientificResult<CleanedPairedData> {
    if x.len() != y.len() {
        return Err(ScientificError::DimensionMismatch {
            expected: x.len(),
            actual: y.len(),
        });
    }

    if let Some(err) = y_err {
        if err.len() != x.len() {
            return Err(ScientificError::DimensionMismatch {
                expected: x.len(),
                actual: err.len(),
            });
        }
    }

    let mut clean_x = Vec::with_capacity(x.len());
    let mut clean_y = Vec::with_capacity(y.len());
    let mut clean_err = y_err.map(|_| Vec::with_capacity(x.len()));
    let mut original_indices = Vec::with_capacity(x.len());
    let mut dropped_count = 0usize;

    for i in 0..x.len() {
        let xi = x[i];
        let yi = y[i];
        let ei = y_err.map(|e| e[i]);

        // Treat NaN as missing value and skip
        if xi.is_nan() || yi.is_nan() || ei.is_some_and(f64::is_nan) {
            dropped_count += 1;
            continue;
        }

        // Reject infinite values explicitly
        if !xi.is_finite() {
            return Err(ScientificError::NonFiniteValue {
                index: i,
                description: format!("X value at index {i} is infinite ({xi})"),
            });
        }
        if !yi.is_finite() {
            return Err(ScientificError::NonFiniteValue {
                index: i,
                description: format!("Y value at index {i} is infinite ({yi})"),
            });
        }
        if let Some(err_val) = ei {
            if !err_val.is_finite() {
                return Err(ScientificError::NonFiniteValue {
                    index: i,
                    description: format!("Y error at index {i} is infinite ({err_val})"),
                });
            }
            if err_val <= 0.0 {
                return Err(ScientificError::InvalidParameter {
                    name: "y_err".to_string(),
                    reason: format!(
                        "Measurement uncertainty at index {i} must be strictly positive, got {err_val}"
                    ),
                });
            }
        }

        // Apply optional X range filter
        if let Some((x_min, x_max)) = x_range {
            if xi < x_min || xi > x_max {
                continue;
            }
        }

        clean_x.push(xi);
        clean_y.push(yi);
        if let (Some(vec), Some(val)) = (&mut clean_err, ei) {
            vec.push(val);
        }
        original_indices.push(i);
    }

    if clean_x.len() < min_required {
        return Err(ScientificError::InsufficientData {
            required: min_required,
            actual: clean_x.len(),
        });
    }

    Ok(CleanedPairedData {
        x: clean_x,
        y: clean_y,
        y_err: clean_err,
        original_indices,
        dropped_count,
    })
}

/// Validates and extracts finite values from a single numeric slice (dropping NaNs).
pub fn clean_single_series(
    values: &[f64],
    min_required: usize,
) -> ScientificResult<(Vec<f64>, usize)> {
    let mut cleaned = Vec::with_capacity(values.len());
    let mut dropped = 0usize;

    for (idx, &v) in values.iter().enumerate() {
        if v.is_nan() {
            dropped += 1;
            continue;
        }
        if !v.is_finite() {
            return Err(ScientificError::NonFiniteValue {
                index: idx,
                description: format!("Value at index {idx} is infinite ({v})"),
            });
        }
        cleaned.push(v);
    }

    if cleaned.len() < min_required {
        return Err(ScientificError::InsufficientData {
            required: min_required,
            actual: cleaned.len(),
        });
    }

    Ok((cleaned, dropped))
}

/// Checks if all values in `x` are effectively constant within tolerance.
pub fn is_constant_series(x: &[f64], epsilon: f64) -> bool {
    if x.len() <= 1 {
        return true;
    }
    let mut min_val = f64::INFINITY;
    let mut max_val = f64::NEG_INFINITY;
    for &v in x {
        if v < min_val {
            min_val = v;
        }
        if v > max_val {
            max_val = v;
        }
    }
    let scale = min_val.abs().max(max_val.abs()).max(1.0);
    (max_val - min_val) <= epsilon * scale
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_nan_and_preserves_indices() {
        let x = vec![1.0, f64::NAN, 3.0, 4.0];
        let y = vec![2.0, 4.0, f64::NAN, 8.0];
        let cleaned = clean_paired_data(&x, &y, None, None, 2).expect("valid");
        assert_eq!(cleaned.x, vec![1.0, 4.0]);
        assert_eq!(cleaned.y, vec![2.0, 8.0]);
        assert_eq!(cleaned.original_indices, vec![0, 3]);
        assert_eq!(cleaned.dropped_count, 2);
    }

    #[test]
    fn rejects_infinite_values() {
        let x = vec![1.0, f64::INFINITY, 3.0];
        let y = vec![2.0, 4.0, 6.0];
        let err = clean_paired_data(&x, &y, None, None, 2).expect_err("should fail");
        assert!(matches!(
            err,
            ScientificError::NonFiniteValue { index: 1, .. }
        ));
    }

    #[test]
    fn detects_constant_series() {
        assert!(is_constant_series(&[5.0, 5.0, 5.0], DEFAULT_EPSILON));
        assert!(!is_constant_series(&[5.0, 5.1, 5.2], DEFAULT_EPSILON));
    }
}
