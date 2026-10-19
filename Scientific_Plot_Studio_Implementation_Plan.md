# Scientific Plot Studio

## Software Development and Implementation Plan

**Project type:** Cross-platform scientific visualization and data analysis desktop application  
**Working name:** Scientific Plot Studio  
**Technology:** Rust, Tauri 2, React, TypeScript  
**Platforms:** Windows, Linux, macOS  
**Development approach:** Modular architecture, incremental releases, and agentic coding  
**Long-term goal:** A modern, open-source alternative to OriginPro for scientific data analysis and publication-quality plotting.

---

# 1. Project Overview

## 1.1 Introduction

Scientific Plot Studio will be a desktop application designed for researchers, scientists, engineers, and university students to visualize, analyze, and present scientific data.

The software will provide an integrated environment for importing datasets, manipulating numerical values, producing scientific graphs, performing mathematical and statistical analysis, fitting experimental data, and preparing publication-quality figures.

The application should be accessible to users who have limited programming experience while providing advanced capabilities for experienced researchers.

## 1.2 Main Objectives

1. Develop a modern, intuitive scientific plotting environment.
2. Support a wide variety of 2D and 3D scientific graph types.
3. Implement reliable mathematical and statistical analysis tools.
4. Provide interactive curve fitting with diagnostic information.
5. Support extensive customization of graphs and scientific figures.
6. Enable reproducible scientific data processing and analysis.
7. Support common scientific data formats.
8. Provide high-quality raster and vector graphics export.
9. Build a modular system that supports future extensions.
10. Maintain cross-platform compatibility and efficient performance.

## 1.3 Development Principles

- Scientific correctness must take priority over visual appearance.
- All numerical calculations should be performed by tested Rust modules.
- The interface should remain responsive during data processing.
- Original imported data should not be modified without an explicit user action.
- Graphs and analysis results should remain linked to their source data.
- Projects should preserve datasets, calculations, figures, and formatting.
- Features should be implemented incrementally.
- The application should work offline for its core functionality.
- The software should remain maintainable as its capabilities expand.

---

# 2. Scope and Release Strategy

Attempting to reproduce every OriginPro feature in the first release would create unnecessary complexity. Development will therefore be divided into three major release levels.

## Version 0.1: Minimum Viable Product

- Scientific spreadsheet and CSV importing.
- XY scatter and line plotting.
- Multiple datasets in a single graph.
- Essential graph formatting.
- Linear and polynomial regression.
- Basic descriptive statistics.
- Graph export to PNG and SVG.
- Project saving and reopening.

## Version 0.5: Advanced Scientific Plotting

- Additional scientific plot types.
- Nonlinear fitting.
- Statistical graphs.
- Error bars.
- Multi-panel figures.
- Data transformations.
- Figure templates.
- More comprehensive formatting.
- Excel and additional data format support.
- PDF export.

## Version 1.0: Complete Scientific Workspace

- Advanced analysis and signal processing.
- Custom fitting functions.
- Analysis reports.
- Batch processing.
- Reusable analysis workflows.
- Expanded statistical tests.
- 3D graphing.
- Scripting and automation interfaces.
- Improved handling of large datasets.
- A stable project format and documented extension interfaces.

Specialized analysis modules and optional AI capabilities can be developed after the core application is stable.

---

# 3. Technology Stack

## 3.1 Desktop Framework

**Tauri 2**

Responsibilities:

- Native desktop window management.
- Application menus and shortcuts.
- File access and save dialogs.
- Communication between the frontend and Rust backend.
- Application settings.
- Cross-platform packaging.
- Software updates in later releases.

## 3.2 Frontend

**React + TypeScript + Vite**

Additional technologies:

- Tailwind CSS for interface styling.
- Zustand for application state management.
- TanStack Virtual for efficient large-table rendering.
- Apache ECharts for initial interactive visualization.
- Lucide icons for interface controls.

Responsibilities:

- Graphical interface.
- Spreadsheet interaction.
- Plot customization.
- Figure layout controls.
- Project navigation.
- Analysis dialogs.
- Visualization and user feedback.

