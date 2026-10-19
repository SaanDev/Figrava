use crate::models::{DescriptiveStats, FitDiagnostics, FitParameter, PairedCorrelation};
use scientific_core::{
    clean_paired_data, clean_single_series, is_constant_series, ScientificError, ScientificResult,
};
use statrs::distribution::{ContinuousCDF, StudentsT};

/// Computes linear-interpolated quantile $q \in [0, 1]$ on an already-sorted non-empty slice.
fn quantile_sorted(sorted: &[f64], q: f64) -> f64 {
    if sorted.len() == 1 {
        return sorted[0];
    }
    let pos = q.clamp(0.0, 1.0) * ((sorted.len() - 1) as f64);
    let lower = pos.floor() as usize;
    let upper = pos.ceil() as usize;
    if lower == upper {
        sorted[lower]
    } else {
        let weight = pos - (lower as f64);
        sorted[lower] * (1.0 - weight) + sorted[upper] * weight
    }
}

/// Computes comprehensive descriptive statistics for a numeric series.
pub fn compute_descriptive_stats(values: &[f64]) -> ScientificResult<DescriptiveStats> {
    let (mut cleaned, missing_count) = clean_single_series(values, 1)?;
    let n = cleaned.len();
    let n_f = n as f64;

    let sum: f64 = cleaned.iter().sum();
    let mean = sum / n_f;

    // Two-pass corrected variance for numerical stability
    let (variance, std_dev, sem, skewness) = if n >= 2 {
        let sum_sq: f64 = cleaned.iter().map(|&v| (v - mean).powi(2)).sum();
        let sum_corr: f64 = cleaned.iter().map(|&v| v - mean).sum();
        let var = ((sum_sq - (sum_corr * sum_corr) / n_f) / ((n - 1) as f64)).max(0.0);
        let sd = var.sqrt();
        let sem_val = sd / n_f.sqrt();
        let skew = if n >= 3 && sd > 1e-15 {
            let m3 = cleaned
                .iter()
                .map(|&v| ((v - mean) / sd).powi(3))
                .sum::<f64>();
            (n_f / (((n - 1) as f64) * ((n - 2) as f64))) * m3
        } else {
            0.0
        };
        (var, sd, sem_val, skew)
    } else {
        (0.0, 0.0, 0.0, 0.0)
    };

    cleaned.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let min = cleaned[0];
    let max = cleaned[n - 1];
    let q1 = quantile_sorted(&cleaned, 0.25);
    let median = quantile_sorted(&cleaned, 0.50);
    let q3 = quantile_sorted(&cleaned, 0.75);
    let iqr = q3 - q1;

    Ok(DescriptiveStats {
        count: n,
        missing_count,
        mean,
        variance,
        std_dev,
        sem,
        min,
        q1,
        median,
        q3,
        iqr,
        max,
        sum,
        skewness,
    })
}

/// Computes paired Pearson correlation $r$, $R^2$, and sample covariance.
pub fn compute_paired_correlation(x: &[f64], y: &[f64]) -> ScientificResult<PairedCorrelation> {
    let cleaned = clean_paired_data(x, y, None, None, 2)?;
    if is_constant_series(&cleaned.x, 1e-12) {
        return Err(ScientificError::DegenerateData(
            "X series is constant; correlation is undefined".to_string(),
        ));
    }
    if is_constant_series(&cleaned.y, 1e-12) {
        return Err(ScientificError::DegenerateData(
            "Y series is constant; correlation is undefined".to_string(),
        ));
    }

    let n = cleaned.x.len();
    let n_f = n as f64;
    let mean_x = cleaned.x.iter().sum::<f64>() / n_f;
    let mean_y = cleaned.y.iter().sum::<f64>() / n_f;

    let mut s_xx = 0.0;
    let mut s_yy = 0.0;
    let mut s_xy = 0.0;
    for (&xi, &yi) in cleaned.x.iter().zip(cleaned.y.iter()) {
        let dx = xi - mean_x;
        let dy = yi - mean_y;
        s_xx += dx * dx;
        s_yy += dy * dy;
        s_xy += dx * dy;
    }

    let covariance = s_xy / ((n - 1) as f64);
    let pearson_r = (s_xy / (s_xx * s_yy).sqrt()).clamp(-1.0, 1.0);

    Ok(PairedCorrelation {
        observations: n,
        dropped_missing: cleaned.dropped_count,
        pearson_r,
        r_squared: pearson_r * pearson_r,
        covariance,
    })
}

/// Builds a `FitParameter` with Student-t p-value and 95% confidence interval for `dof` degrees of freedom.
pub fn build_fit_parameter(name: String, value: f64, std_error: f64, dof: usize) -> FitParameter {
    let t_value = if std_error > 1e-15 && std_error.is_finite() {
        value / std_error
    } else {
        0.0
    };

    let (p_value, t_crit) = if dof >= 1 {
        if let Ok(dist) = StudentsT::new(0.0, 1.0, dof as f64) {
            let p = if t_value.is_finite() {
                2.0 * (1.0 - dist.cdf(t_value.abs()))
            } else {
                0.0
            };
            let tc = dist.inverse_cdf(0.975);
            (p.clamp(0.0, 1.0), tc)
        } else {
            (0.0, 1.96)
        }
    } else {
        (1.0, 0.0)
    };

    let half_width = if std_error.is_finite() {
        t_crit * std_error
    } else {
        0.0
    };

    FitParameter {
        name,
        value,
        std_error,
        t_value,
        p_value,
        ci_lower_95: value - half_width,
        ci_upper_95: value + half_width,
    }
}

