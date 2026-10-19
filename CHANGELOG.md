# Changelog

## [1.0.0] - 2026-10-19

### Added
- **Phase 6 — Advanced 2D & Statistical Plotting (v0.5)**:
  - Multi-panel $R \times C$ subplot grids (`1×1`, `1×2`, `2×1`, `2×2`) with automatic `(a)`–`(d)` subfigure labels and shared axes.
  - Statistical & specialized plot types: `Histogram`, `BoxPlot`, `Violin`, `Heatmap`, `Contour`, `Polar`, `StackedBar`, and `StackedArea`.
  - Perceptually uniform scientific colormaps: `Viridis`, `Plasma`, `Inferno`, `CoolWarm`, `Cividis`, and `Grayscale`.
  - Pure-Rust native Vector PDF 1.4 generator (`crates/plot-model/src/pdf_export.rs`) and Excel `.xlsx` workbook importer (`calamine`).
  - One-click journal style presets (`Nature`, `IEEE`, `ACS`, `Presentation`) and figure annotations (`Text`, `ReferenceLine`, `Arrow`).
- **Phase 7 — Signal Processing, Custom Equations & Hypothesis Testing (v1.0)**:
  - Single-sided FFT & Power Spectral Density (`rustfft`) with `Rectangular`, `Hann`, `Hamming`, and `Blackman` apodization windows.
  - Frequency-domain `LowPass`, `HighPass`, and `BandPass` filtering, plus `MovingAverage`, 5-point quadratic `SavitzkyGolay5` smoothing, and `BaselineSubtractLinear`.
  - Automated spectroscopy peak finder with prominence and Full Width at Half Maximum (FWHM) estimation.
  - Numerical integration (Trapezoidal & Composite Simpson's 1/3 rule) and Monotone Cubic Hermite spline interpolation.
  - Multi-peak Gaussian and Lorentzian spectral deconvolution (`MultiGaussian`, `MultiLorentzian`) and safe recursive-descent user-defined custom equation fitting (`CustomEquation`).
  - Parametric hypothesis testing: One-Sample $t$-Test, Two-Sample Pooled Student's $t$-Test, Welch's $t$-Test, and One-Way ANOVA.
- **Phase 8 — 3D Surface, Wireframe & Matrix Visualization (v1.0)**:
  - Interactive 3D perspective camera projection (`azimuth`, `elevation`, `distance`, `z_scale`) with depth-sorted painter's algorithm rendering and 3D coordinate wireframe cube for `Surface3D`, `Wireframe3D`, `Scatter3D`, `Line3D`, `Waterfall`, and 2D `VectorField` quiver plots.
- **Phase 9 — Reproducible Analysis Workflows (v1.0)**:
  - Reusable `AnalysisWorkflow` pipelines persisted in `.spsproj` archives (`workflows.json`) for automated multi-step data transformation and curve fitting.

## [0.1.0] - 2026-10-16

### Added
- **Desktop Foundation**: Tauri 2 desktop application shell (`src-tauri`) with Undo/Redo stacks and modular Cargo workspace (`scientific-core`, `plot-model`, `data-engine`, `analysis-engine`, `project-engine`).
- **Scientific Spreadsheet**: Virtualized spreadsheet (`@tanstack/react-virtual`) with CSV/TSV/whitespace import and export, automatic delimiter/header/unit detection, cell editing, column role designations (`X`, `Y`, `XError`, `YError`, `Label`, `None`), sorting, filtering, and derived column transformations.
- **2D Plotting Engine**: Renderer-independent `PlotDocument` model and Apache ECharts adapter supporting Scatter, Line, Line+Symbols, Area, and Bar plots, multi-series overlays, error bars, linear/logarithmic scales, Okabe-Ito publication palette, and SVG / high-DPI PNG export.
- **Mathematical Fitting & Statistics**: Descriptive statistics, Pearson correlation, OLS/WLS linear regression, SVD-stabilized polynomial regression (degrees 1–8), and Levenberg-Marquardt nonlinear least squares (`Gaussian`, `Lorentzian`, `Exponential`) with analytical Jacobians, parameter uncertainties, diagnostics, and residual plots.
- **Project Persistence**: Versioned `.spsproj` ZIP container format with atomic saves and reactive dependency recalculation.
