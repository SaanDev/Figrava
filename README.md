<div align="center">

<img src="./assets/Logo.png" alt="Figrava Logo" width="480" />

### Scientific Figures & Data Visualization Desktop Studio

[![Release](https://img.shields.io/badge/Release-v1.0.0-blue.svg)](https://github.com/scientific-plot-studio/scientific-plot-studio)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg)]()
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)

**Figrava** is a professional desktop application engineered for scientists, researchers, and engineers to explore complex datasets, perform mathematically rigorous curve fitting and statistical analysis, and generate publication-ready scientific figures.

</div>

---

## 🎯 Purpose

In modern scientific research, preparing journal-grade figures and performing robust data analysis often requires juggling fragile spreadsheets, proprietary statistical packages, and ad-hoc plotting scripts.

**Figrava** solves this by unifying:
1. **Interactive Data Exploration**: Fast, responsive spreadsheets tailored for multi-series experimental measurements.
2. **Mathematical Rigor**: Numerical least-squares regression, analytical Jacobians, and statistical validation without black-box approximations.
3. **Publication-Standard Graphics**: Pixel-perfect vector and high-DPI raster figure generation meeting the strict standards of peer-reviewed journals (such as *Nature*, *Science*, and *Cell*).
4. **Reproducible Workflows**: Self-contained project persistence with reactive recalculation, ensuring figures remain continuously synchronized with their underlying data.

---

## ✨ Key Functions & Capabilities

### 📊 Scientific Data Workspace & Spreadsheet
- **Smart Data Ingestion**: Import experimental datasets from CSV, TSV, and whitespace-delimited files with automatic delimiter detection, header recognition, and physical unit extraction (e.g., `[nm]`, `(µM)`).
- **Virtualized High-Capacity Editor**: Smoothly browse and manipulate large multi-column datasets with instantaneous sorting, filtering, and cell editing.
- **Column Role Management**: Explicitly designate column roles as `X`, `Y`, `X-Error`, `Y-Error`, `Label`, or `None` for intuitive, error-free plotting.
- **Derived Column Math**: Apply mathematical transformations directly to data columns, including scaling, offsets, logarithmic transforms ($\log_{10}$, $\ln$), min-max normalization, z-score standardization, numerical derivatives, and cumulative numerical integration.

### 📈 Journal-Ready 2D Scientific Plotting
- **Comprehensive Figure Types**: Scatter charts, connected line graphs, line + symbols, area plots, and bar charts with customizable multi-layer overlays.
- **Dual Error Bars**: Independent symmetric or asymmetric error bounds for both horizontal ($X$) and vertical ($Y$) axes.
- **Advanced Coordinate Systems**: Linear and true logarithmic scales, inverted coordinates, customizable axis limits, major and minor grid lines, and scientific notation formatting.
- **Publication Styling Presets**: Out-of-the-box styling configurations including Nature-style aesthetics, clean minimalist layouts, and Okabe-Ito colorblind-accessible palettes.
- **High-Fidelity Vector & Bitmap Export**: One-click figure export to scalable vector graphics (**SVG**) and high-resolution raster images (**PNG** at 150, 300, and 600 DPI) ready for camera-ready submission.

### 🔬 Rigorous Curve Fitting & Statistical Analysis
- **Linear & Polynomial Regression**:
  - Weighted and unweighted Ordinary Least Squares ($y = mx + c$).
  - SVD-stabilized, domain-centered Polynomial Least Squares (degrees 1 through 8) with exact covariance transformations.
- **Nonlinear Model Fitting (Levenberg-Marquardt)**:
  - Built-in models: **Gaussian Peaks**, **Lorentzian Peaks**, and **Exponential Decay**.
  - Automated initial parameter estimation and analytical Jacobians for rapid, robust convergence.
- **Statistical Diagnostics & Confidence Bounds**:
  - In-depth goodness-of-fit metrics: $R^2$, Adjusted $R^2$, Root Mean Square Error (RMSE), Residual Sum of Squares (RSS), Reduced Chi-Square ($\chi^2_\nu$), and Akaike Information Criterion (AIC).
  - Parameter standard errors, condition number diagnostics, and 95% confidence intervals.
  - Real-time residual distribution plots to evaluate model adequacy.
- **Descriptive Statistics**: Instant calculation of Mean, Variance, Standard Deviation, Standard Error of the Mean (SEM), Median, Interquartile Range (IQR), and Pearson correlation.

### 🔄 Reproducible Project Persistence
- **Atomic `.spsproj` File Container**: Save your entire study—raw worksheets, transformed columns, plotted layers, fitted models, and figure customizations—into a single, portable, versioned archive.
- **Reactive Dependency Architecture**: Modify any measurement cell in a source worksheet, and Figrava automatically recalculates all dependent curve fits, statistics, and figure layers in real time.

---

## 👥 Who Figrava is For

- **Academic Researchers & Faculty**: Preparing manuscript figures, supplemental data, and grant proposals.
- **Graduate Students & Postdocs**: Analyzing lab measurements, fitting calibration curves, and evaluating spectroscopy/chromatography data.
- **R&D Scientists & Engineers**: Analyzing experimental sensor data, device characterization, and physical testing without cumbersome setup.

---

## 📄 License

Figrava is open-source software licensed under the [GNU General Public License v3.0 (GPLv3)](./LICENSE).

You are free to use, run, study, modify, and redistribute this software for personal, academic, or commercial research. Any distributed modifications or derivative works must also be released under the same GPLv3 terms, ensuring that Figrava remains permanently open, transparent, and reproducible for the global scientific community.

---

<div align="center">
<sub>Designed for scientific clarity, mathematical accuracy, and publication-ready presentation.</sub>
</div>
