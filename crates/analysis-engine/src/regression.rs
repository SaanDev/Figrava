use crate::models::{AnalysisResult, FitConfiguration, FitModelKind};
use crate::statistics::{build_fit_parameter, compute_fit_diagnostics};
use nalgebra::{DMatrix, DVector};
use scientific_core::{
    clean_paired_data, is_constant_series, AnalysisId, CleanedPairedData, ScientificError,
    ScientificResult,
};

pub fn generate_curve_grid(x: &[f64], points: usize) -> Vec<f64> {
    let n = points.max(2);
    let min_x = x.iter().copied().fold(f64::INFINITY, f64::min);
    let max_x = x.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let span = max_x - min_x;
    (0..n)
        .map(|i| min_x + span * (i as f64) / ((n - 1) as f64))
        .collect()
}

/// Performs numerically stable Linear Least Squares ($y = m x + c$) with optional instrumental weights.
pub fn fit_linear(
    config: &FitConfiguration,
    raw_x: &[f64],
    raw_y: &[f64],
    raw_y_err: Option<&[f64]>,
) -> ScientificResult<AnalysisResult> {
    let cleaned = clean_paired_data(
        raw_x,
        raw_y,
        if config.use_weights { raw_y_err } else { None },
        config.x_range,
        2,
    )?;

    if is_constant_series(&cleaned.x, 1e-12) {
        return Err(ScientificError::DegenerateData(
            "X values are constant; linear regression slope is undefined".to_string(),
        ));
    }

    let n = cleaned.x.len();
    let dof = n.saturating_sub(2);

    // Compute weights (either 1 / sigma_i^2 or uniform 1.0)
    let weights: Vec<f64> = match (&cleaned.y_err, config.use_weights) {
        (Some(errs), true) => errs.iter().map(|&s| 1.0 / (s * s)).collect(),
        _ => vec![1.0; n],
    };

    let sum_w: f64 = weights.iter().sum();
    let mean_x: f64 = cleaned
        .x
        .iter()
        .zip(weights.iter())
        .map(|(&xi, &wi)| wi * xi)
        .sum::<f64>()
        / sum_w;
    let mean_y: f64 = cleaned
        .y
        .iter()
        .zip(weights.iter())
        .map(|(&yi, &wi)| wi * yi)
        .sum::<f64>()
        / sum_w;

    let mut s_xx = 0.0;
    let mut s_xy = 0.0;
    for ((&xi, &yi), &w) in cleaned.x.iter().zip(cleaned.y.iter()).zip(weights.iter()) {
        let dx = xi - mean_x;
        let dy = yi - mean_y;
        s_xx += w * dx * dx;
        s_xy += w * dx * dy;
    }

    if s_xx <= 1e-30 {
        return Err(ScientificError::DegenerateData(
            "Weighted sum of squared X deviations is zero".to_string(),
        ));
    }

    let slope = s_xy / s_xx;
    let intercept = mean_y - slope * mean_x;

    let fitted_y: Vec<f64> = cleaned.x.iter().map(|&xi| slope * xi + intercept).collect();

    let effective_err = cleaned.y_err.as_deref();

    let (diagnostics, residuals, standardized_residuals) = compute_fit_diagnostics(
        &cleaned.y,
        &fitted_y,
        effective_err,
        2,
        cleaned.dropped_count,
        true,
        1,
        1.0,
        Vec::new(),
    );

    // Variance scaling factor for parameter standard errors
    let scale_var = if dof >= 1 {
        if config.use_weights && cleaned.y_err.is_some() {
            // Scale by reduced chi-square so SE reflects actual scatter relative to weights
            diagnostics.reduced_chi_square.unwrap_or(1.0)
        } else {
            diagnostics.rss / (dof as f64)
        }
    } else {
        0.0
    };

    let se_slope = (scale_var / s_xx).max(0.0).sqrt();
    let se_intercept = (scale_var * (1.0 / sum_w + (mean_x * mean_x) / s_xx))
        .max(0.0)
        .sqrt();

    let parameters = vec![
        build_fit_parameter("m".to_string(), slope, se_slope, dof),
        build_fit_parameter("c".to_string(), intercept, se_intercept, dof),
    ];

    let curve_x = generate_curve_grid(&cleaned.x, config.curve_points);
    let curve_y: Vec<f64> = curve_x.iter().map(|&x| slope * x + intercept).collect();
    let half_band = 1.96 * diagnostics.residual_std_error;
    let confidence_band_upper = curve_y.iter().map(|&y| y + half_band).collect();
    let confidence_band_lower = curve_y.iter().map(|&y| y - half_band).collect();

    let sign_c = if intercept >= 0.0 { "+" } else { "-" };
    let fitted_equation = format!("y = {:.6} * x {} {:.6}", slope, sign_c, intercept.abs());

    Ok(AnalysisResult {
        id: AnalysisId::new(),
        name: "Linear Fit".to_string(),
        config: config.clone(),
        formula_template: FitModelKind::Linear.formula_template(),
        fitted_equation,
        parameters,
        diagnostics,
        obs_x: cleaned.x,
        obs_y: cleaned.y,
        fitted_y,
        residuals,
        standardized_residuals,
        curve_x,
        curve_y,
        confidence_band_upper,
        confidence_band_lower,
    })
}

