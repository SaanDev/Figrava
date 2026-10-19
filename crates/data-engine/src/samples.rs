use crate::models::{ColumnRole, DataColumn, Dataset, DatasetSource};

/// Creates a realistic UV-Vis Spectroscopy & Calibration dataset with 4 columns:
/// - Wavelength [nm] (X)
/// - Sample A Intensity [counts] (Y)
/// - Sample A Uncertainty [counts] (YError)
/// - Reference Sample B [counts] (Y)
pub fn create_spectroscopy_sample_dataset() -> Dataset {
    let n = 41;
    let mut wavelength = Vec::with_capacity(n);
    let mut intensity_a = Vec::with_capacity(n);
    let mut err_a = Vec::with_capacity(n);
    let mut intensity_b = Vec::with_capacity(n);

    // Deterministic pseudo-noise for reproducible scientific demonstration
    for i in 0..n {
        let wl = 450.0 + (i as f64) * 5.0; // 450 nm to 650 nm
        let noise_a = ((i as f64 * 1.73).sin() * 14.5) + ((i as f64 * 3.11).cos() * 8.2);
        let noise_b = ((i as f64 * 2.19).cos() * 11.0) - ((i as f64 * 1.37).sin() * 6.5);

        // Gaussian peak centered at 545 nm, sigma = 22 nm, amplitude = 850, baseline = 120
        let z_a = (wl - 545.0) / 22.0;
        let val_a = 850.0 * (-0.5 * z_a * z_a).exp() + 120.0 + noise_a;

        // Second broader peak centered at 565 nm, sigma = 28 nm, amplitude = 620, baseline = 95
        let z_b = (wl - 565.0) / 28.0;
        let val_b = 620.0 * (-0.5 * z_b * z_b).exp() + 95.0 + noise_b;

        let sigma = (val_a.abs().sqrt() * 0.85).max(8.0);

        wavelength.push(wl);
        intensity_a.push((val_a * 100.0).round() / 100.0);
        err_a.push((sigma * 100.0).round() / 100.0);
        intensity_b.push((val_b * 100.0).round() / 100.0);
    }

    Dataset::new(
        "Photoluminescence Spectrum",
        DatasetSource::Synthesized {
            description: "GaN Quantum Dot Photoluminescence Emission (450–650 nm)".to_string(),
        },
        vec![
            DataColumn::new_numeric(
                "Wavelength",
                ColumnRole::X,
                Some("nm".to_string()),
                wavelength,
            ),
            DataColumn::new_numeric(
                "Sample A Intensity",
                ColumnRole::Y,
                Some("counts".to_string()),
                intensity_a,
            ),
            DataColumn::new_numeric(
                "Sample A Sigma",
                ColumnRole::YError,
                Some("counts".to_string()),
                err_a,
            ),
            DataColumn::new_numeric(
                "Reference Sample B",
                ColumnRole::Y,
                Some("counts".to_string()),
                intensity_b,
            ),
        ],
    )
}

/// Creates a Beer-Lambert Law linear calibration dataset with measurement uncertainties.
pub fn create_calibration_sample_dataset() -> Dataset {
    let conc = vec![
        0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0,
    ];
    // True linear model: y = 0.0245 * x + 0.015
    let abs_a = vec![
        0.016, 0.135, 0.264, 0.379, 0.508, 0.624, 0.753, 0.869, 0.998, 1.114, 1.242,
    ];
    let abs_err = vec![
        0.008, 0.009, 0.011, 0.012, 0.014, 0.015, 0.016, 0.018, 0.019, 0.021, 0.022,
    ];
    let abs_b = vec![
        0.011, 0.098, 0.189, 0.275, 0.368, 0.451, 0.542, 0.630, 0.721, 0.808, 0.899,
    ];

    Dataset::new(
        "Beer-Lambert Calibration",
        DatasetSource::Synthesized {
            description: "UV-Vis Spectrophotometric Calibration Curve at 280 nm".to_string(),
        },
        vec![
            DataColumn::new_numeric("Concentration", ColumnRole::X, Some("uM".to_string()), conc),
            DataColumn::new_numeric(
                "Absorbance 280nm",
                ColumnRole::Y,
                Some("AU".to_string()),
                abs_a,
            ),
            DataColumn::new_numeric(
                "Absorbance Error",
                ColumnRole::YError,
                Some("AU".to_string()),
                abs_err,
            ),
            DataColumn::new_numeric(
                "Absorbance 310nm",
                ColumnRole::Y,
                Some("AU".to_string()),
                abs_b,
            ),
        ],
    )
}

/// Creates a 3D Potential Energy Surface & Contour Matrix dataset (X, Y, Z)
/// suitable for 3D Surface, Wireframe, Scatter3D, Heatmap, Contour, and VectorField plots.
pub fn create_surface_3d_sample_dataset() -> Dataset {
    let grid: [f64; 7] = [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0];
    let mut x_col = Vec::with_capacity(grid.len() * grid.len());
    let mut y_col = Vec::with_capacity(grid.len() * grid.len());
    let mut z_col = Vec::with_capacity(grid.len() * grid.len());
    let mut vx_col = Vec::with_capacity(grid.len() * grid.len());
    let mut vy_col = Vec::with_capacity(grid.len() * grid.len());

    for &y in &grid {
        for &x in &grid {
            let r2 = x * x + y * y;
            // Sombrero / damped radial potential: Z = 100 * cos(0.75 * r) * exp(-0.18 * r^2)
            let r = r2.sqrt();
            let z = 100.0 * (0.75 * r).cos() * (-0.18 * r2).exp();
            // Gradient field components for VectorField demonstration
            let grad_x = -x * 0.36 * z;
            let grad_y = -y * 0.36 * z;
            x_col.push(x);
            y_col.push(y);
            z_col.push((z * 100.0).round() / 100.0);
            vx_col.push((grad_x * 100.0).round() / 100.0);
            vy_col.push((grad_y * 100.0).round() / 100.0);
        }
    }

    Dataset::new(
        "Potential Energy Surface 3D",
        DatasetSource::Synthesized {
            description: "2D/3D Radial Potential Surface Z(X, Y) and Field Vectors".to_string(),
        },
        vec![
            DataColumn::new_numeric("Position X", ColumnRole::X, Some("nm".to_string()), x_col),
            DataColumn::new_numeric("Position Y", ColumnRole::Y, Some("nm".to_string()), y_col),
            DataColumn::new_numeric("Potential Z", ColumnRole::Z, Some("meV".to_string()), z_col),
            DataColumn::new_numeric(
                "Field dX",
                ColumnRole::Y,
                Some("meV/nm".to_string()),
                vx_col,
            ),
            DataColumn::new_numeric(
                "Field dY",
                ColumnRole::Y,
                Some("meV/nm".to_string()),
                vy_col,
            ),
        ],
    )
}
