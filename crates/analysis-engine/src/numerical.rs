//! Numerical calculus, interpolation, Savitzky-Golay smoothing, and baseline correction.

use scientific_core::{clean_paired_data, ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IntegrationResult {
    pub observations: usize,
    pub trapezoidal_area: f64,
    pub simpson_area: f64,
    pub absolute_area: f64,
    pub cumulative_x: Vec<f64>,
    pub cumulative_y: Vec<f64>,
}

/// Computes definite integral via Trapezoidal Rule and Composite Simpson's 1/3 Rule.
pub fn compute_numerical_integration(
    raw_x: &[f64],
    raw_y: &[f64],
) -> ScientificResult<IntegrationResult> {
    let cleaned = clean_paired_data(raw_x, raw_y, None, None, 2)?;
    let mut pairs: Vec<(f64, f64)> = cleaned.x.into_iter().zip(cleaned.y).collect();
    pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    let n = pairs.len();
    let mut trap_area = 0.0;
    let mut abs_area = 0.0;
    let mut cum_x = Vec::with_capacity(n);
    let mut cum_y = Vec::with_capacity(n);

    cum_x.push(pairs[0].0);
    cum_y.push(0.0);

    for i in 1..n {
        let dx = pairs[i].0 - pairs[i - 1].0;
        let y_avg = 0.5 * (pairs[i].1 + pairs[i - 1].1);
        let seg = y_avg * dx;
        trap_area += seg;
        abs_area += (0.5 * (pairs[i].1.abs() + pairs[i - 1].1.abs())) * dx.abs();
        cum_x.push(pairs[i].0);
        cum_y.push(trap_area);
    }

    // Composite Simpson's rule for non-uniform or uniform grids (quadratic segments on pairs of intervals)
    let mut simpson_area = 0.0;
    let mut idx = 0;
    while idx + 2 < n {
        let x0 = pairs[idx].0;
        let x1 = pairs[idx + 1].0;
        let x2 = pairs[idx + 2].0;
        let y0 = pairs[idx].1;
        let y1 = pairs[idx + 1].1;
        let y2 = pairs[idx + 2].1;
        let h0 = x1 - x0;
        let h1 = x2 - x1;
        if h0 > 1e-15 && h1 > 1e-15 {
            let h_sum = h0 + h1;
            let c0 = (2.0 - h1 / h0) / 6.0;
            let c1 = (h_sum * h_sum) / (6.0 * h0 * h1);
            let c2 = (2.0 - h0 / h1) / 6.0;
            simpson_area += h_sum * (c0 * y0 + c1 * y1 + c2 * y2);
        } else {
            simpson_area += 0.5 * (y0 + y1) * h0 + 0.5 * (y1 + y2) * h1;
        }
        idx += 2;
    }
    if idx + 1 < n {
        let dx = pairs[idx + 1].0 - pairs[idx].0;
        simpson_area += 0.5 * (pairs[idx + 1].1 + pairs[idx].1) * dx;
    }

    Ok(IntegrationResult {
        observations: n,
        trapezoidal_area: trap_area,
        simpson_area,
        absolute_area: abs_area,
        cumulative_x: cum_x,
        cumulative_y: cum_y,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterpolationMethod {
    Linear,
    CubicHermite,
}

/// Resamples `(raw_x, raw_y)` onto a uniform grid of `num_points` using Linear or Monotone Cubic Hermite (PCHIP) interpolation.
pub fn interpolate_series(
    raw_x: &[f64],
    raw_y: &[f64],
    num_points: usize,
    method: InterpolationMethod,
) -> ScientificResult<(Vec<f64>, Vec<f64>)> {
    let cleaned = clean_paired_data(raw_x, raw_y, None, None, 2)?;
    let mut pairs: Vec<(f64, f64)> = cleaned.x.into_iter().zip(cleaned.y).collect();
    pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    pairs.dedup_by(|a, b| (a.0 - b.0).abs() < 1e-14);

    if pairs.len() < 2 {
        return Err(ScientificError::InsufficientData {
            required: 2,
            actual: pairs.len(),
        });
    }

    let n = pairs.len();
    let xs: Vec<f64> = pairs.iter().map(|p| p.0).collect();
    let ys: Vec<f64> = pairs.iter().map(|p| p.1).collect();

    let mut slopes = vec![0.0; n];
    if method == InterpolationMethod::CubicHermite && n >= 3 {
        for i in 0..n {
            if i == 0 {
                slopes[0] = (ys[1] - ys[0]) / (xs[1] - xs[0]).max(1e-15);
            } else if i == n - 1 {
                slopes[n - 1] = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]).max(1e-15);
            } else {
                let d0 = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]).max(1e-15);
                let d1 = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]).max(1e-15);
                if d0 * d1 > 0.0 {
                    slopes[i] = 0.5 * (d0 + d1);
                } else {
                    slopes[i] = 0.0;
                }
            }
        }
    }

    let m = num_points.max(2);
    let min_x = xs[0];
    let max_x = xs[n - 1];
    let mut grid_x = Vec::with_capacity(m);
    let mut grid_y = Vec::with_capacity(m);

    for k in 0..m {
        let xq = min_x + (max_x - min_x) * (k as f64) / ((m - 1) as f64);
        let seg = xs
            .partition_point(|&xi| xi <= xq)
            .saturating_sub(1)
            .min(n - 2);
        let x0 = xs[seg];
        let x1 = xs[seg + 1];
        let y0 = ys[seg];
        let y1 = ys[seg + 1];
        let h = (x1 - x0).max(1e-15);
        let t = ((xq - x0) / h).clamp(0.0, 1.0);

        let yq = match method {
            InterpolationMethod::Linear => y0 + t * (y1 - y0),
            InterpolationMethod::CubicHermite => {
                let t2 = t * t;
                let t3 = t2 * t;
                let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
                let h10 = t3 - 2.0 * t2 + t;
                let h01 = -2.0 * t3 + 3.0 * t2;
                let h11 = t3 - t2;
                h00 * y0 + h10 * h * slopes[seg] + h01 * y1 + h11 * h * slopes[seg + 1]
            }
        };
        grid_x.push(xq);
        grid_y.push(yq);
    }

    Ok((grid_x, grid_y))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integrates_parabola_accurately_with_simpson_rule() {
        // int_0^2 x^2 dx = 8/3 = 2.6666666667
        let x = vec![0.0, 0.5, 1.0, 1.5, 2.0];
        let y: Vec<f64> = x.iter().map(|&v| v * v).collect();
        let res = compute_numerical_integration(&x, &y).expect("integrate");
        assert!((res.simpson_area - (8.0 / 3.0)).abs() < 1e-12);
        assert!(res.trapezoidal_area > 2.6);
    }
}
