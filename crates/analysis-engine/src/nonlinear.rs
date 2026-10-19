use crate::custom_fit::eval_custom_expression;
use crate::models::{AnalysisResult, FitConfiguration, FitModelKind};
use crate::regression::generate_curve_grid;
use crate::statistics::{build_fit_parameter, compute_fit_diagnostics};
use nalgebra::{DMatrix, DVector};
use scientific_core::{
    clean_paired_data, is_constant_series, AnalysisId, ScientificError, ScientificResult,
};

/// Evaluates the nonlinear model $f(x; \theta)$ at a single point `x`.
pub fn evaluate_nonlinear_model(model: &FitModelKind, params: &[f64], x: f64) -> f64 {
    match model {
        FitModelKind::Exponential => {
            let a = params[0];
            let b = params[1];
            let c = params[2];
            a * (b * x).clamp(-500.0, 500.0).exp() + c
        }
        FitModelKind::Gaussian => {
            let a = params[0];
            let mu = params[1];
            let sigma = params[2].abs().max(1e-12);
            let c = params[3];
            let z = (x - mu) / sigma;
            a * (-0.5 * z * z).clamp(-500.0, 0.0).exp() + c
        }
        FitModelKind::Lorentzian => {
            let a = params[0];
            let x0 = params[1];
            let gamma = params[2].abs().max(1e-12);
            let c = params[3];
            let dx = x - x0;
            let g2 = gamma * gamma;
            a * g2 / (dx * dx + g2) + c
        }
        FitModelKind::MultiGaussian { peaks } => {
            let k = (*peaks).clamp(1, 5);
            let mut sum = *params.last().unwrap_or(&0.0);
            for p in 0..k {
                let base = p * 3;
                if base + 2 < params.len() {
                    let a = params[base];
                    let mu = params[base + 1];
                    let sigma = params[base + 2].abs().max(1e-12);
                    let z = (x - mu) / sigma;
                    sum += a * (-0.5 * z * z).clamp(-500.0, 0.0).exp();
                }
            }
            sum
        }
        FitModelKind::MultiLorentzian { peaks } => {
            let k = (*peaks).clamp(1, 5);
            let mut sum = *params.last().unwrap_or(&0.0);
            for p in 0..k {
                let base = p * 3;
                if base + 2 < params.len() {
                    let a = params[base];
                    let x0 = params[base + 1];
                    let gamma = params[base + 2].abs().max(1e-12);
                    let dx = x - x0;
                    let g2 = gamma * gamma;
                    sum += a * g2 / (dx * dx + g2);
                }
            }
            sum
        }
        FitModelKind::CustomEquation {
            expression,
            parameters,
        } => eval_custom_expression(expression, x, parameters, params).unwrap_or(0.0),
        FitModelKind::Linear => params[0] * x + params[1],
        FitModelKind::Polynomial { .. } => {
            let mut acc = 0.0;
            for &coeff in params.iter().rev() {
                acc = acc * x + coeff;
            }
            acc
        }
    }
}

/// Evaluates the Jacobian row $\nabla_\theta f(x; \theta)$ at `x` (analytic for 1-peak models, central finite differences for multi-peak/custom).
fn evaluate_jacobian_row(model: &FitModelKind, params: &[f64], x: f64, row_out: &mut [f64]) {
    match model {
        FitModelKind::Exponential => {
            let a = params[0];
            let b = params[1];
            let exp_bx = (b * x).clamp(-500.0, 500.0).exp();
            row_out[0] = exp_bx;
            row_out[1] = a * x * exp_bx;
            row_out[2] = 1.0;
        }
        FitModelKind::Gaussian => {
            let a = params[0];
            let mu = params[1];
            let sigma = params[2].abs().max(1e-12);
            let dx = x - mu;
            let sigma2 = sigma * sigma;
            let exp_term = (-0.5 * dx * dx / sigma2).clamp(-500.0, 0.0).exp();
            row_out[0] = exp_term;
            row_out[1] = a * exp_term * (dx / sigma2);
            row_out[2] = a * exp_term * (dx * dx / (sigma2 * sigma));
            row_out[3] = 1.0;
        }
        FitModelKind::Lorentzian => {
            let a = params[0];
            let x0 = params[1];
            let gamma = params[2].abs().max(1e-12);
            let dx = x - x0;
            let dx2 = dx * dx;
            let g2 = gamma * gamma;
            let denom = (dx2 + g2).max(1e-24);
            let denom2 = denom * denom;
            row_out[0] = g2 / denom;
            row_out[1] = 2.0 * a * g2 * dx / denom2;
            row_out[2] = 2.0 * a * gamma * dx2 / denom2;
            row_out[3] = 1.0;
        }
        _ => {
            let mut perturbed = params.to_vec();
            for j in 0..params.len() {
                let p_orig = params[j];
                let h = (p_orig.abs() * 1e-6).max(1e-7);
                perturbed[j] = p_orig + h;
                let f_plus = evaluate_nonlinear_model(model, &perturbed, x);
                perturbed[j] = p_orig - h;
                let f_minus = evaluate_nonlinear_model(model, &perturbed, x);
                perturbed[j] = p_orig;
                row_out[j] = (f_plus - f_minus) / (2.0 * h);
            }
        }
    }
}