fn binomial_coeff(n: usize, k: usize) -> f64 {
    if k > n {
        return 0.0;
    }
    let mut res = 1.0;
    for i in 0..k {
        res *= (n - i) as f64 / ((i + 1) as f64);
    }
    res
}

/// Performs numerically stable Polynomial Least Squares ($y = a_0 + a_1 x + \dots + a_d x^d$)
/// by centering and scaling $x \mapsto u = (x - \mu_x) / s_x$, solving via SVD, and transforming
/// both coefficients and the covariance matrix back to the unscaled basis.
pub fn fit_polynomial(
    config: &FitConfiguration,
    degree: usize,
    raw_x: &[f64],
    raw_y: &[f64],
    raw_y_err: Option<&[f64]>,
) -> ScientificResult<AnalysisResult> {
    if degree == 0 || degree > 8 {
        return Err(ScientificError::InvalidParameter {
            name: "degree".to_string(),
            reason: format!("Polynomial degree must be between 1 and 8, got {degree}"),
        });
    }

    let param_count = degree + 1;
    let CleanedPairedData {
        x: obs_x,
        y: obs_y,
        y_err: obs_err,
        dropped_count,
        ..
    } = clean_paired_data(
        raw_x,
        raw_y,
        if config.use_weights { raw_y_err } else { None },
        config.x_range,
        param_count,
    )?;

    if is_constant_series(&obs_x, 1e-12) {
        return Err(ScientificError::DegenerateData(
            "X values are constant; polynomial regression is singular".to_string(),
        ));
    }

    let n = obs_x.len();
    let dof = n.saturating_sub(param_count);

    // Center and scale X into [-1, 1] range for Vandermonde numerical stability
    let min_x = obs_x.iter().copied().fold(f64::INFINITY, f64::min);
    let max_x = obs_x.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let mu_x = 0.5 * (min_x + max_x);
    let scale_x = (0.5 * (max_x - min_x)).max(1e-12);

    let sqrt_weights: Vec<f64> = match (&obs_err, config.use_weights) {
        (Some(errs), true) => errs.iter().map(|&s| 1.0 / s).collect(),
        _ => vec![1.0; n],
    };

    // Build weighted Vandermonde matrix in scaled variable u = (x - mu_x) / scale_x
    let mut design = DMatrix::<f64>::zeros(n, param_count);
    let mut weighted_y = DVector::<f64>::zeros(n);

    for i in 0..n {
        let u = (obs_x[i] - mu_x) / scale_x;
        let sw = sqrt_weights[i];
        let mut u_pow = 1.0;
        for j in 0..param_count {
            design[(i, j)] = sw * u_pow;
            u_pow *= u;
        }
        weighted_y[i] = sw * obs_y[i];
    }

    let svd = design.svd(true, true);
    let s_vals = &svd.singular_values;
    let s_max = s_vals.iter().copied().fold(0.0_f64, f64::max);
    let s_min = s_vals.iter().copied().fold(f64::INFINITY, f64::min);
    let condition_number = if s_min > 1e-30 {
        s_max / s_min
    } else {
        f64::INFINITY
    };

    let tol = s_max * (n as f64) * f64::EPSILON;
    let coeffs_scaled = svd.solve(&weighted_y, tol).map_err(|e| {
        ScientificError::DegenerateData(format!("SVD polynomial solve failed: {e}"))
    })?;

    // Compute unscaled covariance matrix in u-space: Cov(a_tilde) = V * S^{-2} * V^T
    let v_t = svd
        .v_t
        .as_ref()
        .ok_or_else(|| ScientificError::DegenerateData("SVD missing V^T matrix".to_string()))?;
    let v_mat = v_t.transpose();
    let mut s_inv_sq = DMatrix::<f64>::zeros(param_count, param_count);
    for j in 0..param_count {
        if s_vals[j] > tol {
            s_inv_sq[(j, j)] = 1.0 / (s_vals[j] * s_vals[j]);
        }
    }
    let cov_scaled = &v_mat * s_inv_sq * v_t;

    // Transform from u-space to original x-space via upper-triangular transformation T:
    // a_j = sum_{k=j}^d a_tilde_k * C(k, j) * (-mu_x)^{k-j} / scale_x^k
    let mut trans = DMatrix::<f64>::zeros(param_count, param_count);
    for j in 0..param_count {
        for k in j..param_count {
            let binom = binomial_coeff(k, j);
            let shift_pow = (-mu_x).powi((k - j) as i32);
            let scale_pow = scale_x.powi(k as i32);
            trans[(j, k)] = binom * shift_pow / scale_pow;
        }
    }

    let coeffs = &trans * &coeffs_scaled;
    let cov_unscaled = &trans * cov_scaled * trans.transpose();

    // Evaluate fitted values using Horner's method
    let eval_poly = |x_val: f64| -> f64 {
        let mut acc = 0.0;
        for k in (0..param_count).rev() {
            acc = acc * x_val + coeffs[k];
        }
        acc
    };

    let fitted_y: Vec<f64> = obs_x.iter().map(|&xi| eval_poly(xi)).collect();

    let (diagnostics, residuals, standardized_residuals) = compute_fit_diagnostics(
        &obs_y,
        &fitted_y,
        obs_err.as_deref(),
        param_count,
        dropped_count,
        true,
        1,
        condition_number,
        Vec::new(),
    );

    let scale_var = if dof >= 1 {
        if config.use_weights && obs_err.is_some() {
            diagnostics.reduced_chi_square.unwrap_or(1.0)
        } else {
            diagnostics.rss / (dof as f64)
        }
    } else {
        0.0
    };

    let mut parameters = Vec::with_capacity(param_count);
    let mut eq_terms = Vec::with_capacity(param_count);

    for k in 0..param_count {
        let val = coeffs[k];
        let se = (cov_unscaled[(k, k)] * scale_var).max(0.0).sqrt();
        parameters.push(build_fit_parameter(format!("a{k}"), val, se, dof));

        if k == 0 {
            eq_terms.push(format!("{val:.6}"));
        } else if k == 1 {
            eq_terms.push(format!("{val:+.6} * x"));
        } else {
            eq_terms.push(format!("{val:+.6} * x^{k}"));
        }
    }

    let curve_x = generate_curve_grid(&obs_x, config.curve_points);
    let curve_y: Vec<f64> = curve_x.iter().map(|&x| eval_poly(x)).collect();
    let half_band = 1.96 * diagnostics.residual_std_error;
    let confidence_band_upper = curve_y.iter().map(|&y| y + half_band).collect();
    let confidence_band_lower = curve_y.iter().map(|&y| y - half_band).collect();

    Ok(AnalysisResult {
        id: AnalysisId::new(),
        name: format!("Polynomial Fit (Degree {degree})"),
        config: config.clone(),
        formula_template: FitModelKind::Polynomial { degree }.formula_template(),
        fitted_equation: format!("y = {}", eq_terms.join(" ")),
        parameters,
        diagnostics,
        obs_x,
        obs_y,
        fitted_y,
        residuals,
        standardized_residuals,
        curve_x,
        curve_y,
        confidence_band_upper,
        confidence_band_lower,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use scientific_core::{ColumnId, DatasetId};

    #[test]
    fn recovers_exact_straight_line() {
        let x = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
        let y: Vec<f64> = x.iter().map(|&xi| 3.5 * xi - 1.25).collect();
        let cfg = FitConfiguration::new(
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            FitModelKind::Linear,
        );
        let res = fit_linear(&cfg, &x, &y, None).expect("linear fit");
        assert!((res.parameters[0].value - 3.5).abs() < 1e-12);
        assert!((res.parameters[1].value - (-1.25)).abs() < 1e-12);
        assert!((res.diagnostics.r_squared - 1.0).abs() < 1e-12);
        assert!(res.diagnostics.rmse < 1e-12);
    }

    #[test]
    fn recovers_polynomial_on_large_shifted_domain() {
        // Test numerical stability when X is shifted around 10,000
        // y = 2.0 - 0.5 * x + 0.001 * x^2
        let x: Vec<f64> = (0..=20).map(|i| 1000.0 + (i as f64) * 2.0).collect();
        let y: Vec<f64> = x
            .iter()
            .map(|&xi| 2.0 - 0.5 * xi + 0.001 * xi * xi)
            .collect();
        let cfg = FitConfiguration::new(
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            FitModelKind::Polynomial { degree: 2 },
        );
        let res = fit_polynomial(&cfg, 2, &x, &y, None).expect("poly fit");
        assert!((res.parameters[0].value - 2.0).abs() < 1e-7);
        assert!((res.parameters[1].value - (-0.5)).abs() < 1e-9);
        assert!((res.parameters[2].value - 0.001).abs() < 1e-11);
        assert!((res.diagnostics.r_squared - 1.0).abs() < 1e-12);
    }

    #[test]
    fn rejects_constant_x_in_linear_fit() {
        let x = vec![4.0, 4.0, 4.0, 4.0];
        let y = vec![1.0, 2.0, 3.0, 4.0];
        let cfg = FitConfiguration::new(
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            FitModelKind::Linear,
        );
        let err = fit_linear(&cfg, &x, &y, None).expect_err("constant x");
        assert!(matches!(err, ScientificError::DegenerateData(_)));
    }
}