/// Computes comprehensive fit diagnostics and standardized residuals.
#[allow(clippy::too_many_arguments)]
pub fn compute_fit_diagnostics(
    obs_y: &[f64],
    fitted_y: &[f64],
    y_err: Option<&[f64]>,
    param_count: usize,
    dropped_missing: usize,
    converged: bool,
    iterations: usize,
    condition_number: f64,
    mut warnings: Vec<String>,
) -> (FitDiagnostics, Vec<f64>, Vec<f64>) {
    let n = obs_y.len();
    let n_f = n as f64;
    let dof = n.saturating_sub(param_count);

    let mean_y = obs_y.iter().sum::<f64>() / n_f.max(1.0);
    let mut rss = 0.0;
    let mut tss = 0.0;
    let mut residuals = Vec::with_capacity(n);

    for (&yi, &y_hat) in obs_y.iter().zip(fitted_y.iter()) {
        let r = yi - y_hat;
        residuals.push(r);
        rss += r * r;
        let dy = yi - mean_y;
        tss += dy * dy;
    }

    let r_squared = if tss > 1e-15 {
        (1.0 - rss / tss).clamp(-1.0, 1.0)
    } else if rss <= 1e-15 {
        1.0
    } else {
        0.0
    };

    let adj_r_squared = if dof >= 1 && n > 1 && tss > 1e-15 {
        1.0 - (1.0 - r_squared) * ((n - 1) as f64) / (dof as f64)
    } else {
        r_squared
    };

    let rmse = (rss / n_f.max(1.0)).sqrt();
    let residual_std_error = if dof >= 1 {
        (rss / (dof as f64)).sqrt()
    } else {
        rmse
    };

    let reduced_chi_square = y_err.and_then(|errs| {
        if dof == 0 {
            return None;
        }
        let chi2: f64 = residuals
            .iter()
            .zip(errs.iter())
            .map(|(&r, &s)| (r / s).powi(2))
            .sum();
        Some(chi2 / (dof as f64))
    });

    // Akaike Information Criterion: N * ln(RSS / N) + 2 * k
    let aic = if rss > 1e-30 && n > 0 {
        n_f * (rss / n_f).ln() + 2.0 * (param_count as f64)
    } else {
        -f64::INFINITY
    };

    let scale = residual_std_error.max(1e-15);
    let standardized_residuals: Vec<f64> = residuals.iter().map(|&r| r / scale).collect();

    if condition_number > 1e8 {
        warnings.push(format!(
            "High design/Jacobian matrix condition number ({condition_number:.2e}); parameter estimates may be collinear or ill-conditioned."
        ));
    }

    if converged && r_squared < 0.5 && tss > 1e-12 {
        warnings.push(format!(
            "Optimization converged, but statistical goodness-of-fit is low (R² = {r_squared:.4}). Inspect residuals for model misspecification."
        ));
    }

    if let Some(chi2_nu) = reduced_chi_square {
        if chi2_nu > 5.0 {
            warnings.push(format!(
                "Reduced chi-square (χ²_ν = {chi2_nu:.2}) is significantly greater than 1, indicating either underestimated measurement uncertainties or an inadequate model."
            ));
        }
    }

    let diagnostics = FitDiagnostics {
        observations: n,
        dropped_missing,
        degrees_of_freedom: dof,
        rss,
        tss,
        r_squared,
        adj_r_squared,
        rmse,
        residual_std_error,
        reduced_chi_square,
        aic,
        converged,
        iterations,
        condition_number,
        warnings,
    };

    (diagnostics, residuals, standardized_residuals)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_accurate_descriptive_statistics() {
        let data = vec![2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0, f64::NAN];
        let stats = compute_descriptive_stats(&data).expect("stats");
        assert_eq!(stats.count, 8);
        assert_eq!(stats.missing_count, 1);
        assert!((stats.mean - 5.0).abs() < 1e-12);
        // Sample variance of [2,4,4,4,5,5,7,9]: sum((x-5)^2) = 9+1+1+1+0+0+4+16 = 32; 32/7 = 4.571428571428571
        assert!((stats.variance - 32.0 / 7.0).abs() < 1e-12);
        assert!((stats.median - 4.5).abs() < 1e-12);
        assert!((stats.min - 2.0).abs() < 1e-12);
        assert!((stats.max - 9.0).abs() < 1e-12);
    }

    #[test]
    fn computes_paired_correlation() {
        let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let y = vec![2.0, 4.0, 6.0, 8.0, 10.0];
        let corr = compute_paired_correlation(&x, &y).expect("corr");
        assert_eq!(corr.observations, 5);
        assert!((corr.pearson_r - 1.0).abs() < 1e-12);
        assert!((corr.r_squared - 1.0).abs() < 1e-12);
    }
}
