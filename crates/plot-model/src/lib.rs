//! Renderer-independent scientific plot and figure specification model.
//!
//! `plot-model` captures all semantic, geometric, and stylistic properties of a scientific
//! figure without coupling to any concrete rendering library (such as Apache ECharts, SVG, or PDF).

pub mod pdf_export;

pub use pdf_export::{render_plot_to_pdf_bytes, PdfSeriesData};

use scientific_core::{
    AnalysisId, AnnotationId, ColumnId, DatasetId, LayerId, PanelId, PlotId, ScientificError,
    ScientificResult,
};
use serde::{Deserialize, Serialize};

/// Okabe-Ito colorblind-safe publication palette.
pub const PUBLICATION_PALETTE: [&str; 8] = [
    "#0072B2", // Blue
    "#D55E00", // Vermilion
    "#009E73", // Bluish Green
    "#CC79A7", // Reddish Purple
    "#E69F00", // Orange
    "#56B4E9", // Sky Blue
    "#F0E442", // Yellow
    "#333333", // Charcoal
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlotType {
    Scatter,
    Line,
    LineSymbols,
    Area,
    Bar,
    // Phase 6: Statistical & Specialized 2D Plot Types
    Histogram,
    BoxPlot,
    Violin,
    Heatmap,
    Contour,
    Polar,
    StackedBar,
    StackedArea,
    // Phase 8: 3D & Matrix Scientific Visualization Types
    #[serde(rename = "scatter_3d", alias = "scatter3_d")]
    Scatter3D,
    #[serde(rename = "line_3d", alias = "line3_d")]
    Line3D,
    #[serde(rename = "surface_3d", alias = "surface3_d")]
    Surface3D,
    #[serde(rename = "wireframe_3d", alias = "wireframe3_d")]
    Wireframe3D,
    Waterfall,
    VectorField,
}

impl PlotType {
    pub fn is_3d(&self) -> bool {
        matches!(
            self,
            Self::Scatter3D | Self::Line3D | Self::Surface3D | Self::Wireframe3D | Self::Waterfall
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ColorMapKind {
    #[default]
    Viridis,
    Plasma,
    Inferno,
    CoolWarm,
    Cividis,
    Grayscale,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Camera3DSpec {
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
    pub distance: f64,
    pub z_scale: f64,
    #[serde(default)]
    pub pan_x: f64,
    #[serde(default)]
    pub pan_y: f64,
    #[serde(default)]
    pub show_box: bool,
}

impl Default for Camera3DSpec {
    fn default() -> Self {
        Self {
            azimuth_deg: 42.0,
            elevation_deg: 28.0,
            distance: 1.0,
            z_scale: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
            show_box: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AxisScale {
    Linear,
    Log10,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LineStyle {
    Solid,
    Dashed,
    Dotted,
    DashDot,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SymbolShape {
    Circle,
    Square,
    Triangle,
    Diamond,
    Cross,
    Plus,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LegendPosition {
    TopRight,
    TopLeft,
    BottomRight,
    BottomLeft,
    OutsideRight,
    OutsideTop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Png,
    Svg,
    Pdf,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AxisSpec {
    pub title: String,
    pub unit: Option<String>,
    pub scale: AxisScale,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub reversed: bool,
    pub show_major_grid: bool,
    pub show_minor_grid: bool,
    pub major_tick_count: Option<u32>,
    pub minor_tick_split: u32,
    pub visible: bool,
    pub scientific_notation: bool,
    pub font_size: u32,
    #[serde(default = "default_true")]
    pub show_top_right_border: bool,
}

impl AxisSpec {
    pub fn default_x() -> Self {
        Self {
            title: "X Axis".to_string(),
            unit: None,
            scale: AxisScale::Linear,
            min: None,
            max: None,
            reversed: false,
            show_major_grid: true,
            show_minor_grid: false,
            major_tick_count: None,
            minor_tick_split: 5,
            visible: true,
            scientific_notation: false,
            font_size: 13,
            show_top_right_border: true,
        }
    }

    pub fn default_y() -> Self {
        Self {
            title: "Y Axis".to_string(),
            unit: None,
            scale: AxisScale::Linear,
            min: None,
            max: None,
            reversed: false,
            show_major_grid: true,
            show_minor_grid: false,
            major_tick_count: None,
            minor_tick_split: 5,
            visible: true,
            scientific_notation: false,
            font_size: 13,
            show_top_right_border: true,
        }
    }

    pub fn default_z() -> Self {
        Self {
            title: "Z Axis".to_string(),
            unit: None,
            scale: AxisScale::Linear,
            min: None,
            max: None,
            reversed: false,
            show_major_grid: true,
            show_minor_grid: false,
            major_tick_count: None,
            minor_tick_split: 5,
            visible: true,
            scientific_notation: false,
            font_size: 13,
            show_top_right_border: true,
        }
    }

    pub fn validate(&self, axis_name: &str) -> ScientificResult<()> {
        if let (Some(min), Some(max)) = (self.min, self.max) {
            if !min.is_finite() || !max.is_finite() {
                return Err(ScientificError::InvalidParameter {
                    name: format!("{axis_name}.limits"),
                    reason: "Axis limits must be finite numbers".to_string(),
                });
            }
            if min >= max {
                return Err(ScientificError::InvalidParameter {
                    name: format!("{axis_name}.limits"),
                    reason: format!("Axis min ({min}) must be strictly less than max ({max})"),
                });
            }
        }
        if self.scale == AxisScale::Log10 {
            if let Some(min) = self.min {
                if min <= 0.0 {
                    return Err(ScientificError::InvalidParameter {
                        name: format!("{axis_name}.min"),
                        reason: "Logarithmic axis minimum must be strictly positive (> 0)"
                            .to_string(),
                    });
                }
            }
            if let Some(max) = self.max {
                if max <= 0.0 {
                    return Err(ScientificError::InvalidParameter {
                        name: format!("{axis_name}.max"),
                        reason: "Logarithmic axis maximum must be strictly positive (> 0)"
                            .to_string(),
                    });
                }
            }
        }
        Ok(())
    }
}

fn default_histogram_bins() -> u32 {
    15
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SeriesStyle {
    pub color: String,
    pub line_width: f64,
    pub line_style: LineStyle,
    pub symbol_shape: SymbolShape,
    pub symbol_size: f64,
    pub symbol_filled: bool,
    pub opacity: f64,
    pub show_error_bars: bool,
    pub error_bar_cap_width: f64,
    pub error_bar_line_width: f64,
    #[serde(default)]
    pub use_secondary_y_axis: bool,
    #[serde(default = "default_histogram_bins")]
    pub histogram_bins: u32,
}

impl SeriesStyle {
    pub fn for_index(index: usize, plot_type: PlotType) -> Self {
        let color = PUBLICATION_PALETTE[index % PUBLICATION_PALETTE.len()].to_string();
        let symbol_shape = match plot_type {
            PlotType::Line
            | PlotType::Area
            | PlotType::Bar
            | PlotType::Histogram
            | PlotType::BoxPlot
            | PlotType::Violin
            | PlotType::Heatmap
            | PlotType::Contour
            | PlotType::StackedBar
            | PlotType::StackedArea
            | PlotType::Line3D
            | PlotType::Surface3D
            | PlotType::Wireframe3D
            | PlotType::Waterfall
            | PlotType::VectorField => SymbolShape::None,
            PlotType::Scatter | PlotType::LineSymbols | PlotType::Polar | PlotType::Scatter3D => {
                match index % 4 {
                    0 => SymbolShape::Circle,
                    1 => SymbolShape::Square,
                    2 => SymbolShape::Triangle,
                    _ => SymbolShape::Diamond,
                }
            }
        };
        Self {
            color,
            line_width: 2.0,
            line_style: LineStyle::Solid,
            symbol_shape,
            symbol_size: 7.0,
            symbol_filled: true,
            opacity: 1.0,
            show_error_bars: true,
            error_bar_cap_width: 6.0,
            error_bar_line_width: 1.25,
            use_secondary_y_axis: false,
            histogram_bins: 15,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisCurveKind {
    FittedCurve,
    Residuals,
    ConfidenceBandUpper,
    ConfidenceBandLower,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "source_type", rename_all = "snake_case")]
pub enum LayerDataSource {
    DatasetColumns {
        dataset_id: DatasetId,
        x_col: ColumnId,
        y_col: ColumnId,
        #[serde(default)]
        z_col: Option<ColumnId>,
        x_err_col: Option<ColumnId>,
        y_err_col: Option<ColumnId>,
    },
    AnalysisOutput {
        analysis_id: AnalysisId,
        dataset_id: DatasetId,
        curve_kind: AnalysisCurveKind,
    },
}

impl LayerDataSource {
    pub fn dataset_id(&self) -> &DatasetId {
        match self {
            Self::DatasetColumns { dataset_id, .. } => dataset_id,
            Self::AnalysisOutput { dataset_id, .. } => dataset_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlotLayer {
    pub id: LayerId,
    pub label: String,
    pub visible: bool,
    pub plot_type: PlotType,
    pub source: LayerDataSource,
    pub style: SeriesStyle,
    pub panel_id: PanelId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PlotAnnotation {
    Text {
        id: AnnotationId,
        text: String,
        x: f64,
        y: f64,
        color: String,
        font_size: u32,
    },
    ReferenceLine {
        id: AnnotationId,
        label: String,
        axis: String, // "x" or "y"
        value: f64,
        color: String,
        line_style: LineStyle,
        line_width: f64,
    },
    Arrow {
        id: AnnotationId,
        label: String,
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        color: String,
        line_width: f64,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LegendSpec {
    pub visible: bool,
    pub position: LegendPosition,
    pub frame_visible: bool,
    pub font_size: u32,
}

impl Default for LegendSpec {
    fn default() -> Self {
        Self {
            visible: true,
            position: LegendPosition::TopRight,
            frame_visible: true,
            font_size: 12,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FigureMargins {
    pub top: u32,
    pub right: u32,
    pub bottom: u32,
    pub left: u32,
}

impl Default for FigureMargins {
    fn default() -> Self {
        Self {
            top: 56,
            right: 40,
            bottom: 64,
            left: 72,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FigureDimensions {
    pub width_px: u32,
    pub height_px: u32,
    pub width_cm: f64,
    pub height_cm: f64,
    pub dpi: u32,
}

impl Default for FigureDimensions {
    fn default() -> Self {
        Self {
            width_px: 800,
            height_px: 560,
            width_cm: 16.0,
            height_cm: 11.2,
            dpi: 300,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExportSpec {
    pub format: ExportFormat,
    pub dpi: u32,
    pub width_px: u32,
    pub height_px: u32,
    pub transparent_background: bool,
}

impl Default for ExportSpec {
    fn default() -> Self {
        Self {
            format: ExportFormat::Svg,
            dpi: 300,
            width_px: 1200,
            height_px: 840,
            transparent_background: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlotPanel {
    pub id: PanelId,
    pub title: Option<String>,
    pub row: u32,
    pub col: u32,
    pub x_axis: AxisSpec,
    pub y_axis: AxisSpec,
    #[serde(default)]
    pub secondary_y_axis: Option<AxisSpec>,
    #[serde(default)]
    pub z_axis: Option<AxisSpec>,
    #[serde(default)]
    pub subfigure_label: Option<String>,
    #[serde(default)]
    pub is_inset: bool,
    /// Optional normalized rectangle `[left_pct, top_pct, width_pct, height_pct]` when `is_inset` is true.
    #[serde(default)]
    pub inset_rect: Option<[f64; 4]>,
}

fn default_panel_spacing() -> u32 {
    28
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlotDocument {
    pub id: PlotId,
    pub name: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub background_color: String,
    pub font_family: String,
    pub base_font_size: u32,
    pub dimensions: FigureDimensions,
    pub margins: FigureMargins,
    pub legend: LegendSpec,
    pub grid_rows: u32,
    pub grid_cols: u32,
    #[serde(default)]
    pub shared_x_axis: bool,
    #[serde(default)]
    pub shared_y_axis: bool,
    #[serde(default = "default_panel_spacing")]
    pub panel_spacing: u32,
    #[serde(default)]
    pub color_map: ColorMapKind,
    #[serde(default)]
    pub camera_3d: Camera3DSpec,
    #[serde(default)]
    pub style_preset: Option<String>,
    pub panels: Vec<PlotPanel>,
    pub layers: Vec<PlotLayer>,
    pub annotations: Vec<PlotAnnotation>,
    pub export_spec: ExportSpec,
}

impl PlotDocument {
    pub fn new(name: impl Into<String>) -> Self {
        let name_str = name.into();
        let default_panel_id = PanelId::new();
        let default_panel = PlotPanel {
            id: default_panel_id,
            title: None,
            row: 0,
            col: 0,
            x_axis: AxisSpec::default_x(),
            y_axis: AxisSpec::default_y(),
            secondary_y_axis: None,
            z_axis: Some(AxisSpec::default_z()),
            subfigure_label: None,
            is_inset: false,
            inset_rect: None,
        };

        Self {
            id: PlotId::new(),
            name: name_str.clone(),
            title: name_str,
            subtitle: None,
            background_color: "#FFFFFF".to_string(),
            font_family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif".to_string(),
            base_font_size: 13,
            dimensions: FigureDimensions::default(),
            margins: FigureMargins::default(),
            legend: LegendSpec::default(),
            grid_rows: 1,
            grid_cols: 1,
            shared_x_axis: false,
            shared_y_axis: false,
            panel_spacing: 28,
            color_map: ColorMapKind::Viridis,
            camera_3d: Camera3DSpec::default(),
            style_preset: None,
            panels: vec![default_panel],
            layers: Vec::new(),
            annotations: Vec::new(),
            export_spec: ExportSpec::default(),
        }
    }

    pub fn primary_panel(&self) -> &PlotPanel {
        &self.panels[0]
    }

    pub fn primary_panel_mut(&mut self) -> &mut PlotPanel {
        &mut self.panels[0]
    }

    /// Configures a multi-panel grid (`rows × cols`) with automatic subfigure labels `(a)`, `(b)`, ...
    pub fn configure_panel_grid(&mut self, rows: u32, cols: u32, shared_x: bool, shared_y: bool) {
        let r_cnt = rows.clamp(1, 4);
        let c_cnt = cols.clamp(1, 4);
        self.grid_rows = r_cnt;
        self.grid_cols = c_cnt;
        self.shared_x_axis = shared_x;
        self.shared_y_axis = shared_y;

        let total = (r_cnt * c_cnt) as usize;
        let insets: Vec<PlotPanel> = self.panels.iter().filter(|p| p.is_inset).cloned().collect();

        let mut grid_panels: Vec<PlotPanel> = self
            .panels
            .iter()
            .filter(|p| !p.is_inset)
            .cloned()
            .collect();

        while grid_panels.len() < total {
            grid_panels.push(PlotPanel {
                id: PanelId::new(),
                title: None,
                row: 0,
                col: 0,
                x_axis: self.primary_panel().x_axis.clone(),
                y_axis: self.primary_panel().y_axis.clone(),
                secondary_y_axis: None,
                z_axis: Some(AxisSpec::default_z()),
                subfigure_label: None,
                is_inset: false,
                inset_rect: None,
            });
        }
        grid_panels.truncate(total);

        for (idx, panel) in grid_panels.iter_mut().enumerate() {
            panel.row = (idx as u32) / c_cnt;
            panel.col = (idx as u32) % c_cnt;
            panel.subfigure_label = if total > 1 {
                let ch = (b'a' + (idx as u8).min(25)) as char;
                Some(format!("({ch})"))
            } else {
                None
            };
        }

        let fallback_panel_id = grid_panels[0].id.clone();
        grid_panels.extend(insets);
        let valid_ids: Vec<PanelId> = grid_panels.iter().map(|p| p.id.clone()).collect();

        for layer in &mut self.layers {
            if !valid_ids.contains(&layer.panel_id) {
                layer.panel_id = fallback_panel_id.clone();
            }
        }

        self.panels = grid_panels;
    }

    /// Applies a publication style preset (`"nature_single"`, `"ieee_double"`, `"acs_spectroscopy"`, `"presentation_high_contrast"`).
    pub fn apply_style_preset(&mut self, preset_id: &str) {
        self.style_preset = Some(preset_id.to_string());
        match preset_id {
            "nature_single" => {
                self.font_family = "Arial, Helvetica, sans-serif".to_string();
                self.base_font_size = 10;
                self.dimensions = FigureDimensions {
                    width_px: 720,
                    height_px: 520,
                    width_cm: 8.9,
                    height_cm: 6.5,
                    dpi: 600,
                };
                self.export_spec.dpi = 600;
                for panel in &mut self.panels {
                    panel.x_axis.show_major_grid = false;
                    panel.y_axis.show_major_grid = false;
                    panel.x_axis.show_top_right_border = true;
                    panel.y_axis.show_top_right_border = true;
                    panel.x_axis.font_size = 10;
                    panel.y_axis.font_size = 10;
                }
            }
            "ieee_double" => {
                self.font_family = "'Times New Roman', Times, Georgia, serif".to_string();
                self.base_font_size = 11;
                self.dimensions = FigureDimensions {
                    width_px: 920,
                    height_px: 580,
                    width_cm: 17.8,
                    height_cm: 11.2,
                    dpi: 600,
                };
                self.export_spec.dpi = 600;
                for panel in &mut self.panels {
                    panel.x_axis.show_major_grid = true;
                    panel.y_axis.show_major_grid = true;
                    panel.x_axis.font_size = 11;
                    panel.y_axis.font_size = 11;
                }
            }
            "acs_spectroscopy" => {
                self.font_family = "Inter, Arial, sans-serif".to_string();
                self.base_font_size = 12;
                self.dimensions = FigureDimensions {
                    width_px: 840,
                    height_px: 600,
                    width_cm: 12.0,
                    height_cm: 8.6,
                    dpi: 300,
                };
                for panel in &mut self.panels {
                    panel.x_axis.show_major_grid = false;
                    panel.y_axis.show_major_grid = false;
                    panel.x_axis.show_top_right_border = true;
                    panel.y_axis.show_top_right_border = true;
                }
            }
            "presentation_high_contrast" => {
                self.font_family = "Inter, system-ui, sans-serif".to_string();
                self.base_font_size = 15;
                self.dimensions = FigureDimensions {
                    width_px: 1040,
                    height_px: 640,
                    width_cm: 24.0,
                    height_cm: 14.8,
                    dpi: 300,
                };
                for layer in &mut self.layers {
                    layer.style.line_width = layer.style.line_width.max(3.0);
                    layer.style.symbol_size = layer.style.symbol_size.max(9.0);
                }
            }
            _ => {}
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_dataset_layer(
        &mut self,
        label: impl Into<String>,
        plot_type: PlotType,
        dataset_id: DatasetId,
        x_col: ColumnId,
        y_col: ColumnId,
        x_err_col: Option<ColumnId>,
        y_err_col: Option<ColumnId>,
    ) -> LayerId {
        let idx = self.layers.len();
        let panel_id = self.panels[0].id.clone();
        let layer_id = LayerId::new();
        self.layers.push(PlotLayer {
            id: layer_id.clone(),
            label: label.into(),
            visible: true,
            plot_type,
            source: LayerDataSource::DatasetColumns {
                dataset_id,
                x_col,
                y_col,
                z_col: None,
                x_err_col,
                y_err_col,
            },
            style: SeriesStyle::for_index(idx, plot_type),
            panel_id,
        });
        layer_id
    }

    pub fn add_analysis_layer(
        &mut self,
        label: impl Into<String>,
        analysis_id: AnalysisId,
        dataset_id: DatasetId,
        curve_kind: AnalysisCurveKind,
        color: Option<String>,
    ) -> LayerId {
        let idx = self.layers.len();
        let panel_id = self.panels[0].id.clone();
        let layer_id = LayerId::new();
        let mut style = SeriesStyle::for_index(idx, PlotType::Line);
        if let Some(c) = color {
            style.color = c;
        } else {
            style.color = "#D55E00".to_string();
        }
        style.line_width = 2.4;
        style.symbol_shape = SymbolShape::None;

        self.layers.push(PlotLayer {
            id: layer_id.clone(),
            label: label.into(),
            visible: true,
            plot_type: PlotType::Line,
            source: LayerDataSource::AnalysisOutput {
                analysis_id,
                dataset_id,
                curve_kind,
            },
            style,
            panel_id,
        });
        layer_id
    }

    pub fn duplicate(&self, new_name: impl Into<String>) -> Self {
        let mut cloned = self.clone();
        cloned.id = PlotId::new();
        let name_str = new_name.into();
        cloned.name = name_str.clone();
        cloned.title = name_str;
        for layer in &mut cloned.layers {
            layer.id = LayerId::new();
        }
        cloned
    }

    pub fn validate(&self) -> ScientificResult<()> {
        if self.panels.is_empty() {
            return Err(ScientificError::InvalidParameter {
                name: "panels".to_string(),
                reason: "PlotDocument must contain at least one panel".to_string(),
            });
        }
        for (idx, panel) in self.panels.iter().enumerate() {
            panel.x_axis.validate(&format!("panel[{idx}].x_axis"))?;
            panel.y_axis.validate(&format!("panel[{idx}].y_axis"))?;
            if let Some(sec_y) = &panel.secondary_y_axis {
                sec_y.validate(&format!("panel[{idx}].secondary_y_axis"))?;
            }
            if let Some(z_ax) = &panel.z_axis {
                z_ax.validate(&format!("panel[{idx}].z_axis"))?;
            }
        }
        Ok(())
    }

    pub fn referenced_datasets(&self) -> Vec<DatasetId> {
        let mut ids = Vec::new();
        for layer in &self.layers {
            let ds_id = layer.source.dataset_id().clone();
            if !ids.contains(&ds_id) {
                ids.push(ds_id);
            }
        }
        ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_validates_plot_document() {
        let mut doc = PlotDocument::new("Absorbance vs Concentration");
        let ds_id = DatasetId::new();
        let x_col = ColumnId::new();
        let y_col = ColumnId::new();

        doc.add_dataset_layer(
            "Sample A",
            PlotType::Scatter,
            ds_id.clone(),
            x_col,
            y_col,
            None,
            None,
        );

        assert!(doc.validate().is_ok());
        assert_eq!(doc.referenced_datasets(), vec![ds_id]);
    }

    #[test]
    fn configures_multi_panel_grid_with_subfigure_labels() {
        let mut doc = PlotDocument::new("Multi-Panel Spectroscopy");
        doc.configure_panel_grid(2, 2, true, false);
        assert_eq!(doc.panels.len(), 4);
        assert_eq!(doc.panels[0].subfigure_label.as_deref(), Some("(a)"));
        assert_eq!(doc.panels[1].subfigure_label.as_deref(), Some("(b)"));
        assert_eq!(doc.panels[2].subfigure_label.as_deref(), Some("(c)"));
        assert_eq!(doc.panels[3].subfigure_label.as_deref(), Some("(d)"));
    }

    #[test]
    fn applies_nature_style_preset() {
        let mut doc = PlotDocument::new("Nature Figure");
        doc.apply_style_preset("nature_single");
        assert_eq!(doc.export_spec.dpi, 600);
        assert!((doc.dimensions.width_cm - 8.9).abs() < 1e-6);
    }

    #[test]
    fn rejects_non_positive_log_axis_limits() {
        let mut doc = PlotDocument::new("Log Plot");
        doc.primary_panel_mut().x_axis.scale = AxisScale::Log10;
        doc.primary_panel_mut().x_axis.min = Some(0.0);

        let err = doc.validate().expect_err("should reject 0 on log axis");
        assert!(matches!(err, ScientificError::InvalidParameter { .. }));
    }

    #[test]
    fn duplicates_plot_with_distinct_ids() {
        let mut doc = PlotDocument::new("Original Graph");
        doc.add_dataset_layer(
            "Series 1",
            PlotType::LineSymbols,
            DatasetId::new(),
            ColumnId::new(),
            ColumnId::new(),
            None,
            None,
        );

        let dup = doc.duplicate("Original Graph (Copy)");
        assert_ne!(dup.id, doc.id);
        assert_eq!(dup.layers.len(), 1);
        assert_ne!(dup.layers[0].id, doc.layers[0].id);
    }

    #[test]
    fn serializes_and_deserializes_3d_plot_types() {
        let cases = [
            (PlotType::Scatter3D, "\"scatter_3d\""),
            (PlotType::Line3D, "\"line_3d\""),
            (PlotType::Surface3D, "\"surface_3d\""),
            (PlotType::Wireframe3D, "\"wireframe_3d\""),
            (PlotType::Waterfall, "\"waterfall\""),
        ];
        for (variant, expected_json) in cases {
            let json = serde_json::to_string(&variant).expect("serialize plot type");
            assert_eq!(json, expected_json);
            let parsed: PlotType = serde_json::from_str(expected_json).expect("deserialize plot type");
            assert_eq!(parsed, variant);
        }
    }
}
