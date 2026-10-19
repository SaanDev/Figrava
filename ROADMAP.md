# Development Roadmap — Scientific Plot Studio

## Version 0.1 — Minimum Viable Product (Completed)

- [x] **Phase 1: Project Foundation** — Tauri 2 shell, Cargo workspace (`scientific-core`, `plot-model`, `data-engine`, `analysis-engine`, `project-engine`), React + TypeScript + Tailwind CSS + Zustand UI, resizable panels, tab management, light/dark themes, Undo/Redo, and CI pipeline.
- [x] **Phase 2: Scientific Spreadsheet & Data Management** — CSV/TSV/whitespace import and export with delimiter, header, and unit detection; virtualized spreadsheet (`@tanstack/react-virtual`); cell editing; column designations (`X`, `Y`, `Z`, `XError`, `YError`, `Label`, `None`); sorting, filtering, and mathematical column transformations.
- [x] **Phase 3: Core 2D Plotting Engine** — Renderer-independent `PlotDocument` model, Apache ECharts adapter, Scatter / Line / Line+Symbols / Area / Bar plots, multi-series overlays, vertical & horizontal error bars, linear/log10 axes, Okabe-Ito publication palette, and SVG + high-DPI PNG export.
- [x] **Phase 4: Mathematical Fitting & Statistical Analysis** — Descriptive statistics, Pearson correlation, OLS/WLS linear regression, SVD-stabilized polynomial regression, and Levenberg-Marquardt nonlinear fitting (`Gaussian`, `Lorentzian`, `Exponential`) with analytical Jacobians, parameter uncertainties, diagnostics ($R^2$, Adj. $R^2$, RMSE, RSS, $\chi^2_\nu$, AIC, condition number), and residual plots.
- [x] **Phase 5: Project Files & Persistence** — Versioned `.spsproj` ZIP container format, atomic save, reactive dependency recalculation, and round-trip verification.

## Version 0.5 — Advanced Scientific Plotting (Completed)

- [x] **Phase 6: Advanced 2D & Statistical Plotting** — Multi-panel $R \times C$ grid layout editor with automatic `(a)`, `(b)`, `(c)`, `(d)` subfigure labels and shared axes; Histograms, Box-and-Whisker Plots, Violin Density Plots, 2D Heatmaps, Contour Isolines, Polar Coordinate Plots, Stacked Bar/Area plots; scientific colormaps (`Viridis`, `Plasma`, `Inferno`, `CoolWarm`, `Cividis`, `Grayscale`); native Vector PDF 1.4 export (`pdf_export.rs`); Excel `.xlsx` import (`calamine`); and journal style presets (`Nature`, `IEEE`, `ACS`, `Presentation`).

## Version 1.0 — Complete Scientific Workspace (Completed)

- [x] **Phase 7: Signal Processing, Custom Equations & Hypothesis Testing** — Fast Fourier Transform (FFT) power spectral density (`rustfft`) with Rectangular, Hann, Hamming, and Blackman windows; Low-Pass, High-Pass, and Band-Pass frequency filtering; spectroscopy peak detection with prominence and FWHM calculation; Trapezoidal and Simpson's 1/3 numerical integration; Cubic Hermite interpolation; Multi-Peak Gaussian/Lorentzian deconvolution; safe recursive-descent custom equation parser (`y = f(x; p_1, p_2, ...)`), and Student's / Welch's $t$-tests & One-Way ANOVA.
- [x] **Phase 8: 3D Surface, Wireframe & Matrix Visualization** — Interactive 3D perspective projection (`Camera3DSpec` azimuth/elevation/distance) with painter's algorithm depth sorting and 3D coordinate wireframe cube for `Surface3D`, `Wireframe3D`, `Scatter3D`, `Line3D`, `Waterfall`, and 2D `VectorField` quiver plots.
- [x] **Phase 9: Reproducible Analysis Workflows & Release Hardening** — Multi-step `AnalysisWorkflow` pipelines persisted in `.spsproj` (`workflows.json`) for one-click batch execution of baseline subtraction, Savitzky-Golay smoothing, and curve fitting.
