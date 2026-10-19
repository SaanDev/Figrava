// TypeScript domain models matching the Rust scientific backend crates 1:1.

export type ColumnRole = "x" | "y" | "z" | "x_error" | "y_error" | "label" | "none";
export type ColumnDataType = "numeric" | "text";

export type CellValue =
  | { kind: "numeric"; value: number }
  | { kind: "text"; value: string }
  | { kind: "missing" };

export interface DataColumn {
  id: string;
  name: string;
  long_name: string | null;
  unit: string | null;
  comments: string | null;
  role: ColumnRole;
  data_type: ColumnDataType;
  values: CellValue[];
  formula: string | null;
}

export type DatasetSource =
  | { source_type: "manual" }
  | {
      source_type: "imported_delimited";
      file_name: string;
      delimiter: string;
      has_header: boolean;
    }
  | {
      source_type: "imported_excel";
      file_name: string;
      sheet_name: string;
    }
  | {
      source_type: "synthesized";
      description: string;
    };

export interface Dataset {
  id: string;
  name: string;
  source: DatasetSource;
  columns: DataColumn[];
}

export type FilterCondition =
  | { condition: "greater_than"; value: number }
  | { condition: "less_than"; value: number }
  | { condition: "between"; min: number; max: number }
  | { condition: "not_missing" }
  | { condition: "text_contains"; query: string };

export interface Worksheet {
  id: string;
  name: string;
  dataset_id: string;
  active_filter_col: string | null;
  active_filter: FilterCondition | null;
}

export type PlotType =
  | "scatter"
  | "line"
  | "line_symbols"
  | "area"
  | "bar"
  | "histogram"
  | "box_plot"
  | "violin"
  | "heatmap"
  | "contour"
  | "polar"
  | "stacked_bar"
  | "stacked_area"
  | "scatter_3d"
  | "line_3d"
  | "surface_3d"
  | "wireframe_3d"
  | "waterfall"
  | "vector_field";

export type ColorMapKind =
  | "viridis"
  | "plasma"
  | "inferno"
  | "cool_warm"
  | "cividis"
  | "grayscale";

export interface Camera3DSpec {
  azimuth_deg: number;
  elevation_deg: number;
  distance: number;
  z_scale: number;
  pan_x?: number;
  pan_y?: number;
  show_box?: boolean;
}

export type AxisScale = "linear" | "log10";
export type LineStyle = "solid" | "dashed" | "dotted" | "dash_dot";
export type SymbolShape =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "cross"
  | "plus"
  | "none";

export type LegendPosition =
  | "top_right"
  | "top_left"
  | "bottom_right"
  | "bottom_left"
  | "outside_right"
  | "outside_top";

export type ExportFormat = "png" | "svg" | "pdf";

export interface AxisSpec {
  title: string;
  unit: string | null;
  scale: AxisScale;
  min: number | null;
  max: number | null;
  reversed: boolean;
  show_major_grid: boolean;
  show_minor_grid: boolean;
  major_tick_count: number | null;
  minor_tick_split: number;
  visible: boolean;
  scientific_notation: boolean;
  font_size: number;
  show_top_right_border?: boolean;
}

export interface SeriesStyle {
  color: string;
  line_width: number;
  line_style: LineStyle;
  symbol_shape: SymbolShape;
  symbol_size: number;
  symbol_filled: boolean;
  opacity: number;
  show_error_bars: boolean;
  error_bar_cap_width: number;
  error_bar_line_width: number;
  use_secondary_y_axis?: boolean;
  histogram_bins?: number;
}

export type AnalysisCurveKind =
  | "fitted_curve"
  | "residuals"
  | "confidence_band_upper"
  | "confidence_band_lower";

export type LayerDataSource =
  | {
      source_type: "dataset_columns";
      dataset_id: string;
      x_col: string;
      y_col: string;
      z_col?: string | null;
      x_err_col: string | null;
      y_err_col: string | null;
    }
  | {
      source_type: "analysis_output";
      analysis_id: string;
      dataset_id: string;
      curve_kind: AnalysisCurveKind;
    };