## 3.3 Rust Scientific Backend

| Library | Purpose |
|---|---|
| Polars | DataFrame operations |
| ndarray | Numerical arrays |
| nalgebra | Linear algebra |
| levenberg-marquardt | Nonlinear least-squares optimization |
| statrs | Statistical functions |
| rustfft | Fourier transforms |
| serde | Data serialization |
| csv | CSV handling |
| calamine | Excel importing |
| rusqlite | Local metadata and settings |
| rayon | Parallel computation |

Dependencies should be introduced only when required by an implemented feature. Exact versions should be pinned and reviewed for compatibility.

## 3.4 Visualization Engine Strategy

Initially, use Apache ECharts for interactive graphs. All plotting information must nonetheless be maintained in an independent application-level plot model.

The model should describe:

- Datasets and column references.
- Plot types and plot layers.
- Axes and coordinate systems.
- Colors, symbols, and line styles.
- Legends, labels, and annotations.
- Figure dimensions.
- Panel arrangement.
- Export settings.

A rendering adapter will translate this model into ECharts configurations. This allows the renderer to be replaced or extended later without redesigning the entire project.

Use Canvas rendering for interactive plots where appropriate and SVG rendering for initial vector export. Evaluate PDF export and a more advanced Rust-based renderer after the first release. Check the on-screen and exported figures for visual consistency.

---

# 4. Software Architecture

## 4.1 Main Components

### A. User Interface

- Main window.
- Project explorer.
- Spreadsheet editor.
- Graph editor.
- Analysis interface.
- Properties inspector.
- Results viewer.
- Status and progress indicators.

### B. Data Management Engine

- Import and export.
- Dataset storage.
- Column definitions.
- Data types and missing values.
- Filtering and sorting.
- Data transformation.
- Dataset references.
- Data-change notifications.

### C. Plotting Engine

- Plot document model.
- Plot layer management.
- Coordinate transformations.
- Axis configuration.
- Graph formatting.
- Annotations and legends.
- Figure arrangement.
- Export preparation.

### D. Scientific Analysis Engine

- Statistical functions.
- Linear regression.
- Polynomial regression.
- Nonlinear curve fitting.
- Residual analysis.
- Numerical integration.
- Numerical differentiation.
- Signal processing.
- Uncertainty calculations.

### E. Project Management Engine

- Project creation.
- Saving and loading.
- Dataset and graph relationships.
- Analysis settings.
- Undo and redo.
- Autosave and recovery.
- Project format migration.

### F. Automation System

To be introduced in later versions:

- Reusable analysis workflows.
- Batch operations.
- Script execution.
- Custom analysis functions.
- Optional AI-assisted operations.

## 4.2 Suggested Repository Structure

Use a Cargo workspace for the scientific backend.

```text
scientific-plot-studio/
├── src/                      # React frontend
│   ├── components/           # Reusable UI elements
│   ├── features/             # Spreadsheet, plotting, fitting, etc.
│   ├── stores/               # Frontend state
│   ├── services/             # Typed Tauri communication
│   ├── types/                # TypeScript definitions
│   └── styles/               # Themes and styles
├── src-tauri/                # Tauri shell
│   └── src/
│       ├── commands/        # Tauri commands
│       ├── state/           # App state
│       └── lib.rs           # Integration
├── crates/
│   ├── scientific-core/     # Core mathematical utilities
│   ├── data-engine/         # Dataset management
│   ├── plot-model/          # Independent figure/graph model
│   ├── analysis-engine/     # Regression, fitting, statistics
│   └── project-engine/      # Serialization and recovery
├── tests/                    # Integration/reference tests
├── fixtures/                 # Sample datasets
└── docs/                     # Technical documentation
```

Each backend crate should be testable without launching the desktop application.

## 4.3 Core Data Models

**Dataset:** Unique ID, source information, column definitions, data types, units, missing-value information, and data storage references.

**Worksheet:** Dataset references, column display settings, editing state, and calculated-column definitions.

