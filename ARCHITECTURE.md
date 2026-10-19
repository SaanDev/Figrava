# Software Architecture — Scientific Plot Studio

## 1. Architectural Principles

1. **Scientific Correctness Over Visual Appearance**: All regression, curve fitting, statistical calculations, and data transformations are implemented in standalone, deterministic Rust crates tested against analytical and synthetic reference datasets.
2. **Renderer-Independent Plot Model**: `crates/plot-model` captures all semantic, geometric, and stylistic properties of a scientific figure independently of any GUI or charting library. The frontend `echartsAdapter.ts` translates `PlotDocument` specifications into Apache ECharts configurations.
3. **Stable Entity Identifiers**: Every entity (`ProjectId`, `DatasetId`, `ColumnId`, `WorksheetId`, `PlotId`, `PanelId`, `LayerId`, `AnalysisId`) uses a persistent UUID-prefixed identifier rather than array indices or mutable display names.
4. **Explicit Reactive Dependency Graph**: `scientific_core::DependencyGraph` tracks directed edges (`Dataset → Worksheet / AnalysisResult → PlotDocument`) with cycle detection and topological invalidation.

## 2. Module Boundaries

| Module | Path | Responsibility |
|---|---|---|
| `scientific-core` | `crates/scientific-core` | Strongly-typed IDs, `ScientificError`, paired numerical array sanitization (`clean_paired_data`), and `DependencyGraph`. |
| `plot-model` | `crates/plot-model` | Renderer-independent `PlotDocument`, `PlotPanel`, `PlotLayer`, `AxisSpec`, `SeriesStyle`, `PlotAnnotation`, and `ExportSpec`. |
| `data-engine` | `crates/data-engine` | `Dataset`, `DataColumn`, `Worksheet`, CSV/TSV/whitespace import/export with delimiter & unit detection, sorting, filtering, and derived column math transforms. |
| `analysis-engine` | `crates/analysis-engine` | Descriptive statistics, Pearson correlation, OLS/WLS linear regression, SVD-stabilized polynomial regression, and Levenberg-Marquardt nonlinear least squares. |
| `project-engine` | `crates/project-engine` | `Project` aggregate root, reactive dependency recalculation, atomic `.spsproj` ZIP container persistence, and starter project templates. |
| `src-tauri` | `src-tauri` | Native Tauri 2 shell, thread-safe `AppState` with Undo/Redo stacks, and typed IPC command handlers. |
| `src` | `src` | React 19 + TypeScript + Tailwind CSS + Zustand + TanStack Virtual + Apache ECharts desktop interface. |
