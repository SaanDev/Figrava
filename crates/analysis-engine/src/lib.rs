//! Scientific statistical analysis, linear/polynomial least squares,
//! Levenberg-Marquardt nonlinear curve fitting, signal processing (FFT/filters/peaks),
//! numerical calculus, and parametric hypothesis testing engine.

pub mod custom_fit;
pub mod hypothesis;
pub mod models;
pub mod nonlinear;
pub mod numerical;
pub mod regression;
pub mod signal;
pub mod statistics;

pub use custom_fit::eval_custom_expression;
pub use hypothesis::{
    run_one_way_anova, run_t_test, AnovaGroupSummary, AnovaResult, TTestKind, TTestResult,
};
pub use models::{
    AnalysisResult, DescriptiveStats, FitConfiguration, FitDiagnostics, FitModelKind, FitParameter,
    PairedCorrelation,
};
pub use nonlinear::{estimate_initial_parameters, evaluate_nonlinear_model, fit_nonlinear};
pub use numerical::{
    compute_numerical_integration, interpolate_series, IntegrationResult, InterpolationMethod,
};
pub use regression::{fit_linear, fit_polynomial, generate_curve_grid};
pub use signal::{
    apply_frequency_filter, compute_fft_spectrum, detect_peaks, DetectedPeak, FftSpectrumResult,
    FilterKind, WindowFunction,
};
pub use statistics::{compute_descriptive_stats, compute_paired_correlation};

use scientific_core::ScientificResult;

/// Dispatches curve fitting according to the model specified in `config`.
pub fn run_curve_fit(
    config: &FitConfiguration,
    raw_x: &[f64],
    raw_y: &[f64],
    raw_y_err: Option<&[f64]>,
) -> ScientificResult<AnalysisResult> {
    match &config.model {
        FitModelKind::Linear => fit_linear(config, raw_x, raw_y, raw_y_err),
        FitModelKind::Polynomial { degree } => {
            fit_polynomial(config, *degree, raw_x, raw_y, raw_y_err)
        }
        FitModelKind::Exponential
        | FitModelKind::Gaussian
        | FitModelKind::Lorentzian
        | FitModelKind::MultiGaussian { .. }
        | FitModelKind::MultiLorentzian { .. }
        | FitModelKind::CustomEquation { .. } => fit_nonlinear(config, raw_x, raw_y, raw_y_err),
    }
}