**PlotDocument:** Figure dimensions, panels, axes, plot layers, annotations, legends, and styling.

**PlotLayer:** Plot type, dataset reference, selected columns, error columns, and series formatting.

**AnalysisResult:** Source dataset and selection, model definition, parameter values, fit settings, diagnostics, and generated output data.

**Project:** Version information, worksheets, datasets, plot documents, analysis results, and project settings.

Use stable IDs rather than relying on array positions or column names alone.

## 4.4 Dependency Management

Graphs and analysis results must update when their source data changes.

```text
Dataset → Transformation → Fitting Result → Graph Layer
```

Track dependencies explicitly, invalidate dependent results when data changes, and recalculate only when necessary. Detect and reject circular dependencies.

---

# 5. User Interface Design

## 5.1 Main Window

### Top Menu and Toolbar

Menus: File, Edit, Data, Plot, Analysis, Format, Window, Tools, Help.

Common actions: New project, Open dataset, Save project, Undo/Redo, Create graph, Fit curve, Export figure.

### Left Panel: Project Explorer

```text
Project
├── Workbooks
│   ├── Worksheet 1
│   └── Worksheet 2
├── Graphs
│   ├── Graph 1
│   └── Graph 2
└── Analysis
    ├── Linear Fit 1
    └── Gaussian Fit 1
```

### Central Workspace

A tab-based interface for spreadsheets, individual figures, multi-panel figures, and analysis reports. Switching tabs must preserve document state.

### Right Panel: Properties Inspector

Context-sensitive editing of axes, plot types, line and symbol properties, colors, fonts, legends, and figure dimensions.

### Bottom Panel

Status messages, processing progress, warnings, analysis summaries, and optional logs.

## 5.2 Visual Design Requirements

- Minimal, professional appearance.
- Light and dark themes.
- Consistent icons and controls.
- Resizable panels.
- Clear numerical input fields.
- Keyboard shortcuts and context menus.
- Responsive interaction.
- Accessible keyboard navigation.
- Correct display scaling.

Users should be able to customize most graph properties without writing code.

---

# 6. Detailed Implementation Phases

## Phase 1: Project Foundation

**Objective:** Create a functional desktop framework with the final project's basic architecture.

### Tasks

- [ ] Initialize the Tauri 2 project.
- [ ] Configure React and TypeScript.
- [ ] Configure Tailwind CSS.
- [ ] Create the Cargo workspace.
- [ ] Establish frontend/backend communication.
- [ ] Implement the application layout.
- [ ] Create the top menu and toolbar.
- [ ] Create resizable workspace panels.
- [ ] Implement tab management.
- [ ] Add light and dark themes.
- [ ] Configure error handling and logging.
- [ ] Add Rust and frontend testing.
- [ ] Configure continuous integration.

### Acceptance Criteria

- Application launches successfully.
- Menus and panels function correctly.
- Tabs can be opened and closed.
- A frontend command successfully invokes the Rust backend.
- Automated tests and builds pass.

**Milestone:** Functional desktop application framework.

## Phase 2: Scientific Spreadsheet and Data Management

**Objective:** Build the data workspace used by plotting and analysis.

### Core Features

**Initial imports:** CSV, TSV, and whitespace-delimited text.

**Later imports:** XLSX, Parquet, JSON, FITS, HDF5, and NetCDF.

**Spreadsheet:** Editable cells, worksheets, column names/types, numeric/text values, missing values, selection, copy/paste, sorting, filtering, and X/Y/X-error/Y-error column designations.

**Data operations:** Rename, add, remove, and duplicate columns; calculate basic statistics; export selected data.

### Tasks

- [ ] Implement Rust dataset models.
- [ ] Implement CSV and TSV import.
- [ ] Add delimiter/header detection with overrides.
- [ ] Validate numeric and missing values.
- [ ] Develop a virtualized spreadsheet component.
- [ ] Implement cell editing.
- [ ] Implement column selection and designation.
- [ ] Implement basic sorting and filtering.
- [ ] Add dataset management commands.
- [ ] Implement CSV export.
- [ ] Test data integrity.

