use scientific_core::{AnalysisId, ColumnId, DatasetId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "model_type", rename_all = "snake_case")]
pub enum FitModelKind {
    Linear,
    Polynomial {
        degree: usize,
    },
    Exponential,
    Gaussian,
    Lorentzian,
    MultiGaussian {
        peaks: usize,
    },
    MultiLorentzian {
        peaks: usize,
    },
    CustomEquation {
        expression: String,
        parameters: Vec<String>,
    },
}

impl FitModelKind {
    pub fn display_name(&self) -> String {
        match self {
            Self::Linear => "Linear (y = m·x + c)".to_string(),
            Self::Polynomial { degree } => format!("Polynomial (Degree {degree})"),
            Self::Exponential => "Exponential (y = A·exp(B·x) + C)".to_string(),
            Self::Gaussian => "Gaussian Peak (y = A·exp(-(x-μ)²/(2σ²)) + C)".to_string(),
            Self::Lorentzian => "Lorentzian Peak (y = A·γ²/((x-x₀)²+γ²) + C)".to_string(),
            Self::MultiGaussian { peaks } => {
                format!("Multi-Gaussian Deconvolution ({peaks} Peaks)")
            }
            Self::MultiLorentzian { peaks } => {
                format!("Multi-Lorentzian Deconvolution ({peaks} Peaks)")
            }
            Self::CustomEquation { expression, .. } => format!("Custom Fit ({expression})"),
        }
    }

    pub fn formula_template(&self) -> String {
        match self {
            Self::Linear => "y = m * x + c".to_string(),
            Self::Polynomial { degree } => {
                let mut parts = vec!["a0".to_string()];
                for k in 1..=*degree {
                    if k == 1 {
                        parts.push("a1 * x".to_string());
                    } else {
                        parts.push(format!("a{k} * x^{k}"));
                    }
                }
                format!("y = {}", parts.join(" + "))
            }
            Self::Exponential => "y = A * exp(B * x) + C".to_string(),
            Self::Gaussian => "y = A * exp(-(x - mu)^2 / (2 * sigma^2)) + C".to_string(),
            Self::Lorentzian => "y = A * gamma^2 / ((x - x0)^2 + gamma^2) + C".to_string(),
            Self::MultiGaussian { peaks } => {
                let k = (*peaks).clamp(1, 5);
                let terms: Vec<String> = (1..=k)
                    .map(|i| format!("A{i}*exp(-(x-mu{i})^2/(2*sigma{i}^2))"))
                    .collect();
                format!("y = {} + C", terms.join(" + "))
            }
            Self::MultiLorentzian { peaks } => {
                let k = (*peaks).clamp(1, 5);
                let terms: Vec<String> = (1..=k)
                    .map(|i| format!("A{i}*gamma{i}^2/((x-x0_{i})^2+gamma{i}^2)"))
                    .collect();
                format!("y = {} + C", terms.join(" + "))
            }
            Self::CustomEquation { expression, .. } => format!("y = {expression}"),
        }
    }

    pub fn parameter_names(&self) -> Vec<String> {
        match self {
            Self::Linear => vec!["m".to_string(), "c".to_string()],
            Self::Polynomial { degree } => (0..=*degree).map(|k| format!("a{k}")).collect(),
            Self::Exponential => vec!["A".to_string(), "B".to_string(), "C".to_string()],
            Self::Gaussian => vec![
                "A".to_string(),
                "mu".to_string(),
                "sigma".to_string(),
                "C".to_string(),
            ],
            Self::Lorentzian => vec![
                "A".to_string(),
                "x0".to_string(),
                "gamma".to_string(),
                "C".to_string(),
            ],
            Self::MultiGaussian { peaks } => {
                let k = (*peaks).clamp(1, 5);
                let mut names = Vec::with_capacity(k * 3 + 1);
                for i in 1..=k {
                    names.push(format!("A{i}"));
                    names.push(format!("mu{i}"));
                    names.push(format!("sigma{i}"));
                }
                names.push("C".to_string());
                names
            }
            Self::MultiLorentzian { peaks } => {
                let k = (*peaks).clamp(1, 5);
                let mut names = Vec::with_capacity(k * 3 + 1);
                for i in 1..=k {
                    names.push(format!("A{i}"));
                    names.push(format!("x0_{i}"));
                    names.push(format!("gamma{i}"));
                }
                names.push("C".to_string());
                names
            }
            Self::CustomEquation { parameters, .. } => {
                if parameters.is_empty() {
                    vec!["a".to_string(), "b".to_string()]
                } else {
                    parameters.clone()
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FitParameter {
    pub name: String,
    pub value: f64,
    pub std_error: f64,
    pub t_value: f64,
    pub p_value: f64,
    pub ci_lower_95: f64,
    pub ci_upper_95: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FitDiagnostics {
    pub observations: usize,
    pub dropped_missing: usize,
    pub degrees_of_freedom: usize,
    pub rss: f64,
    pub tss: f64,
    pub r_squared: f64,
    pub adj_r_squared: f64,
    pub rmse: f64,
    pub residual_std_error: f64,
    pub reduced_chi_square: Option<f64>,
    pub aic: f64,
    pub converged: bool,
    pub iterations: usize,
    pub condition_number: f64,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FitConfiguration {
    pub dataset_id: DatasetId,
    pub x_col: ColumnId,
    pub y_col: ColumnId,
    pub y_err_col: Option<ColumnId>,
    pub model: FitModelKind,
    pub x_range: Option<(f64, f64)>,
    pub initial_parameters: Option<Vec<f64>>,
    pub lower_bounds: Option<Vec<f64>>,
    pub upper_bounds: Option<Vec<f64>>,
    pub use_weights: bool,
    pub max_iterations: usize,
    pub tolerance: f64,
    pub curve_points: usize,
}

impl FitConfiguration {
    pub fn new(
        dataset_id: DatasetId,
        x_col: ColumnId,
        y_col: ColumnId,
        model: FitModelKind,
    ) -> Self {
        Self {
            dataset_id,
            x_col,
            y_col,
            y_err_col: None,
            model,
            x_range: None,
            initial_parameters: None,
            lower_bounds: None,
            upper_bounds: None,
            use_weights: false,
            max_iterations: 200,
            tolerance: 1e-10,
            curve_points: 200,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub id: AnalysisId,
    pub name: String,
    pub config: FitConfiguration,
    pub formula_template: String,
    pub fitted_equation: String,
    pub parameters: Vec<FitParameter>,
    pub diagnostics: FitDiagnostics,
    pub obs_x: Vec<f64>,
    pub obs_y: Vec<f64>,
    pub fitted_y: Vec<f64>,
    pub residuals: Vec<f64>,
    pub standardized_residuals: Vec<f64>,
    pub curve_x: Vec<f64>,
    pub curve_y: Vec<f64>,
    #[serde(default)]
    pub confidence_band_upper: Vec<f64>,
    #[serde(default)]
    pub confidence_band_lower: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DescriptiveStats {
    pub count: usize,
    pub missing_count: usize,
    pub mean: f64,
    pub variance: f64,
    pub std_dev: f64,
    pub sem: f64,
    pub min: f64,
    pub q1: f64,
    pub median: f64,
    pub q3: f64,
    pub iqr: f64,
    pub max: f64,
    pub sum: f64,
    pub skewness: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PairedCorrelation {
    pub observations: usize,
    pub dropped_missing: usize,
    pub pearson_r: f64,
    pub r_squared: f64,
    pub covariance: f64,
}