export interface PlotLayer {
  id: string;
  label: string;
  visible: boolean;
  plot_type: PlotType;
  source: LayerDataSource;
  style: SeriesStyle;
  panel_id: string;
}

export type PlotAnnotation =
  | {
      kind: "text";
      id: string;
      text: string;
      x: number;
      y: number;
      color: string;
      font_size: number;
    }
  | {
      kind: "reference_line";
      id: string;
      label: string;
      axis: string;
      value: number;
      color: string;
      line_style: LineStyle;
      line_width: number;
    }
  | {
      kind: "arrow";
      id: string;
      label: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      line_width: number;
    };

export interface LegendSpec {
  visible: boolean;
  position: LegendPosition;
  frame_visible: boolean;
  font_size: number;
}

export interface FigureMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FigureDimensions {
  width_px: number;
  height_px: number;
  width_cm: number;
  height_cm: number;
  dpi: number;
}

export interface ExportSpec {
  format: ExportFormat;
  dpi: number;
  width_px: number;
  height_px: number;
  transparent_background: boolean;
}

export interface PlotPanel {
  id: string;
  title: string | null;
  subfigure_label?: string | null;
  row: number;
  col: number;
  is_inset?: boolean;
  inset_rect?: [number, number, number, number] | null;
  x_axis: AxisSpec;
  y_axis: AxisSpec;
  secondary_y_axis?: AxisSpec | null;
  z_axis?: AxisSpec | null;
}

export interface PlotDocument {
  id: string;
  name: string;
  title: string;
  subtitle: string | null;
  background_color: string;
  font_family: string;
  base_font_size: number;
  dimensions: FigureDimensions;
  margins: FigureMargins;
  legend: LegendSpec;
  grid_rows: number;
  grid_cols: number;
  shared_x_axis?: boolean;
  shared_y_axis?: boolean;
  panel_spacing?: number;
  colormap?: ColorMapKind;
  camera_3d?: Camera3DSpec;
  style_preset?: string | null;
  panels: PlotPanel[];
  layers: PlotLayer[];
  annotations: PlotAnnotation[];
  export_spec: ExportSpec;
}

export type FitModelKind =
  | { model_type: "linear" }
  | { model_type: "polynomial"; degree: number }
  | { model_type: "exponential" }
  | { model_type: "gaussian" }
  | { model_type: "lorentzian" }
  | { model_type: "multi_gaussian"; peaks: number }
  | { model_type: "multi_lorentzian"; peaks: number }
  | {
      model_type: "custom_equation";
      expression: string;
      parameters: string[];
    };

export interface FitParameter {
  name: string;
  value: number;
  std_error: number;
  t_value: number;
  p_value: number;
  ci_lower_95: number;
  ci_upper_95: number;
}

export interface FitDiagnostics {
  observations: number;
  dropped_missing: number;
  degrees_of_freedom: number;
  rss: number;
  tss: number;
  r_squared: number;
  adj_r_squared: number;
  rmse: number;
  residual_std_error: number;
  reduced_chi_square: number | null;
  aic: number;
  converged: boolean;
  iterations: number;
  condition_number: number;
  warnings: string[];
}

export interface FitConfiguration {
  dataset_id: string;
  x_col: string;
  y_col: string;
  y_err_col: string | null;
  model: FitModelKind;
  x_range: [number, number] | null;
  initial_parameters: number[] | null;
  lower_bounds: number[] | null;
  upper_bounds: number[] | null;
  use_weights: boolean;
  max_iterations: number;
  tolerance: number;
  curve_points: number;
}

export interface AnalysisResult {
  id: string;
  name: string;
  config: FitConfiguration;
  formula_template: string;
  fitted_equation: string;
  parameters: FitParameter[];
  diagnostics: FitDiagnostics;
  obs_x: number[];
  obs_y: number[];
  fitted_y: number[];
  residuals: number[];
  standardized_residuals: number[];
  curve_x: number[];
  curve_y: number[];
  confidence_band_upper?: number[];
  confidence_band_lower?: number[];
}

