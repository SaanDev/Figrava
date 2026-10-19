//! Signal processing engine: FFT & power spectrum, window functions,
//! frequency filtering (Low-Pass, High-Pass, Band-Pass), and spectroscopy peak detection.

use rustfft::{num_complex::Complex, FftPlanner};
use scientific_core::{clean_paired_data, ScientificError, ScientificResult};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowFunction {
    Rectangular,
    Hann,
    Hamming,
    Blackman,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FftSpectrumResult {
    pub frequencies: Vec<f64>,
    pub magnitudes: Vec<f64>,
    pub power_spectral_density: Vec<f64>,
    pub dominant_frequency: f64,
    pub dominant_magnitude: f64,
    pub sampling_rate: f64,
}

fn apply_window(n: usize, i: usize, window: WindowFunction) -> f64 {
    if n <= 1 {
        return 1.0;
    }
    let ratio = (i as f64) / ((n - 1) as f64);
    match window {
        WindowFunction::Rectangular => 1.0,
        WindowFunction::Hann => 0.5 * (1.0 - (2.0 * PI * ratio).cos()),
        WindowFunction::Hamming => 0.54 - 0.46 * (2.0 * PI * ratio).cos(),
        WindowFunction::Blackman => {
            0.42 - 0.5 * (2.0 * PI * ratio).cos() + 0.08 * (4.0 * PI * ratio).cos()
        }
    }
}

/// Computes single-sided FFT amplitude and power spectrum from `(time, signal)` samples.
pub fn compute_fft_spectrum(
    raw_time: &[f64],
    raw_signal: &[f64],
    window: WindowFunction,
) -> ScientificResult<FftSpectrumResult> {
    let cleaned = clean_paired_data(raw_time, raw_signal, None, None, 4)?;
    let n = cleaned.x.len();
    let total_span = (cleaned.x[n - 1] - cleaned.x[0]).abs();
    if total_span <= 1e-15 {
        return Err(ScientificError::DegenerateData(
            "Time/X domain span is zero; cannot compute sampling rate for FFT".to_string(),
        ));
    }
    let dt = total_span / ((n - 1) as f64);
    let fs = 1.0 / dt;

    // Remove DC mean before windowing to prevent DC leakage dominating peak search
    let mean_y = cleaned.y.iter().sum::<f64>() / (n as f64);

    let mut buffer: Vec<Complex<f64>> = cleaned
        .y
        .iter()
        .enumerate()
        .map(|(i, &y)| {
            let w = apply_window(n, i, window);
            Complex {
                re: (y - mean_y) * w,
                im: 0.0,
            }
        })
        .collect();

    let mut planner = FftPlanner::<f64>::new();
    let fft = planner.plan_fft_forward(n);
    fft.process(&mut buffer);

    let half_n = n / 2 + 1;
    let mut frequencies = Vec::with_capacity(half_n);
    let mut magnitudes = Vec::with_capacity(half_n);
    let mut psd = Vec::with_capacity(half_n);

    let mut dom_freq = 0.0;
    let mut dom_mag = 0.0;

    for (k, bin) in buffer.iter().take(half_n).enumerate() {
        let freq = (k as f64) * fs / (n as f64);
        let scale = if k == 0 || (n % 2 == 0 && k == n / 2) {
            1.0 / (n as f64)
        } else {
            2.0 / (n as f64)
        };
        let mag = bin.norm() * scale;
        let power = (bin.norm_sqr()) / ((n as f64) * fs);
        if k > 0 && mag > dom_mag {
            dom_mag = mag;
            dom_freq = freq;
        }
        frequencies.push(freq);
        magnitudes.push(mag);
        psd.push(power);
    }

    Ok(FftSpectrumResult {
        frequencies,
        magnitudes,
        power_spectral_density: psd,
        dominant_frequency: dom_freq,
        dominant_magnitude: dom_mag,
        sampling_rate: fs,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "filter_type", rename_all = "snake_case")]
pub enum FilterKind {
    LowPass { cutoff_hz: f64 },
    HighPass { cutoff_hz: f64 },
    BandPass { low_hz: f64, high_hz: f64 },
}

/// Applies zero-phase FFT frequency-domain filtering (`LowPass`, `HighPass`, or `BandPass`)
/// and returns the filtered time-domain signal matching the length of `raw_signal`.
pub fn apply_frequency_filter(
    raw_time: &[f64],
    raw_signal: &[f64],
    filter: FilterKind,
) -> ScientificResult<Vec<f64>> {
    let n = raw_time.len().min(raw_signal.len());
    if n < 4 {
        return Err(ScientificError::InsufficientData {
            required: 4,
            actual: n,
        });
    }
    let first_x = raw_time
        .iter()
        .copied()
        .find(|v| v.is_finite())
        .unwrap_or(0.0);
    let last_x = raw_time
        .iter()
        .rev()
        .copied()
        .find(|v| v.is_finite())
        .unwrap_or(1.0);
    let dt = ((last_x - first_x).abs() / ((n - 1) as f64)).max(1e-12);
    let fs = 1.0 / dt;

    let mean_y = {
        let finite: Vec<f64> = raw_signal
            .iter()
            .copied()
            .filter(|v| v.is_finite())
            .collect();
        if finite.is_empty() {
            0.0
        } else {
            finite.iter().sum::<f64>() / (finite.len() as f64)
        }
    };

    let mut buffer: Vec<Complex<f64>> = raw_signal
        .iter()
        .take(n)
        .map(|&y| Complex {
            re: if y.is_finite() { y } else { mean_y },
            im: 0.0,
        })
        .collect();

    let mut planner = FftPlanner::<f64>::new();
    let fft_fwd = planner.plan_fft_forward(n);
    fft_fwd.process(&mut buffer);

    for (k, c) in buffer.iter_mut().enumerate() {
        let freq_idx = if k <= n / 2 { k } else { n - k };
        let freq = (freq_idx as f64) * fs / (n as f64);
        let pass = match filter {
            FilterKind::LowPass { cutoff_hz } => freq <= cutoff_hz.abs(),
            FilterKind::HighPass { cutoff_hz } => freq >= cutoff_hz.abs(),
            FilterKind::BandPass { low_hz, high_hz } => {
                let lo = low_hz.abs().min(high_hz.abs());
                let hi = low_hz.abs().max(high_hz.abs());
                freq >= lo && freq <= hi
            }
        };
        if !pass {
            *c = Complex { re: 0.0, im: 0.0 };
        }
    }

    let fft_inv = planner.plan_fft_inverse(n);
    fft_inv.process(&mut buffer);

    Ok(buffer.into_iter().map(|c| c.re / (n as f64)).collect())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DetectedPeak {
    pub index: usize,
    pub x: f64,
    pub y: f64,
    pub prominence: f64,
    pub fwhm: f64,
}

/// Detects local maxima peaks with prominence >= `min_prominence` and estimates FWHM.
pub fn detect_peaks(
    raw_x: &[f64],
    raw_y: &[f64],
    min_prominence: f64,
) -> ScientificResult<Vec<DetectedPeak>> {
    let cleaned = clean_paired_data(raw_x, raw_y, None, None, 3)?;
    let n = cleaned.x.len();
    let mut peaks = Vec::new();

    for i in 1..(n - 1) {
        let yi = cleaned.y[i];
        if yi > cleaned.y[i - 1] && yi >= cleaned.y[i + 1] {
            // Search left and right local valleys to compute prominence
            let mut left_min = yi;
            for j in (0..i).rev() {
                if cleaned.y[j] > yi {
                    break;
                }
                if cleaned.y[j] < left_min {
                    left_min = cleaned.y[j];
                }
            }
            let mut right_min = yi;
            for j in (i + 1)..n {
                if cleaned.y[j] > yi {
                    break;
                }
                if cleaned.y[j] < right_min {
                    right_min = cleaned.y[j];
                }
            }
            let base = left_min.max(right_min);
            let prominence = yi - base;
            if prominence >= min_prominence.max(0.0) {
                let half_level = base + 0.5 * prominence;
                let mut left_x = cleaned.x[i];
                for j in (0..i).rev() {
                    if cleaned.y[j] <= half_level {
                        let dy = (cleaned.y[j + 1] - cleaned.y[j]).abs().max(1e-15);
                        let frac = (half_level - cleaned.y[j]) / dy;
                        left_x = cleaned.x[j] + frac * (cleaned.x[j + 1] - cleaned.x[j]);
                        break;
                    }
                    left_x = cleaned.x[j];
                }
                let mut right_x = cleaned.x[i];
                for j in (i + 1)..n {
                    if cleaned.y[j] <= half_level {
                        let dy = (cleaned.y[j - 1] - cleaned.y[j]).abs().max(1e-15);
                        let frac = (cleaned.y[j - 1] - half_level) / dy;
                        right_x = cleaned.x[j - 1] + frac * (cleaned.x[j] - cleaned.x[j - 1]);
                        break;
                    }
                    right_x = cleaned.x[j];
                }
                peaks.push(DetectedPeak {
                    index: i,
                    x: cleaned.x[i],
                    y: yi,
                    prominence,
                    fwhm: (right_x - left_x).abs(),
                });
            }
        }
    }

    peaks.sort_by(|a, b| {
        b.prominence
            .partial_cmp(&a.prominence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(peaks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_detects_dominant_sine_frequency() {
        // 100 samples at 100 Hz (1.0 second duration), 10 Hz sine wave
        let n = 100;
        let time: Vec<f64> = (0..n).map(|i| (i as f64) * 0.01).collect();
        let sig: Vec<f64> = time
            .iter()
            .map(|&t| 5.0 * (2.0 * PI * 10.0 * t).sin())
            .collect();
        let res = compute_fft_spectrum(&time, &sig, WindowFunction::Rectangular).expect("fft");
        assert!((res.dominant_frequency - 10.0).abs() < 1.5);
    }

    #[test]
    fn peak_finder_identifies_gaussian_peak() {
        let x: Vec<f64> = (0..=40).map(|i| 400.0 + (i as f64) * 5.0).collect();
        let y: Vec<f64> = x
            .iter()
            .map(|&wl| 500.0 * (-0.5 * ((wl - 500.0) / 15.0).powi(2)).exp() + 50.0)
            .collect();
        let peaks = detect_peaks(&x, &y, 100.0).expect("peaks");
        assert_eq!(peaks.len(), 1);
        assert!((peaks[0].x - 500.0).abs() < 1e-9);
        assert!((peaks[0].prominence - 500.0).abs() < 5.0);
    }
}