### Acceptance Criteria

- CSV can be opened and inspected.
- Edited data can be exported.
- X/Y columns can be selected.
- Missing/invalid values are handled predictably.
- Large tables do not require rendering every row.

**Milestone:** Functional scientific data workspace.

## Phase 3: Core 2D Plotting Engine

**Objective:** Produce interactive graphs linked to spreadsheet data.

### Initial Plot Types

- Scatter plot.
- Line plot.
- Line with symbols.
- Multiple XY series.
- Basic vertical/horizontal error bars.

### Interactive Features

- Zoom, pan, auto-range, reset view.
- Point inspection.
- Series selection.
- Graph duplication.
- Show/hide datasets.

### Formatting

**Axes:** Titles, linear/log scales, limits, major/minor ticks, tick labels, grid lines, visibility.

**Series:** Colors, line width/style, symbol shape/size/color, opacity, legend label.

**Figure:** Title, background, dimensions, margins, font, legend position.

### Tasks

- [ ] Define renderer-independent plot model.
- [ ] Create plot document store.
- [ ] Implement ECharts adapter.
- [ ] Render scatter and line plots.
- [ ] Support multiple datasets.
- [ ] Add navigation interactions.
- [ ] Create axis controls.
- [ ] Create series formatting controls.
- [ ] Sync graphs with source data.
- [ ] Implement graph duplication.
- [ ] Add basic error bars.
- [ ] Implement SVG and PNG export.

### Acceptance Criteria

- Users can create and format XY graphs.
- Data edits update dependent plots.
- Multiple datasets can appear in one graph.
- Export retains titles, axes, and legends.
- Saved projects preserve formatting.

**Milestone:** Functional scientific plotting application.

## Phase 4: Mathematical Fitting and Statistical Analysis

**Objective:** Provide scientifically reliable regression and fitting.

### 4.1 Models

**Linear:** `y = m*x + c`

**Polynomial:** `y = a0 + a1*x + a2*x^2 + ...`

**Exponential:** `y = A*exp(B*x) + C`

**Gaussian:** `y = A*exp(-(x - mu)^2/(2*sigma^2)) + C`

**Lorentzian:** `y = A*gamma^2/((x - x0)^2 + gamma^2) + C`

Implement linear and low-order polynomial regression first, then nonlinear models once validated.

### 4.2 Fitting Interface

- Dataset and fitting-range selection.
- Model selection.
- Parameter initialization.
- Optional bounds when supported.
- Optional weighting.
- Fit execution and preview.
- Parameter table.
- Residual plot.
- Results export.

### 4.3 Diagnostics

- Residual sum of squares.
- R².
- RMSE.
- Adjusted R² where meaningful.
- Reduced chi-square when measurement uncertainties justify it.
- Parameter standard errors under stated assumptions.
- Convergence status and warnings.

Optimization success must not be confused with statistical goodness of fit.

### 4.4 Basic Statistics

Mean, median, variance, standard deviation, min/max, Pearson correlation, and linear regression summaries.

### Tasks

- [ ] Define analysis-result model.
- [ ] Implement linear least squares.
- [ ] Implement numerically stable polynomial least squares.
- [ ] Implement nonlinear least squares.
- [ ] Add initial parameter estimation where practical.
- [ ] Calculate diagnostics and residuals.
- [ ] Develop the fitting dialog.
- [ ] Render fitted curves.
- [ ] Create fitting results table.
- [ ] Implement statistical summaries.
- [ ] Add reference-based numerical tests.

### Acceptance Criteria

- Known synthetic parameters are recovered within justified tolerances.
- Failed/ill-conditioned fits generate warnings.
- Residuals can be inspected.
- Fitted curves appear alongside observations.
- Results remain linked to source data.

**Milestone:** Functional scientific analysis environment.

## Phase 5: Project Files and Data Persistence

**Objective:** Preserve complete research sessions.

### Features

- New/Open/Save/Save As.
- Store datasets, worksheets, figures, analyses, and metadata.
- Restore tabs and settings.
- Track unsaved changes.
- Autosave and recovery.