export interface DescriptiveStats {
  count: number;
  missing_count: number;
  mean: number;
  variance: number;
  std_dev: number;
  sem: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  iqr: number;
  max: number;
  sum: number;
  skewness: number;
}

export interface PairedCorrelation {
  observations: number;
  dropped_missing: number;
  pearson_r: number;
  r_squared: number;
  covariance: number;
}

export type WindowFunction = "rectangular" | "hann" | "hamming" | "blackman";

export interface FftSpectrumResult {
  frequencies: number[];
  magnitudes: number[];
  power_spectral_density: number[];
  dominant_frequency: number;
  dominant_magnitude: number;
  sampling_rate: number;
}

export type FilterKind =
  | { filter_type: "low_pass"; cutoff_hz: number }
  | { filter_type: "high_pass"; cutoff_hz: number }
  | { filter_type: "band_pass"; low_hz: number; high_hz: number };

export interface DetectedPeak {
  index: number;
  x: number;
  y: number;
  prominence: number;
  fwhm: number;
}

export interface IntegrationResult {
  observations: number;
  trapezoidal_area: number;
  simpson_area: number;
  absolute_area: number;
  cumulative_x: number[];
  cumulative_y: number[];
}

export type TTestKind =
  | { test_kind: "one_sample"; mu0: number }
  | { test_kind: "two_sample_student" }
  | { test_kind: "two_sample_welch" };

export interface TTestResult {
  test_name: string;
  statistic_t: number;
  degrees_of_freedom: number;
  p_value_two_tailed: number;
  mean_diff: number;
  std_error_diff: number;
  ci_lower_95: number;
  ci_upper_95: number;
  significant_at_05: boolean;
  n1: number;
  n2: number | null;
}

export interface AnovaGroupSummary {
  group_name: string;
  count: number;
  mean: number;
  std_dev: number;
}

export interface AnovaResult {
  f_statistic: number;
  df_between: number;
  df_within: number;
  p_value: number;
  ss_between: number;
  ss_within: number;
  ms_between: number;
  ms_within: number;
  significant_at_05: boolean;
  groups: AnovaGroupSummary[];
}

export type ColumnTransform =
  | { transform: "scale_offset"; scale: number; offset: number }
  | { transform: "log10" }
  | { transform: "ln" }
  | { transform: "normalize_min_max" }
  | { transform: "standardize_z_score" }
  | { transform: "first_derivative"; x_col: string }
  | { transform: "cumulative_integral"; x_col: string }
  | { transform: "moving_average"; window: number }
  | { transform: "savitzky_golay5" }
  | { transform: "baseline_subtract_linear" };

export type DatasetMutation =
  | { action: "add_row" }
  | { action: "delete_row"; row_index: number }
  | { action: "add_column"; name: string; role: ColumnRole; unit: string | null }
  | { action: "remove_column"; col_id: string }
  | { action: "duplicate_column"; col_id: string }
  | { action: "rename_column"; col_id: string; new_name: string; unit: string | null }
  | { action: "set_column_role"; col_id: string; role: ColumnRole }
  | { action: "sort_by_column"; col_id: string; ascending: boolean }
  | {
      action: "transform_column";
      col_id: string;
      transform: ColumnTransform;
      result_name: string | null;
    };

export interface ImportOptions {
  delimiter: string | null;
  has_header: boolean | null;
  dataset_name: string | null;
}

export interface AnalysisWorkflow {
  id: string;
  name: string;
  description: string;
  actions: unknown[];
}

export interface Project {
  format_version: number;
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  datasets: Dataset[];
  worksheets: Worksheet[];
  plots: PlotDocument[];
  analyses: AnalysisResult[];
  workflows?: AnalysisWorkflow[];
  active_tab_id: string | null;
}

export interface WorkspaceSnapshot {
  project: Project;
  project_path: string | null;
  dirty: boolean;
  can_undo: boolean;
  can_redo: boolean;
}