/// Automatically estimates physically reasonable starting parameters from `(x, y)` observations.
pub fn estimate_initial_parameters(model: &FitModelKind, x: &[f64], y: &[f64]) -> Vec<f64> {
    let n = x.len();
    if n == 0 {
        return vec![1.0; model.parameter_names().len()];
    }

    let min_x = x.iter().copied().fold(f64::INFINITY, f64::min);
    let max_x = x.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let span_x = (max_x - min_x).abs().max(1.0);

    let min_y = y.iter().copied().fold(f64::INFINITY, f64::min);
    let max_y = y.iter().copied().fold(f64::NEG_INFINITY, f64::max);

    match model {
        FitModelKind::Exponential => {
            // Sort by X to inspect trend
            let mut pairs: Vec<(f64, f64)> = x.iter().copied().zip(y.iter().copied()).collect();
            pairs.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
            let y_first = pairs[0].1;
            let y_last = pairs[n - 1].1;

            // Estimate asymptote C slightly beyond the tail
            let c_est = if y_last.abs() < y_first.abs() {
                min_y - 0.05 * (max_y - min_y).abs()
            } else {
                min_y - 0.1 * (max_y - min_y).abs().max(1.0)
            };

            // Linear regression on ln(|y - C|) = ln(|A|) + B * x
            let mut sum_x = 0.0;
            let mut sum_ly = 0.0;
            let mut sum_xx = 0.0;
            let mut sum_xly = 0.0;
            let mut cnt = 0.0;
            for &(xi, yi) in &pairs {
                let diff = yi - c_est;
                if diff > 1e-12 {
                    let ly = diff.ln();
                    sum_x += xi;
                    sum_ly += ly;
                    sum_xx += xi * xi;
                    sum_xly += xi * ly;
                    cnt += 1.0;
                }
            }

            if cnt >= 2.0 {
                let denom = (cnt * sum_xx - sum_x * sum_x).abs().max(1e-12);
                let b_est =
                    ((cnt * sum_xly - sum_x * sum_ly) / denom).clamp(-50.0 / span_x, 50.0 / span_x);
                let ln_a = (sum_ly - b_est * sum_x) / cnt;
                let a_est = ln_a.clamp(-50.0, 50.0).exp();
                vec![a_est, b_est, c_est]
            } else {
                vec![(max_y - min_y).max(1.0), -1.0 / span_x, min_y]
            }
        }
        FitModelKind::Gaussian | FitModelKind::Lorentzian => {
            // Estimate baseline C from the minimum / edge values
            let mut sorted_y = y.to_vec();
            sorted_y.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let c_est = sorted_y[n / 10];
            let a_est = (max_y - c_est).max(1e-6);

            // Peak center at maximum Y
            let mut max_idx = 0;
            for (idx, &yi) in y.iter().enumerate() {
                if yi > y[max_idx] {
                    max_idx = idx;
                }
            }
            let center_est = x[max_idx];

            // Estimate half-maximum width
            let half_height = c_est + 0.5 * a_est;
            let mut left_x = min_x;
            let mut right_x = max_x;
            for (&xi, &yi) in x.iter().zip(y.iter()) {
                if yi >= half_height {
                    if xi < left_x || left_x == min_x {
                        left_x = xi;
                    }
                    if xi > right_x || right_x == max_x {
                        right_x = xi;
                    }
                }
            }
            let fwhm = (right_x - left_x).abs();
            let width_est = if fwhm > 1e-9 && fwhm < span_x {
                match model {
                    FitModelKind::Gaussian => (fwhm / 2.35482).max(span_x * 0.02),
                    _ => (0.5 * fwhm).max(span_x * 0.02),
                }
            } else {
                span_x * 0.15
            };

            vec![a_est, center_est, width_est, c_est]
        }
        FitModelKind::MultiGaussian { peaks } | FitModelKind::MultiLorentzian { peaks } => {
            let k = (*peaks).clamp(1, 5);
            let mut sorted_y = y.to_vec();
            sorted_y.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let c_est = sorted_y[n / 10];
            let amp_est = ((max_y - c_est) * 0.85).max(1.0);
            let width_est = (span_x / ((k as f64) * 4.0)).max(span_x * 0.03);
            let mut init = Vec::with_capacity(k * 3 + 1);
            for i in 1..=k {
                let frac = (i as f64) / ((k + 1) as f64);
                init.push(amp_est);
                init.push(min_x + frac * span_x);
                init.push(width_est);
            }
            init.push(c_est);
            init
        }
        FitModelKind::CustomEquation { .. } => vec![1.0; model.parameter_names().len()],
        FitModelKind::Linear => vec![1.0, 0.0],
        FitModelKind::Polynomial { degree } => vec![0.0; degree + 1],
    }
}