### Project Format

Use a versioned `.spsproj` project container containing a manifest, embedded datasets or references, plot specifications, and analysis configurations. A ZIP-compatible container with JSON metadata and efficient columnar data is a practical approach.

Manage external references carefully so that embedded data remains available if source files move.

### Tasks

- [ ] Define project format version 1.
- [ ] Implement serialization and loading.
- [ ] Restore figures and analyses.
- [ ] Add Save and Save As.
- [ ] Handle unsaved changes.
- [ ] Implement atomic saves.
- [ ] Add autosave and crash recovery.
- [ ] Test project round trips.

### Acceptance Criteria

- Projects reopen with datasets, styles, graphs, and results intact.
- Interrupted saving does not silently corrupt the previous valid project.
- Unsupported future versions generate meaningful errors.

**Milestone:** Reproducible, persistent scientific projects.

## Phase 6: Advanced Graph Formatting and Figure Production

**Objective:** Produce publication-quality figures.

### Additional Plot Types

Histogram, box plot, violin plot, heatmap, contour, polar, filled-area, and stacked plots.

### Multi-Panel Figures

Vertical, horizontal, and grid arrangements; shared/independent axes; subfigure labels; adjustable spacing; inset plots.

### Advanced Formatting

Independent top/right axes, secondary axes, custom tick labels, mathematical symbols, text annotations, arrows, reference lines, error-bar controls, custom color maps, and style presets.

### Export

PNG at specified resolution, SVG, vector PDF, transparent backgrounds, and dimensions in centimeters or inches.

### Tasks

- [ ] Extend plot document models.
- [ ] Add plotting types.
- [ ] Implement figure panel layout.
- [ ] Build annotation tools.
- [ ] Add advanced axis controls.
- [ ] Develop figure templates.
- [ ] Extend SVG export.
- [ ] Implement PDF export.
- [ ] Validate layout/font consistency.

### Acceptance Criteria

- Multi-panel figures can be created.
- Formatting remains editable.
- Physical export dimensions are predictable.
- Vector export retains intended graphics.
- Visual export tests pass on supported platforms.

**Milestone:** Publication-oriented figure editor.

## Phase 7: Advanced Data Analysis

**Objective:** Expand numerical tools.

### Numerical Analysis

- Numerical differentiation.
- Trapezoidal/Simpson integration.
- Interpolation and resampling.
- Smoothing.
- Baseline correction.
- Normalization.

### Signal Processing

- FFT and power spectrum.
- Window functions.
- Frequency filtering.
- Peak detection.
- Signal correlation.

### Advanced Fitting

- Custom equations.
- Parameter constraints.
- Weighted fitting.
- Multi-peak fitting.
- Confidence/prediction intervals.
- Batch fitting.

### Statistical Analysis

- Hypothesis testing.
- ANOVA.
- Probability distributions.
- Statistical confidence intervals.
- Additional regression methods.

Document assumptions and compare numerical methods with trusted references.

**Milestone:** Expanded scientific analysis suite.

## Phase 8: Advanced Visualization

**Objective:** Add specialized visualization.

- 3D scatter and line plots.
- Surface and wireframe plots.
- 3D contours.
- Waterfall plots.
- Vector-field visualization.
- Large matrix visualization.

Evaluate a dedicated 3D renderer rather than forcing all interactions into the initial 2D engine.

**Milestone:** Advanced 2D and 3D scientific visualization.

## Phase 9: Automation and Extensibility

**Objective:** Automate repeated analysis.

### Initial Features

- Batch importing.
- Saved analysis workflows.
- Graph templates.
- Batch figure export.
- Reusable fitting configurations.

### Later Features

- Scripting interface.
- Custom numerical functions.
- Extension API.
- User-defined plotting methods.
- Optional AI analysis assistant.

The AI assistant should translate natural-language requests into explicit operations for user review. Verified routines must perform all numerical calculations.

**Milestone:** Extensible scientific research environment.

---

# 7. Scientific Accuracy and Validation

Scientific accuracy is a release requirement.

