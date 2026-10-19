# Figure & Plot Model Specification (`crates/plot-model`)

## 1. Renderer Independence

`PlotDocument` represents the complete state of a scientific figure independently of any rendering library:
- **Dimensions & Margins**: `FigureDimensions` (`width_px`, `height_px`, `width_cm`, `height_cm`, `dpi`) and `FigureMargins`.
- **Panels (`PlotPanel`)**: Supports single-panel (`1x1`) and multi-panel grid layouts with independent `x_axis` and `y_axis` (`AxisSpec`).
- **Layers (`PlotLayer`)**:
  - `LayerDataSource::DatasetColumns` references `dataset_id`, `x_col`, `y_col`, `x_err_col`, and `y_err_col` by stable IDs.
  - `LayerDataSource::AnalysisOutput` references `analysis_id`, `dataset_id`, and `AnalysisCurveKind` (`FittedCurve`, `Residuals`).
- **Validation**: `PlotDocument::validate()` verifies axis limit ordering (`min < max`) and strictly positive bounds (`> 0`) on `Log10` axes.
