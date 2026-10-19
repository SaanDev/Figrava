//! Parametric statistical hypothesis testing: One-sample $t$-test,
//! Two-sample Student's & Welch's $t$-test, and One-way ANOVA.

use scientific_core::{clean_single_series, ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};
use statrs::distribution::{ContinuousCDF, FisherSnedecor, StudentsT};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "test_kind", rename_all = "snake_case")]
pub enum TTestKind {
    OneSample { mu0: f64 },
    TwoSampleStudent,
    TwoSampleWelch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TTestResult {
    pub test_name: String,
    pub statistic_t: f64,
    pub degrees_of_freedom: f64,
    pub p_value_two_tailed: f64,
    pub mean_diff: f64,
    pub std_error_diff: f64,
    pub ci_lower_95: f64,
    pub ci_upper_95: f64,
    pub significant_at_05: bool,
    pub n1: usize,
    pub n2: Option<usize>,
}

/// Runs a One-Sample or Two-Sample $t$-test.
pub fn run_t_test(
    sample_a: &[f64],
    sample_b: Option<&[f64]>,
    kind: TTestKind,
) -> ScientificResult<TTestResult> {
    let (clean_a, _) = clean_single_series(sample_a, 2)?;
    let n1 = clean_a.len();
    let mean1 = clean_a.iter().sum::<f64>() / (n1 as f64);
    let var1 = clean_a.iter().map(|&v| (v - mean1).powi(2)).sum::<f64>() / ((n1 - 1) as f64);

    match kind {
        TTestKind::OneSample { mu0 } => {
            let df = (n1 - 1) as f64;
            let se = (var1 / (n1 as f64)).sqrt().max(1e-15);
            let mean_diff = mean1 - mu0;
            let t_stat = mean_diff / se;
            let dist = StudentsT::new(0.0, 1.0, df).map_err(|e| {
                ScientificError::DegenerateData(format!("Student's t distribution error: {e}"))
            })?;
            let p_val = (2.0 * (1.0 - dist.cdf(t_stat.abs()))).clamp(0.0, 1.0);
            let t_crit = dist.inverse_cdf(0.975);
            Ok(TTestResult {
                test_name: format!("One-Sample t-Test (μ₀ = {mu0})"),
                statistic_t: t_stat,
                degrees_of_freedom: df,
                p_value_two_tailed: p_val,
                mean_diff,
                std_error_diff: se,
                ci_lower_95: mean1 - t_crit * se,
                ci_upper_95: mean1 + t_crit * se,
                significant_at_05: p_val < 0.05,
                n1,
                n2: None,
            })
        }
        TTestKind::TwoSampleStudent | TTestKind::TwoSampleWelch => {
            let raw_b = sample_b.ok_or_else(|| ScientificError::InvalidParameter {
                name: "sample_b".to_string(),
                reason: "Two-sample t-test requires a second column".to_string(),
            })?;
            let (clean_b, _) = clean_single_series(raw_b, 2)?;
            let n2 = clean_b.len();
            let mean2 = clean_b.iter().sum::<f64>() / (n2 as f64);
            let var2 =
                clean_b.iter().map(|&v| (v - mean2).powi(2)).sum::<f64>() / ((n2 - 1) as f64);
            let mean_diff = mean1 - mean2;

            let (se, df, label) = if kind == TTestKind::TwoSampleStudent {
                let df_val = (n1 + n2 - 2) as f64;
                let pooled_var = (((n1 - 1) as f64) * var1 + ((n2 - 1) as f64) * var2) / df_val;
                let se_val = (pooled_var * (1.0 / (n1 as f64) + 1.0 / (n2 as f64)))
                    .sqrt()
                    .max(1e-15);
                (
                    se_val,
                    df_val,
                    "Two-Sample Student's t-Test (Equal Variance)".to_string(),
                )
            } else {
                let v1_n = var1 / (n1 as f64);
                let v2_n = var2 / (n2 as f64);
                let se_val = (v1_n + v2_n).sqrt().max(1e-15);
                let num = (v1_n + v2_n).powi(2);
                let den = (v1_n * v1_n) / ((n1 - 1) as f64) + (v2_n * v2_n) / ((n2 - 1) as f64);
                let df_val = (num / den.max(1e-30)).max(1.0);
                (
                    se_val,
                    df_val,
                    "Two-Sample Welch's t-Test (Unequal Variance)".to_string(),
                )
            };

            let t_stat = mean_diff / se;
            let dist = StudentsT::new(0.0, 1.0, df).map_err(|e| {
                ScientificError::DegenerateData(format!("Student's t distribution error: {e}"))
            })?;
            let p_val = (2.0 * (1.0 - dist.cdf(t_stat.abs()))).clamp(0.0, 1.0);
            let t_crit = dist.inverse_cdf(0.975);

            Ok(TTestResult {
                test_name: label,
                statistic_t: t_stat,
                degrees_of_freedom: df,
                p_value_two_tailed: p_val,
                mean_diff,
                std_error_diff: se,
                ci_lower_95: mean_diff - t_crit * se,
                ci_upper_95: mean_diff + t_crit * se,
                significant_at_05: p_val < 0.05,
                n1,
                n2: Some(n2),
            })
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnovaGroupSummary {
    pub group_name: String,
    pub count: usize,
    pub mean: f64,
    pub std_dev: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnovaResult {
    pub f_statistic: f64,
    pub df_between: usize,
    pub df_within: usize,
    pub p_value: f64,
    pub ss_between: f64,
    pub ss_within: f64,
    pub ms_between: f64,
    pub ms_within: f64,
    pub significant_at_05: bool,
    pub groups: Vec<AnovaGroupSummary>,
}

/// Runs a One-Way Analysis of Variance (ANOVA) across 2 or more groups.
pub fn run_one_way_anova(groups_raw: &[(String, Vec<f64>)]) -> ScientificResult<AnovaResult> {
    if groups_raw.len() < 2 {
        return Err(ScientificError::InvalidParameter {
            name: "groups".to_string(),
            reason: "One-Way ANOVA requires at least 2 groups/columns".to_string(),
        });
    }

    let mut cleaned_groups: Vec<(String, Vec<f64>)> = Vec::with_capacity(groups_raw.len());
    let mut total_n = 0usize;
    let mut grand_sum = 0.0;

    for (name, vals) in groups_raw {
        let (cl, _) = clean_single_series(vals, 2)?;
        total_n += cl.len();
        grand_sum += cl.iter().sum::<f64>();
        cleaned_groups.push((name.clone(), cl));
    }

    let k = cleaned_groups.len();
    if total_n <= k {
        return Err(ScientificError::InsufficientData {
            required: k + 1,
            actual: total_n,
        });
    }

    let grand_mean = grand_sum / (total_n as f64);
    let mut ss_between = 0.0;
    let mut ss_within = 0.0;
    let mut summaries = Vec::with_capacity(k);

    for (name, vals) in &cleaned_groups {
        let ni = vals.len();
        let mean_i = vals.iter().sum::<f64>() / (ni as f64);
        let ss_i: f64 = vals.iter().map(|&v| (v - mean_i).powi(2)).sum();
        let sd_i = (ss_i / ((ni - 1) as f64)).sqrt();
        ss_between += (ni as f64) * (mean_i - grand_mean).powi(2);
        ss_within += ss_i;
        summaries.push(AnovaGroupSummary {
            group_name: name.clone(),
            count: ni,
            mean: mean_i,
            std_dev: sd_i,
        });
    }

    let df_between = k - 1;
    let df_within = total_n - k;
    let ms_between = ss_between / (df_between as f64);
    let ms_within = (ss_within / (df_within as f64)).max(1e-30);
    let f_stat = ms_between / ms_within;

    let f_dist = FisherSnedecor::new(df_between as f64, df_within as f64)
        .map_err(|e| ScientificError::DegenerateData(format!("F-distribution error: {e}")))?;
    let p_value = (1.0 - f_dist.cdf(f_stat.max(0.0))).clamp(0.0, 1.0);

    Ok(AnovaResult {
        f_statistic: f_stat,
        df_between,
        df_within,
        p_value,
        ss_between,
        ss_within,
        ms_between,
        ms_within,
        significant_at_05: p_value < 0.05,
        groups: summaries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn welch_t_test_distinguishes_separated_samples() {
        let a = vec![10.1, 10.4, 9.9, 10.2, 10.0, 10.3];
        let b = vec![15.2, 14.9, 15.1, 15.4, 15.0, 14.8];
        let res = run_t_test(&a, Some(&b), TTestKind::TwoSampleWelch).expect("welch");
        assert!(res.significant_at_05);
        assert!(res.p_value_two_tailed < 1e-6);
    }

    #[test]
    fn one_way_anova_detects_group_differences() {
        let groups = vec![
            ("Control".to_string(), vec![5.1, 4.9, 5.0, 5.2, 4.8]),
            ("Dose 10uM".to_string(), vec![8.2, 8.0, 8.4, 7.9, 8.1]),
            ("Dose 50uM".to_string(), vec![12.5, 12.1, 12.3, 12.7, 12.4]),
        ];
        let res = run_one_way_anova(&groups).expect("anova");
        assert!(res.significant_at_05);
        assert!(res.f_statistic > 100.0);
    }
}