## 7.1 Numerical Testing

For every algorithm:

1. Document the mathematical method.
2. Define input and output types.
3. Establish supported parameter ranges.
4. Identify invalid inputs and failures.
5. Create reference test cases.
6. Compare against trusted numerical implementations.
7. Define tolerances.
8. Document assumptions and limitations.

## 7.2 Fitting Validation

Use synthetic test cases with known parameters: straight lines, polynomials, Gaussian peaks, nonlinear models with varying noise, and datasets with missing values/outliers.

## 7.3 Plotting Validation

Check coordinate transforms, logarithmic/reversed axes, error bars, notation, extremes of numeric ranges, empty datasets, missing values, dimensions, export scaling, and multi-panel alignment.

## 7.4 Performance Validation

Benchmark datasets of approximately 1,000; 100,000; 1,000,000; and 10,000,000 rows. Measure import time, memory, interaction, transformations, fitting, and export. Record hardware specifications and benchmark conditions.

Preview graphs may be downsampled, but numerical analysis must use original selected data unless explicitly requested otherwise.

---

# 8. Agentic Coding Development Strategy

Use AI coding agents for scoped implementation, testing, documentation, and review. Work in small tasks with measurable completion criteria.

## 8.1 Agent Responsibilities

### Architecture Agent

- Architectural consistency, interfaces, dependencies, module boundaries, technical debt.

### Rust Scientific Agent

- Numerical algorithms, data processing, fitting, statistics, reference tests.

### Frontend Agent

- React components, layout, spreadsheet, graph controls, formatting, interactions.

### Integration Agent

- Tauri commands, state synchronization, persistence, error handling.

### Testing and Review Agent

- Code review, test coverage, scientific validation, regressions, performance, security.

These are logical responsibilities and may be assigned to different agents or one agent operating in distinct roles.

## 8.2 Coding Workflow

1. Write a feature specification.
2. Define inputs, outputs, and acceptance criteria.
3. Identify modules involved.
4. Implement the smallest useful component.
5. Create automated tests.
6. Run compilation and static checks.
7. Review code changes.
8. Integrate the feature.
9. Test the user interface.
10. Commit the completed change.

Do not let an agent redesign unrelated components when delivering a focused feature.

## 8.3 Required Quality Checks

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Also run TypeScript checking, frontend linting, frontend tests, production builds, and relevant manual UI tests. Do not mark tasks complete when required tests fail.

## 8.4 Coding Agent Task Template

- **Task ID:** Unique milestone/feature identifier.
- **Objective:** Feature to implement.
- **Scope:** Files and modules allowed to change.
- **Requirements:** Functional and scientific behavior.
- **Acceptance criteria:** Demonstrable completion conditions.
- **Tests:** Unit, integration, and reference tests.
- **Constraints:** Architecture and compatibility.
- **Deliverables:** Code, tests, documentation.
- **Review:** Changes, limitations, outstanding issues.

## 8.5 Example Agent Task

**Task:** Implement linear regression in the Rust analysis engine.

### Requirements

- Accept numeric X and Y arrays.
- Validate dimensions.
- Handle invalid/missing values explicitly.
- Use stable least-squares fitting.
- Return slope and intercept.
- Calculate fitted values and residuals.
- Calculate appropriate fit statistics.
- Return meaningful errors for degenerate datasets.

### Acceptance Criteria

- Accurate on perfect straight-line data.
- Accurate within tolerances on noisy data.
- Detects insufficient observations and constant-X cases.
- Passes reference tests.
- Has no frontend dependency.

**Following task:** Expose the tested operation through a typed Tauri command.

---

# 9. Development Priorities