fn clamp_parameters(
    model: &FitModelKind,
    params: &mut [f64],
    lower_bounds: Option<&[f64]>,
    upper_bounds: Option<&[f64]>,
) {
    // Enforce positive width parameters for Gaussian (sigma) and Lorentzian (gamma)
    if matches!(model, FitModelKind::Gaussian | FitModelKind::Lorentzian) && params.len() >= 3 {
        params[2] = params[2].abs().max(1e-9);
    }
    if let FitModelKind::MultiGaussian { peaks } | FitModelKind::MultiLorentzian { peaks } = model {
        let k = (*peaks).clamp(1, 5);
        for p in 0..k {
            if p * 3 + 2 < params.len() {
                params[p * 3 + 2] = params[p * 3 + 2].abs().max(1e-9);
            }
        }
    }
    if let Some(lows) = lower_bounds {
        for (p, &lo) in params.iter_mut().zip(lows.iter()) {
            if lo.is_finite() && *p < lo {
                *p = lo;
            }
        }
    }
    if let Some(highs) = upper_bounds {
        for (p, &hi) in params.iter_mut().zip(highs.iter()) {
            if hi.is_finite() && *p > hi {
                *p = hi;
            }
        }
    }
}

/// Performs Levenberg-Marquardt nonlinear least-squares optimization.
pub fn fit_nonlinear(
    config: &FitConfiguration,
    raw_x: &[f64],
    raw_y: &[f64],
    raw_y_err: Option<&[f64]>,
) -> ScientificResult<AnalysisResult> {
    let param_names = config.model.parameter_names();
    let p_count = param_names.len();

    let cleaned = clean_paired_data(
        raw_x,
        raw_y,
        if config.use_weights { raw_y_err } else { None },
        config.x_range,
        p_count,
    )?;

    if is_constant_series(&cleaned.x, 1e-12) {
        return Err(ScientificError::DegenerateData(
            "X values are constant; nonlinear curve fit cannot proceed".to_string(),
        ));
    }

    let n = cleaned.x.len();
    let dof = n.saturating_sub(p_count);

    let mut params = match &config.initial_parameters {
        Some(init) if init.len() == p_count => init.clone(),
        Some(init) => {
            return Err(ScientificError::InvalidParameter {
                name: "initial_parameters".to_string(),
                reason: format!("Expected {p_count} initial parameters, got {}", init.len()),
            });
        }
        None => estimate_initial_parameters(&config.model, &cleaned.x, &cleaned.y),
    };

    clamp_parameters(
        &config.model,
        &mut params,
        config.lower_bounds.as_deref(),
        config.upper_bounds.as_deref(),
    );

    let sqrt_weights: Vec<f64> = match (&cleaned.y_err, config.use_weights) {
        (Some(errs), true) => errs.iter().map(|&s| 1.0 / s).collect(),
        _ => vec![1.0; n],
    };

    let compute_weighted_residuals = |theta: &[f64]| -> (DVector<f64>, f64) {
        let mut r_vec = DVector::<f64>::zeros(n);
        let mut cost = 0.0;
        for i in 0..n {
            let y_hat = evaluate_nonlinear_model(&config.model, theta, cleaned.x[i]);
            let rw = sqrt_weights[i] * (cleaned.y[i] - y_hat);
            r_vec[i] = rw;
            cost += rw * rw;
        }
        (r_vec, cost)
    };

    let compute_weighted_jacobian = |theta: &[f64]| -> DMatrix<f64> {
        let mut j_mat = DMatrix::<f64>::zeros(n, p_count);
        let mut row_buf = vec![0.0; p_count];
        for i in 0..n {
            evaluate_jacobian_row(&config.model, theta, cleaned.x[i], &mut row_buf);
            let sw = sqrt_weights[i];
            for k in 0..p_count {
                j_mat[(i, k)] = sw * row_buf[k];
            }
        }
        j_mat
    };

    let (mut r_vec, mut current_cost) = compute_weighted_residuals(&params);
    let mut lambda = 1e-3_f64;
    let max_iter = config.max_iterations.max(20);
    let tol = config.tolerance.max(1e-14);
    let mut converged = false;
    let mut iter = 0usize;

    while iter < max_iter {
        iter += 1;
        let j_mat = compute_weighted_jacobian(&params);
        let jtj = j_mat.transpose() * &j_mat;
        let gradient = j_mat.transpose() * &r_vec;

        // Check gradient norm convergence
        let grad_norm = gradient.amax();
        if grad_norm < tol {
            converged = true;
            break;
        }

        // Damped normal equations: (J^T W J + lambda * (diag(J^T W J) + I)) * step = J^T W r
        let mut damped = jtj.clone();
        for k in 0..p_count {
            let diag_scale = jtj[(k, k)].abs().max(1e-6);
            damped[(k, k)] += lambda * diag_scale;
        }

        let svd = damped.svd(true, true);
        let step = match svd.solve(&gradient, 1e-14) {
            Ok(s) => s,
            Err(_) => {
                lambda *= 10.0;
                if lambda > 1e12 {
                    break;
                }
                continue;
            }
        };

        let step_norm = step.norm();
        let param_norm = DVector::from_column_slice(&params).norm().max(1.0);
        if step_norm < tol * param_norm {
            converged = true;
            break;
        }

        let mut candidate: Vec<f64> = params
            .iter()
            .zip(step.iter())
            .map(|(&p, &dp)| p + dp)
            .collect();
        clamp_parameters(
            &config.model,
            &mut candidate,
            config.lower_bounds.as_deref(),
            config.upper_bounds.as_deref(),
        );

        let (cand_r, cand_cost) = compute_weighted_residuals(&candidate);
        if cand_cost < current_cost {
            let rel_improvement = (current_cost - cand_cost) / current_cost.max(1e-20);
            params = candidate;
            r_vec = cand_r;
            current_cost = cand_cost;
            lambda = (lambda * 0.2).max(1e-11);
            if rel_improvement < tol {
                converged = true;
                break;
            }
        } else {
            lambda *= 10.0;
            if lambda > 1e12 {
                break;
            }
        }
    }

    // Evaluate final Jacobian and covariance matrix (J^T W J)^{-1} via SVD
    let final_j = compute_weighted_jacobian(&params);
    let svd_j = final_j.svd(true, true);
    let s_vals = &svd_j.singular_values;
    let s_max = s_vals.iter().copied().fold(0.0_f64, f64::max);
    let s_min = s_vals.iter().copied().fold(f64::INFINITY, f64::min);
    let condition_number = if s_min > 1e-30 {
        (s_max / s_min).powi(2)
    } else {
        f64::INFINITY
    };

    let svd_tol = s_max * (n as f64) * f64::EPSILON;
    let cov_matrix = if let Some(v_t) = &svd_j.v_t {
        let v_mat = v_t.transpose();
        let mut s_inv_sq = DMatrix::<f64>::zeros(p_count, p_count);
        for k in 0..p_count {
            if s_vals[k] > svd_tol {
                s_inv_sq[(k, k)] = 1.0 / (s_vals[k] * s_vals[k]);
            }
        }
        &v_mat * s_inv_sq * v_t
    } else {
        DMatrix::<f64>::zeros(p_count, p_count)
    };

    let fitted_y: Vec<f64> = cleaned
        .x
        .iter()
        .map(|&xi| evaluate_nonlinear_model(&config.model, &params, xi))
        .collect();

    let mut warnings = Vec::new();
    if !converged {
        warnings.push(format!(
            "Levenberg-Marquardt optimizer did not reach strict convergence tolerance within {iter} iterations; inspect parameter uncertainties and initial guesses."
        ));
    }

    let (diagnostics, residuals, standardized_residuals) = compute_fit_diagnostics(
        &cleaned.y,
        &fitted_y,
        cleaned.y_err.as_deref(),
        p_count,
        cleaned.dropped_count,
        converged,
        iter,
        condition_number,
        warnings,
    );

    let scale_var = if dof >= 1 {
        if config.use_weights && cleaned.y_err.is_some() {
            diagnostics.reduced_chi_square.unwrap_or(1.0)
        } else {
            diagnostics.rss / (dof as f64)
        }
    } else {
        0.0
    };

    let parameters: Vec<_> = param_names
        .into_iter()
        .enumerate()
        .map(|(k, name)| {
            let se = (cov_matrix[(k, k)] * scale_var).max(0.0).sqrt();
            build_fit_parameter(name, params[k], se, dof)
        })
        .collect();

    let curve_x = generate_curve_grid(&cleaned.x, config.curve_points);
    let curve_y: Vec<f64> = curve_x
        .iter()
        .map(|&x| evaluate_nonlinear_model(&config.model, &params, x))
        .collect();
    let half_band = 1.96 * diagnostics.residual_std_error;
    let confidence_band_upper = curve_y.iter().map(|&y| y + half_band).collect();
    let confidence_band_lower = curve_y.iter().map(|&y| y - half_band).collect();

    let fitted_equation = match config.model {
        FitModelKind::Exponential => format!(
            "y = {:.5} * exp({:.5} * x) {:+.5}",
            params[0], params[1], params[2]
        ),
        FitModelKind::Gaussian => format!(
            "y = {:.5} * exp(-(x - {:.5})^2 / (2 * {:.5}^2)) {:+.5}",
            params[0], params[1], params[2], params[3]
        ),
        FitModelKind::Lorentzian => format!(
            "y = {:.5} * {:.5}^2 / ((x - {:.5})^2 + {:.5}^2) {:+.5}",
            params[0], params[2], params[1], params[2], params[3]
        ),
        _ => config.model.formula_template(),
    };

    Ok(AnalysisResult {
        id: AnalysisId::new(),
        name: config.model.display_name(),
        config: config.clone(),
        formula_template: config.model.formula_template(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use scientific_core::{ColumnId, DatasetId};

    #[test]
    fn recovers_gaussian_peak_parameters_automatically() {
        // Synthetic Gaussian: A = 500, mu = 540, sigma = 20, C = 100
        let x: Vec<f64> = (0..=40).map(|i| 460.0 + (i as f64) * 4.0).collect();
        let y: Vec<f64> = x
            .iter()
            .map(|&xi| {
                let z = (xi - 540.0) / 20.0;
                500.0 * (-0.5 * z * z).exp() + 100.0
            })
            .collect();

        let cfg = FitConfiguration::new(
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            FitModelKind::Gaussian,
        );
        let res = fit_nonlinear(&cfg, &x, &y, None).expect("gaussian fit");
        assert!(res.diagnostics.converged);
        assert!((res.parameters[0].value - 500.0).abs() < 1e-6);
        assert!((res.parameters[1].value - 540.0).abs() < 1e-6);
        assert!((res.parameters[2].value - 20.0).abs() < 1e-6);
        assert!((res.parameters[3].value - 100.0).abs() < 1e-6);
        assert!((res.diagnostics.r_squared - 1.0).abs() < 1e-10);
    }

    #[test]
    fn recovers_lorentzian_peak_parameters() {
        // Synthetic Lorentzian: A = 250, x0 = 10.0, gamma = 2.5, C = 15.0
        let x: Vec<f64> = (0..=40).map(|i| (i as f64) * 0.5).collect();
        let y: Vec<f64> = x
            .iter()
            .map(|&xi| 250.0 * 6.25 / ((xi - 10.0).powi(2) + 6.25) + 15.0)
            .collect();

        let cfg = FitConfiguration::new(
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            FitModelKind::Lorentzian,
        );
        let res = fit_nonlinear(&cfg, &x, &y, None).expect("lorentzian fit");
        assert!(res.diagnostics.converged);
        assert!((res.parameters[0].value - 250.0).abs() < 1e-5);
        assert!((res.parameters[1].value - 10.0).abs() < 1e-5);
        assert!((res.parameters[2].value - 2.5).abs() < 1e-5);
        assert!((res.parameters[3].value - 15.0).abs() < 1e-5);
    }

    #[test]
    fn recovers_exponential_decay_parameters() {
        // Synthetic Exponential: A = 120.0, B = -0.35, C = 10.0
        let x: Vec<f64> = (0..=30).map(|i| (i as f64) * 0.5).collect();
        let y: Vec<f64> = x
            .iter()
            .map(|&xi| 120.0 * (-0.35 * xi).exp() + 10.0)
            .collect();

        let cfg = FitConfiguration::new(
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            FitModelKind::Exponential,
        );
        let res = fit_nonlinear(&cfg, &x, &y, None).expect("exponential fit");
        assert!(res.diagnostics.converged);
        assert!((res.parameters[0].value - 120.0).abs() < 1e-4);
        assert!((res.parameters[1].value - (-0.35)).abs() < 1e-4);
        assert!((res.parameters[2].value - 10.0).abs() < 1e-4);
    }
}
