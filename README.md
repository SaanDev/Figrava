# Scientific Plot Studio

**Scientific Plot Studio** is a cross-platform scientific visualization, curve fitting, and data analysis desktop application built with **Rust**, **Tauri 2**, **React**, and **TypeScript**.

## Key Capabilities (v0.1 MVP)

- **Scientific Spreadsheet & Data Workspace (`crates/data-engine`)**:
  - Import and export CSV, TSV, and whitespace-delimited datasets with automatic delimiter, header, physical unit (`[nm]`, `(uM)`), and column role detection.
  - Virtualized spreadsheet editor (`@tanstack/react-virtual`) supporting large tables, inline cell editing, column role designations (`X`, `Y`, `XError`, `YError`, `Label`, `None`), sorting, filtering, and derived column mathematical transformations (`Scale + Offset`, `Log10`, `Ln`, `Min-Max Normalize`, `Z-Score`, `First Derivative`, `Cumulative Integral`).
- **Renderer-Independent 2D Plotting Engine (`crates/plot-model` + Apache ECharts Adapter)**:
  - Scatter, Line, Line + Symbols, Area, and Bar plots with multi-series overlays and vertical/horizontal error bars.
  - Linear and logarithmic (`log10`) axes, reversible coordinates, major/minor grids, scientific notation, Okabe-Ito colorblind-safe publication palette, and customizable typography.
  - Vector **SVG** and high-resolution **PNG** (150 / 300 / 600 DPI) figure export.
- **Verified Scientific Analysis & Curve Fitting (`crates/analysis-engine`)**:
  - Descriptive statistics (Mean, Variance, SD, SEM, Quartiles, Median, IQR, Skewness) and Pearson correlation.
  - Weighted and unweighted Linear Least Squares ($y = m x + c$).
  - SVD-stabilized, domain-centered Polynomial Least Squares ($y = \sum_{k=0}^d a_k x^k$, degrees 1–8) with exact binomial Jacobian covariance transformation.
  - Levenberg-Marquardt Nonlinear Least Squares for **Gaussian Peak**, **Lorentzian Peak**, and **Exponential** models with analytical Jacobians, automatic initial parameter estimation, parameter standard errors, 95% confidence intervals, $R^2$, Adjusted $R^2$, RMSE, RSS, Reduced Chi-Square ($\chi^2_\nu$), AIC, condition number diagnostics, and residual plots.
- **Reproducible Project Persistence (`crates/project-engine`)**:
  - Versioned `.spsproj` ZIP container format storing manifest, datasets, worksheets, figures, analysis results, and explicit dependency graph (`Dataset → Analysis → PlotLayer`).
  - Atomic file saving and automatic downstream recalculation when source data cells change.

## Repository Structure

```text
scientific-plot-studio/
├── src/                      # React + TypeScript + Tailwind CSS frontend
│   ├── components/           # TopMenuToolbar, ProjectExplorer, PropertiesInspector, StatusBar, Modals
│   ├── features/             # Spreadsheet, Plotting (ECharts adapter), Analysis Report
│   ├── stores/               # Zustand workspace state store
│   ├── services/             # Typed Tauri IPC client & browser/test fallback
│   ├── types/                # TypeScript domain definitions
│   └── styles/               # Tailwind CSS theme
├── src-tauri/                # Tauri 2 native desktop shell, commands, and undo/redo state
├── crates/
│   ├── scientific-core/      # Entity IDs, error handling, numerical sanitization, DependencyGraph
│   ├── plot-model/           # Renderer-independent figure and plot layer specification
│   ├── data-engine/          # Dataset/Worksheet models, CSV/TSV I/O, column transforms
│   ├── analysis-engine/      # Statistics, OLS/WLS linear, SVD polynomial, LM nonlinear fitting
│   └── project-engine/       # .spsproj container serialization, atomic save, reactive recalculation
├── fixtures/                 # Sample scientific CSV/TSV datasets
└── docs/                     # Technical and mathematical specifications
```

## Quick Start & Quality Checks

### Prerequisites
- **Rust** (stable toolchain via `rustup`)
- **Node.js** (v20+) and **npm**

### Commands
```bash
# Install frontend dependencies
npm install

# Run Rust formatting, linting, and numerical/integration test suites
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# Run TypeScript typechecking, frontend unit tests, and production bundle build
npm run typecheck
npm test
npm run build
```