| Feature | Priority | Target release |
|---|---|---|
| Desktop framework | Critical | v0.1 |
| CSV import | Critical | v0.1 |
| Spreadsheet | Critical | v0.1 |
| Scatter and line plots | Critical | v0.1 |
| Graph formatting | Critical | v0.1 |
| Linear regression | Critical | v0.1 |
| Polynomial regression | High | v0.1 |
| Project saving | Critical | v0.1 |
| PNG/SVG export | Critical | v0.1 |
| Error bars | High | v0.1 or v0.5 |
| Nonlinear fitting | High | v0.5 |
| Multi-panel plots | High | v0.5 |
| Statistical plots | High | v0.5 |
| PDF export | High | v0.5 |
| Data transformations | High | v0.5 |
| Signal processing | Medium | v1.0 |
| Custom fitting equations | Medium | v1.0 |
| 3D plots | Medium | v1.0 |
| Batch analysis | Medium | v1.0 |
| AI assistant | Optional | Future |
| Extension system | Optional | Future |

Release labels are planning targets and may change based on testing and progress.

---

# 10. Development Risks

| Risk | Mitigation |
|---|---|
| Excessive feature scope | Keep releases small and testable |
| Inaccurate scientific calculations | Independent tests and reference datasets |
| Plot rendering limitations | Renderer-independent plot model |
| Large-dataset performance | Virtualization, Rust storage, preview sampling |
| Inconsistent export | Common plot specification and visual regression tests |
| Project corruption | Atomic saves, backups, recovery |
| Unmaintainable AI-generated code | Small tasks, review, documentation |
| Dependency conflicts | Pin compatible versions and review upgrades |
| Platform-specific issues | Test Windows, Linux, macOS independently |
| Loss of data provenance | Preserve sources and analysis parameters |

---

# 11. Documentation

Maintain:

- `README.md` — Project overview and setup.
- `ARCHITECTURE.md` — Design decisions and module structure.
- `ROADMAP.md` — Phases and progress.
- `CONTRIBUTING.md` — Contribution guidelines.
- `TESTING.md` — Scientific/software testing.
- `CHANGELOG.md` — Release history.
- `docs/data-model.md` — Dataset/worksheet definitions.
- `docs/plot-model.md` — Figure/plot specifications.
- `docs/analysis-engine.md` — Algorithms and assumptions.
- `docs/project-format.md` — Project file specification.
- `docs/agent-guidelines.md` — AI coding agent instructions.

Update documentation as part of each feature, not only at the end.

---

# 12. Minimum Viable Product Completion Checklist

Version 0.1 is complete when users can:

- [ ] Create a new project.
- [ ] Import a CSV dataset.
- [ ] View/edit data in a spreadsheet.
- [ ] Select X/Y columns.
- [ ] Create a scatter plot.
- [ ] Add a second data series.
- [ ] Customize axes, symbols, lines, and fonts.
- [ ] Select a fitting model.
- [ ] Perform linear/polynomial fitting.
- [ ] Inspect fit parameters and residuals.
- [ ] Add the fitted curve to the graph.
- [ ] Export PNG or SVG.
- [ ] Save the entire project.
- [ ] Reopen it without losing data or formatting.
- [ ] Pass numerical/integration tests.
- [ ] Build a distributable app for the first supported OS.

This end-to-end workflow is the principal acceptance test for v0.1.

---

# 13. Final Development Strategy

Build in this order:

**Foundation → Spreadsheet → Plotting → Fitting → Project Saving → Advanced Formatting → Extended Analysis → 3D Visualization → Automation**

Prioritize a usable, validated application at every milestone. The first release must demonstrate that spreadsheet data, visualization, fitting, figure customization, and persistence work reliably together.

As those systems mature, expand plotting and analysis without replacing the core architecture. The longer-term goal is a scientific environment combining the capabilities of established plotting tools with a modern interface, transparent numerical calculations, reproducibility, and cross-platform support.

---

# Technical References

- [Tauri 2: Calling Rust](https://v2.tauri.app/develop/calling-rust/)
- [Polars User Guide](https://docs.pola.rs/user-guide/)
- [Apache ECharts: Canvas vs SVG](https://echarts.apache.org/handbook/en/best-practices/canvas-vs-svg/)
- [Rust levenberg-marquardt](https://docs.rs/levenberg-marquardt/latest/levenberg_marquardt/)

**Recommended starting point:** Define the plot model before building the editor, then implement Phases 1–3 as the initial foundation.
