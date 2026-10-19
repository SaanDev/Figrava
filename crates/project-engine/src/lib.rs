//! Project management, reactive dependency synchronization, atomic `.spsproj` container
//! persistence, and crash recovery for Scientific Plot Studio.

use analysis_engine::{run_curve_fit, AnalysisResult, FitConfiguration, FitModelKind};
use chrono::Utc;
use data_engine::{
    create_calibration_sample_dataset, create_spectroscopy_sample_dataset,
    create_surface_3d_sample_dataset, ColumnRole, ColumnTransform, DataColumn, Dataset,
    DatasetSource, Worksheet,
};
use plot_model::{
    render_plot_to_pdf_bytes, AnalysisCurveKind, LayerDataSource, PdfSeriesData, PlotDocument,
    PlotType,
};
use scientific_core::{
    AnalysisId, ColumnId, DatasetId, DependencyGraph, DependencyNodeKind, PlotId, ProjectId,
    ScientificError, ScientificResult,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const CURRENT_PROJECT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "action_type", rename_all = "snake_case")]
pub enum WorkflowAction {
    ColumnTransform { transform: ColumnTransform },
    CurveFit { model: FitModelKind },
    ApplyPlotPreset { preset_id: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisWorkflow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub actions: Vec<WorkflowAction>,
}

impl AnalysisWorkflow {
    pub fn default_scientific_workflows() -> Vec<Self> {
        vec![
            Self {
                id: "wf-spectroscopy-peak".to_string(),
                name: "Spectroscopy Baseline + SG Smooth + Gaussian Fit".to_string(),
                description: "Subtracts linear baseline, applies 5-pt Savitzky-Golay smoothing, fits a Gaussian peak, and formats figure to Nature single-column preset.".to_string(),
                actions: vec![
                    WorkflowAction::ColumnTransform {
                        transform: ColumnTransform::BaselineSubtractLinear,
                    },
                    WorkflowAction::ColumnTransform {
                        transform: ColumnTransform::SavitzkyGolay5,
                    },
                    WorkflowAction::CurveFit {
                        model: FitModelKind::Gaussian,
                    },
                    WorkflowAction::ApplyPlotPreset {
                        preset_id: "nature_1col".to_string(),
                    },
                ],
            },
            Self {
                id: "wf-calibration-linear".to_string(),
                name: "Calibration Normalize + Linear Regression (IEEE)".to_string(),
                description: "Normalizes Y series [0, 1], runs Linear Least-Squares Regression, and applies IEEE two-column preset.".to_string(),
                actions: vec![
                    WorkflowAction::ColumnTransform {
                        transform: ColumnTransform::NormalizeMinMax,
                    },
                    WorkflowAction::CurveFit {
                        model: FitModelKind::Linear,
                    },
                    WorkflowAction::ApplyPlotPreset {
                        preset_id: "ieee_2col".to_string(),
                    },
                ],
            },
        ]
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub format_version: u32,
    pub id: ProjectId,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub active_tab_id: Option<String>,
    pub dependency_graph: DependencyGraph,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub format_version: u32,
    pub id: ProjectId,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub datasets: Vec<Dataset>,
    pub worksheets: Vec<Worksheet>,
    pub plots: Vec<PlotDocument>,
    pub analyses: Vec<AnalysisResult>,
    #[serde(default = "AnalysisWorkflow::default_scientific_workflows")]
    pub workflows: Vec<AnalysisWorkflow>,
    pub dependency_graph: DependencyGraph,
    pub active_tab_id: Option<String>,
}

impl Project {
    /// Creates a completely empty workspace with no datasets, worksheets, plots, or analyses.
    /// Used on initial application launch so the user is prompted to start or open a project.
    pub fn create_empty_project() -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            format_version: CURRENT_PROJECT_VERSION,
            id: ProjectId::new(),
            name: "Untitled Project".to_string(),
            created_at: now.clone(),
            updated_at: now,
            datasets: Vec::new(),
            worksheets: Vec::new(),
            plots: Vec::new(),
            analyses: Vec::new(),
            workflows: AnalysisWorkflow::default_scientific_workflows(),
            dependency_graph: DependencyGraph::new(),
            active_tab_id: None,
        }
    }

    /// Creates a new blank project with one editable starter worksheet and dataset.
    pub fn create_blank_project(name: impl Into<String>) -> Self {
        let now = Utc::now().to_rfc3339();
        let ds = Dataset::new(
            "Dataset 1",
            DatasetSource::Manual,
            vec![
                DataColumn::new_numeric("X", ColumnRole::X, None, vec![f64::NAN; 5]),
                DataColumn::new_numeric("Y", ColumnRole::Y, None, vec![f64::NAN; 5]),
            ],
        );
        let ws = Worksheet::new("Worksheet 1", ds.id.clone());
        let mut dep = DependencyGraph::new();
        dep.register_node(ds.id.as_str(), DependencyNodeKind::Dataset);
        dep.register_node(ws.id.as_str(), DependencyNodeKind::Worksheet);
        let _ = dep.add_dependency(ds.id.as_str(), ws.id.as_str());

        let active_tab = Some(ws.id.to_string());

        Self {
            format_version: CURRENT_PROJECT_VERSION,
            id: ProjectId::new(),
            name: name.into(),
            created_at: now.clone(),
            updated_at: now,
            datasets: vec![ds],
            worksheets: vec![ws],
            plots: Vec::new(),
            analyses: Vec::new(),
            workflows: AnalysisWorkflow::default_scientific_workflows(),
            dependency_graph: dep,
            active_tab_id: active_tab,
        }
    }

    /// Creates a rich scientific demonstration project pre-populated with spectroscopy and
    /// calibration datasets, publication-formatted figures, and linked curve fits.
    pub fn create_sample_project() -> ScientificResult<Self> {
        let now = Utc::now().to_rfc3339();
        let mut project = Self {
            format_version: CURRENT_PROJECT_VERSION,
            id: ProjectId::new(),
            name: "Optical Spectroscopy & Calibration Study".to_string(),
            created_at: now.clone(),
            updated_at: now,
            datasets: Vec::new(),
            worksheets: Vec::new(),
            plots: Vec::new(),
            analyses: Vec::new(),
            workflows: AnalysisWorkflow::default_scientific_workflows(),
            dependency_graph: DependencyGraph::new(),
            active_tab_id: None,
        };

        // 1. Spectroscopy dataset + worksheet
        let spec_ds = create_spectroscopy_sample_dataset();
        let spec_ds_id = spec_ds.id.clone();
        let wl_col = spec_ds.columns[0].id.clone();
        let int_a_col = spec_ds.columns[1].id.clone();
        let err_a_col = spec_ds.columns[2].id.clone();
        let int_b_col = spec_ds.columns[3].id.clone();

        let spec_ws = project.add_dataset_with_worksheet(spec_ds, "Spectroscopy Data");

        // Run Gaussian Peak fit on Sample A
        let mut gauss_cfg = FitConfiguration::new(
            spec_ds_id.clone(),
            wl_col.clone(),
            int_a_col.clone(),
            FitModelKind::Gaussian,
        );
        gauss_cfg.y_err_col = Some(err_a_col.clone());
        gauss_cfg.use_weights = true;
        let gauss_res =
            project.execute_and_store_fit(gauss_cfg, Some("Gaussian Fit (Sample A)"))?;

        // Build spectroscopy figure with scatter + error bars, second series, and fitted curve
        let mut spec_plot = PlotDocument::new("Photoluminescence Emission Spectrum");
        spec_plot.subtitle =
            Some("GaN Quantum Dots (T = 298 K) with Weighted Gaussian Fit".to_string());
        spec_plot.primary_panel_mut().x_axis.title = "Wavelength".to_string();
        spec_plot.primary_panel_mut().x_axis.unit = Some("nm".to_string());
        spec_plot.primary_panel_mut().y_axis.title = "PL Intensity".to_string();
        spec_plot.primary_panel_mut().y_axis.unit = Some("counts".to_string());

        spec_plot.add_dataset_layer(
            "Sample A (Measured)",
            PlotType::Scatter,
            spec_ds_id.clone(),
            wl_col.clone(),
            int_a_col,
            None,
            Some(err_a_col),
        );
        spec_plot.add_dataset_layer(
            "Reference Sample B",
            PlotType::LineSymbols,
            spec_ds_id.clone(),
            wl_col,
            int_b_col,
            None,
            None,
        );
        spec_plot.add_analysis_layer(
            "Gaussian Peak Fit (Sample A)",
            gauss_res.id.clone(),
            spec_ds_id,
            AnalysisCurveKind::FittedCurve,
            Some("#D55E00".to_string()),
        );
        project.add_plot(spec_plot)?;

        // 2. Calibration dataset + worksheet
        let cal_ds = create_calibration_sample_dataset();
        let cal_ds_id = cal_ds.id.clone();
        let conc_col = cal_ds.columns[0].id.clone();
        let abs280_col = cal_ds.columns[1].id.clone();
        let abs_err_col = cal_ds.columns[2].id.clone();
        let abs310_col = cal_ds.columns[3].id.clone();

        project.add_dataset_with_worksheet(cal_ds, "Calibration Table");

        let mut lin_cfg = FitConfiguration::new(
            cal_ds_id.clone(),
            conc_col.clone(),
            abs280_col.clone(),
            FitModelKind::Linear,
        );
        lin_cfg.y_err_col = Some(abs_err_col.clone());
        lin_cfg.use_weights = true;
        let lin_res = project.execute_and_store_fit(lin_cfg, Some("Beer-Lambert Linear Fit"))?;

        let mut cal_plot = PlotDocument::new("Beer-Lambert Calibration Curve");
        cal_plot.subtitle = Some("UV-Vis Absorbance at 280 nm & 310 nm".to_string());
        cal_plot.primary_panel_mut().x_axis.title = "Concentration".to_string();
        cal_plot.primary_panel_mut().x_axis.unit = Some("uM".to_string());
        cal_plot.primary_panel_mut().y_axis.title = "Absorbance".to_string();
        cal_plot.primary_panel_mut().y_axis.unit = Some("AU".to_string());

        cal_plot.add_dataset_layer(
            "Absorbance @ 280 nm",
            PlotType::Scatter,
            cal_ds_id.clone(),
            conc_col.clone(),
            abs280_col,
            None,
            Some(abs_err_col),
        );
        cal_plot.add_dataset_layer(
            "Absorbance @ 310 nm",
            PlotType::Scatter,
            cal_ds_id.clone(),
            conc_col,
            abs310_col,
            None,
            None,
        );
        cal_plot.add_analysis_layer(
            "Linear Fit (280 nm)",
            lin_res.id,
            cal_ds_id,
            AnalysisCurveKind::FittedCurve,
            Some("#009E73".to_string()),
        );
        project.add_plot(cal_plot)?;

        project.active_tab_id = Some(spec_ws.id.to_string());
        Ok(project)
    }

    pub fn touch(&mut self) {
        self.updated_at = Utc::now().to_rfc3339();
    }

    pub fn dataset(&self, id: &DatasetId) -> ScientificResult<&Dataset> {
        self.datasets
            .iter()
            .find(|d| &d.id == id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "Dataset".to_string(),
                id: id.to_string(),
            })
    }

    pub fn dataset_mut(&mut self, id: &DatasetId) -> ScientificResult<&mut Dataset> {
        self.datasets
            .iter_mut()
            .find(|d| &d.id == id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "Dataset".to_string(),
                id: id.to_string(),
            })
    }

    pub fn plot(&self, id: &PlotId) -> ScientificResult<&PlotDocument> {
        self.plots
            .iter()
            .find(|p| &p.id == id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "PlotDocument".to_string(),
                id: id.to_string(),
            })
    }

    pub fn plot_mut(&mut self, id: &PlotId) -> ScientificResult<&mut PlotDocument> {
        self.plots
            .iter_mut()
            .find(|p| &p.id == id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "PlotDocument".to_string(),
                id: id.to_string(),
            })
    }

    pub fn analysis(&self, id: &AnalysisId) -> ScientificResult<&AnalysisResult> {
        self.analyses
            .iter()
            .find(|a| &a.id == id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "AnalysisResult".to_string(),
                id: id.to_string(),
            })
    }

    pub fn add_dataset_with_worksheet(
        &mut self,
        dataset: Dataset,
        worksheet_name: impl Into<String>,
    ) -> Worksheet {
        let ds_id = dataset.id.clone();
        self.dependency_graph
            .register_node(ds_id.as_str(), DependencyNodeKind::Dataset);
        self.datasets.push(dataset);

        let ws = Worksheet::new(worksheet_name, ds_id.clone());
        self.dependency_graph
            .register_node(ws.id.as_str(), DependencyNodeKind::Worksheet);
        let _ = self
            .dependency_graph
            .add_dependency(ds_id.as_str(), ws.id.as_str());
        self.worksheets.push(ws.clone());
        self.touch();
        ws
    }

    pub fn add_plot(&mut self, plot: PlotDocument) -> ScientificResult<PlotId> {
        plot.validate()?;
        let plot_id = plot.id.clone();
        self.dependency_graph
            .register_node(plot_id.as_str(), DependencyNodeKind::PlotDocument);

        for ds_id in plot.referenced_datasets() {
            self.dependency_graph
                .add_dependency(ds_id.as_str(), plot_id.as_str())?;
        }
        for layer in &plot.layers {
            if let plot_model::LayerDataSource::AnalysisOutput { analysis_id, .. } = &layer.source {
                self.dependency_graph
                    .add_dependency(analysis_id.as_str(), plot_id.as_str())?;
            }
        }

        self.plots.push(plot);
        self.touch();
        Ok(plot_id)
    }

    pub fn update_plot(&mut self, plot: PlotDocument) -> ScientificResult<()> {
        plot.validate()?;
        let plot_id = plot.id.clone();
        let idx = self
            .plots
            .iter()
            .position(|p| p.id == plot_id)
            .ok_or_else(|| ScientificError::NotFound {
                entity: "PlotDocument".to_string(),
                id: plot_id.to_string(),
            })?;

        self.dependency_graph
            .clear_dependencies_for(plot_id.as_str());
        for ds_id in plot.referenced_datasets() {
            self.dependency_graph
                .add_dependency(ds_id.as_str(), plot_id.as_str())?;
        }
        for layer in &plot.layers {
            if let plot_model::LayerDataSource::AnalysisOutput { analysis_id, .. } = &layer.source {
                self.dependency_graph
                    .add_dependency(analysis_id.as_str(), plot_id.as_str())?;
            }
        }

        self.plots[idx] = plot;
        self.touch();
        Ok(())
    }

    pub fn execute_and_store_fit(
        &mut self,
        config: FitConfiguration,
        custom_name: Option<&str>,
    ) -> ScientificResult<AnalysisResult> {
        let ds = self.dataset(&config.dataset_id)?;
        let x_vals = ds.column(&config.x_col)?.numeric_values();
        let y_vals = ds.column(&config.y_col)?.numeric_values();
        let err_vals = match &config.y_err_col {
            Some(err_col) => Some(ds.column(err_col)?.numeric_values()),
            None => None,
        };

        let mut result = run_curve_fit(&config, &x_vals, &y_vals, err_vals.as_deref())?;
        if let Some(name) = custom_name {
            result.name = name.to_string();
        }

        self.dependency_graph
            .register_node(result.id.as_str(), DependencyNodeKind::Analysis);
        self.dependency_graph
            .add_dependency(config.dataset_id.as_str(), result.id.as_str())?;

        self.analyses.push(result.clone());
        self.touch();
        Ok(result)
    }

    /// Re-evaluates all dependent analyses when `dataset_id` changes, preserving stable `AnalysisId`s
    /// so any linked plot layers immediately reflect updated fitted curves and residuals.
    pub fn recalculate_dependents_of_dataset(
        &mut self,
        dataset_id: &DatasetId,
    ) -> ScientificResult<Vec<String>> {
        let invalidated = self.dependency_graph.invalidate(dataset_id.as_str());
        let ds = self.dataset(dataset_id)?.clone();

        for analysis in &mut self.analyses {
            if &analysis.config.dataset_id == dataset_id {
                let x_vals = ds.column(&analysis.config.x_col)?.numeric_values();
                let y_vals = ds.column(&analysis.config.y_col)?.numeric_values();
                let err_vals = match &analysis.config.y_err_col {
                    Some(err_col) => Some(ds.column(err_col)?.numeric_values()),
                    None => None,
                };
                if let Ok(mut updated) =
                    run_curve_fit(&analysis.config, &x_vals, &y_vals, err_vals.as_deref())
                {
                    updated.id = analysis.id.clone();
                    updated.name = analysis.name.clone();
                    *analysis = updated;
                    self.dependency_graph.mark_clean(analysis.id.as_str());
                }
            }
        }

        for node_id in &invalidated {
            self.dependency_graph.mark_clean(node_id);
        }
        self.touch();
        Ok(invalidated)
    }

    /// Exports a `PlotDocument` and all its visible series into a pure-Rust Vector PDF 1.4 byte buffer.
    pub fn export_plot_pdf_bytes(&self, plot_id: &PlotId) -> ScientificResult<Vec<u8>> {
        let plot = self.plot(plot_id)?;
        let mut series_list = Vec::new();

        for layer in &plot.layers {
            if !layer.visible {
                continue;
            }
            match &layer.source {
                LayerDataSource::DatasetColumns {
                    dataset_id,
                    x_col,
                    y_col,
                    y_err_col,
                    ..
                } => {
                    if let Ok(ds) = self.dataset(dataset_id) {
                        let x = ds
                            .column(x_col)
                            .map(|c| c.numeric_values())
                            .unwrap_or_default();
                        let y = ds
                            .column(y_col)
                            .map(|c| c.numeric_values())
                            .unwrap_or_default();
                        let y_err = y_err_col
                            .as_ref()
                            .and_then(|ec| ds.column(ec).ok().map(|c| c.numeric_values()));
                        series_list.push(PdfSeriesData {
                            label: layer.label.clone(),
                            plot_type: layer.plot_type,
                            color_hex: layer.style.color.clone(),
                            line_width: layer.style.line_width,
                            line_style: layer.style.line_style,
                            symbol_shape: layer.style.symbol_shape,
                            symbol_size: layer.style.symbol_size,
                            x,
                            y,
                            y_err,
                        });
                    }
                }
                LayerDataSource::AnalysisOutput {
                    analysis_id,
                    curve_kind,
                    ..
                } => {
                    if let Ok(analysis) = self.analysis(analysis_id) {
                        let (x, y) = match curve_kind {
                            AnalysisCurveKind::FittedCurve => {
                                (analysis.curve_x.clone(), analysis.curve_y.clone())
                            }
                            AnalysisCurveKind::Residuals => {
                                (analysis.obs_x.clone(), analysis.residuals.clone())
                            }
                            AnalysisCurveKind::ConfidenceBandUpper => (
                                analysis.curve_x.clone(),
                                analysis.confidence_band_upper.clone(),
                            ),
                            AnalysisCurveKind::ConfidenceBandLower => (
                                analysis.curve_x.clone(),
                                analysis.confidence_band_lower.clone(),
                            ),
                        };
                        series_list.push(PdfSeriesData {
                            label: layer.label.clone(),
                            plot_type: layer.plot_type,
                            color_hex: layer.style.color.clone(),
                            line_width: layer.style.line_width,
                            line_style: layer.style.line_style,
                            symbol_shape: layer.style.symbol_shape,
                            symbol_size: layer.style.symbol_size,
                            x,
                            y,
                            y_err: None,
                        });
                    }
                }
            }
        }

        render_plot_to_pdf_bytes(plot, &series_list)
    }

    /// Loads the built-in 3D Potential Energy Surface & Contour Matrix sample dataset and creates a 3D Surface plot.
    pub fn load_3d_sample_dataset(&mut self) -> ScientificResult<PlotId> {
        let ds = create_surface_3d_sample_dataset();
        let ds_id = ds.id.clone();
        let x_col = ds.columns[0].id.clone();
        let y_col = ds.columns[1].id.clone();
        let z_col = ds.columns[2].id.clone();

        self.add_dataset_with_worksheet(ds, "3D Surface Matrix");

        let mut plot = PlotDocument::new("3D Potential Energy Surface Z(X, Y)");
        plot.subtitle =
            Some("Sombrero Radial Potential with Viridis Scientific Colormap".to_string());
        plot.primary_panel_mut().x_axis.title = "Position X".to_string();
        plot.primary_panel_mut().x_axis.unit = Some("nm".to_string());
        plot.primary_panel_mut().y_axis.title = "Position Y".to_string();
        plot.primary_panel_mut().y_axis.unit = Some("nm".to_string());

        let layer_id = plot.add_dataset_layer(
            "Potential Energy Surface",
            PlotType::Surface3D,
            ds_id,
            x_col,
            y_col,
            None,
            None,
        );
        if let Some(layer) = plot.layers.iter_mut().find(|l| l.id == layer_id) {
            if let LayerDataSource::DatasetColumns { z_col: z_ref, .. } = &mut layer.source {
                *z_ref = Some(z_col);
            }
        }
        let plot_id = self.add_plot(plot)?;
        self.active_tab_id = Some(plot_id.to_string());
        Ok(plot_id)
    }

    /// Executes a saved `AnalysisWorkflow` (sequence of column transformations, curve fits, and plot presets).
    pub fn run_workflow(
        &mut self,
        workflow_id: &str,
        dataset_id: &DatasetId,
        x_col: &ColumnId,
        y_col: &ColumnId,
        plot_id: Option<&PlotId>,
    ) -> ScientificResult<String> {
        let wf = self
            .workflows
            .iter()
            .find(|w| w.id == workflow_id)
            .cloned()
            .ok_or_else(|| ScientificError::NotFound {
                entity: "AnalysisWorkflow".to_string(),
                id: workflow_id.to_string(),
            })?;

        let mut current_y_col = y_col.clone();
        let mut steps_executed = Vec::new();

        for action in &wf.actions {
            match action {
                WorkflowAction::ColumnTransform { transform } => {
                    let ds = self.dataset_mut(dataset_id)?;
                    current_y_col = ds.apply_column_transform(&current_y_col, transform, None)?;
                    steps_executed.push(format!("Transformed column -> {current_y_col}"));
                }
                WorkflowAction::CurveFit { model } => {
                    let cfg = FitConfiguration::new(
                        dataset_id.clone(),
                        x_col.clone(),
                        current_y_col.clone(),
                        model.clone(),
                    );
                    let res = self.execute_and_store_fit(
                        cfg,
                        Some(&format!("{} ({})", model.display_name(), wf.name)),
                    )?;
                    if let Some(pid) = plot_id {
                        if let Ok(plot) = self.plot_mut(pid) {
                            plot.add_analysis_layer(
                                format!("Workflow Fit ({})", model.display_name()),
                                res.id.clone(),
                                dataset_id.clone(),
                                AnalysisCurveKind::FittedCurve,
                                Some("#D55E00".to_string()),
                            );
                        }
                    }
                    steps_executed.push(format!(
                        "Fitted {} (R² = {:.5})",
                        model.display_name(),
                        res.diagnostics.r_squared
                    ));
                }
                WorkflowAction::ApplyPlotPreset { preset_id } => {
                    if let Some(pid) = plot_id {
                        if let Ok(plot) = self.plot_mut(pid) {
                            plot.apply_style_preset(preset_id);
                            steps_executed.push(format!("Applied preset '{preset_id}'"));
                        }
                    }
                }
            }
        }

        let _ = self.recalculate_dependents_of_dataset(dataset_id)?;
        Ok(steps_executed.join(" | "))
    }

    /// Serializes the entire project into a versioned `.spsproj` ZIP container in memory.
    pub fn to_spsproj_bytes(&self) -> ScientificResult<Vec<u8>> {
        let buf = Vec::new();
        let cursor = Cursor::new(buf);
        let mut zip = ZipWriter::new(cursor);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);

        let manifest = ProjectManifest {
            format_version: self.format_version,
            id: self.id.clone(),
            name: self.name.clone(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
            active_tab_id: self.active_tab_id.clone(),
            dependency_graph: self.dependency_graph.clone(),
        };

        let write_json_entry = |zip: &mut ZipWriter<Cursor<Vec<u8>>>,
                                name: &str,
                                json: String|
         -> ScientificResult<()> {
            zip.start_file(name, options)
                .map_err(|e| ScientificError::IoError(e.to_string()))?;
            zip.write_all(json.as_bytes())?;
            Ok(())
        };

        write_json_entry(
            &mut zip,
            "manifest.json",
            serde_json::to_string_pretty(&manifest)?,
        )?;
        write_json_entry(
            &mut zip,
            "datasets.json",
            serde_json::to_string_pretty(&self.datasets)?,
        )?;
        write_json_entry(
            &mut zip,
            "worksheets.json",
            serde_json::to_string_pretty(&self.worksheets)?,
        )?;
        write_json_entry(
            &mut zip,
            "plots.json",
            serde_json::to_string_pretty(&self.plots)?,
        )?;
        write_json_entry(
            &mut zip,
            "analyses.json",
            serde_json::to_string_pretty(&self.analyses)?,
        )?;
        write_json_entry(
            &mut zip,
            "workflows.json",
            serde_json::to_string_pretty(&self.workflows)?,
        )?;

        let cursor = zip
            .finish()
            .map_err(|e| ScientificError::IoError(e.to_string()))?;
        Ok(cursor.into_inner())
    }

    /// Deserializes a project from `.spsproj` ZIP container bytes (or plain JSON fallback).
    pub fn from_spsproj_bytes(bytes: &[u8]) -> ScientificResult<Self> {
        // First check if it's plain JSON (starts with '{')
        let trimmed = bytes.iter().copied().find(|b| !b.is_ascii_whitespace());
        if trimmed == Some(b'{') {
            let proj: Self = serde_json::from_slice(bytes)?;
            if proj.format_version > CURRENT_PROJECT_VERSION {
                return Err(ScientificError::UnsupportedVersion {
                    found: proj.format_version,
                    max_supported: CURRENT_PROJECT_VERSION,
                });
            }
            return Ok(proj);
        }

        let cursor = Cursor::new(bytes);
        let mut archive =
            ZipArchive::new(cursor).map_err(|e| ScientificError::IoError(e.to_string()))?;

        let read_entry =
            |archive: &mut ZipArchive<Cursor<&[u8]>>, name: &str| -> ScientificResult<String> {
                let mut file = archive.by_name(name).map_err(|e| {
                    ScientificError::IoError(format!("Missing '{name}' in .spsproj: {e}"))
                })?;
                let mut content = String::new();
                file.read_to_string(&mut content)?;
                Ok(content)
            };

        let manifest_str = read_entry(&mut archive, "manifest.json")?;
        let manifest: ProjectManifest = serde_json::from_str(&manifest_str)?;

        if manifest.format_version > CURRENT_PROJECT_VERSION {
            return Err(ScientificError::UnsupportedVersion {
                found: manifest.format_version,
                max_supported: CURRENT_PROJECT_VERSION,
            });
        }

        let datasets: Vec<Dataset> =
            serde_json::from_str(&read_entry(&mut archive, "datasets.json")?)?;
        let worksheets: Vec<Worksheet> =
            serde_json::from_str(&read_entry(&mut archive, "worksheets.json")?)?;
        let plots: Vec<PlotDocument> =
            serde_json::from_str(&read_entry(&mut archive, "plots.json")?)?;
        let analyses: Vec<AnalysisResult> =
            serde_json::from_str(&read_entry(&mut archive, "analyses.json")?)?;
        let workflows: Vec<AnalysisWorkflow> = read_entry(&mut archive, "workflows.json")
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(AnalysisWorkflow::default_scientific_workflows);

        Ok(Self {
            format_version: manifest.format_version,
            id: manifest.id,
            name: manifest.name,
            created_at: manifest.created_at,
            updated_at: manifest.updated_at,
            datasets,
            worksheets,
            plots,
            analyses,
            workflows,
            dependency_graph: manifest.dependency_graph,
            active_tab_id: manifest.active_tab_id,
        })
    }

    /// Atomically saves the `.spsproj` container to `path` by writing to a temporary sibling file
    /// and renaming it over the target path so interrupted writes never corrupt an existing project.
    pub fn save_atomic(&self, path: impl AsRef<Path>) -> ScientificResult<()> {
        let target = path.as_ref();
        if let Some(parent) = target.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                fs::create_dir_all(parent)?;
            }
        }

        let bytes = self.to_spsproj_bytes()?;
        let tmp_path = Self::temp_path_for(target);

        {
            let mut file = fs::File::create(&tmp_path)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }

        fs::rename(&tmp_path, target)?;
        Ok(())
    }

    /// Loads a `.spsproj` container from `path`.
    pub fn load_from_path(path: impl AsRef<Path>) -> ScientificResult<Self> {
        let bytes = fs::read(path.as_ref())?;
        Self::from_spsproj_bytes(&bytes)
    }

    fn temp_path_for(target: &Path) -> PathBuf {
        let file_name = target
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("project.spsproj");
        target.with_file_name(format!(".{file_name}.tmp"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_sample_project_through_spsproj_container() {
        let project = Project::create_sample_project().expect("sample project");
        assert_eq!(project.datasets.len(), 2);
        assert_eq!(project.plots.len(), 2);
        assert_eq!(project.analyses.len(), 2);

        let dir = tempfile::tempdir().expect("tempdir");
        let file_path = dir.path().join("study.spsproj");

        project.save_atomic(&file_path).expect("save atomic");
        let loaded = Project::load_from_path(&file_path).expect("load");

        assert_eq!(loaded.id, project.id);
        assert_eq!(loaded.name, project.name);
        assert_eq!(loaded.datasets.len(), 2);
        assert_eq!(loaded.plots.len(), 2);
        assert_eq!(loaded.analyses.len(), 2);
        assert_eq!(
            loaded.analyses[0].parameters,
            project.analyses[0].parameters
        );
    }

    #[test]
    fn recalculates_dependent_fit_when_dataset_cell_changes() {
        let mut project = Project::create_sample_project().expect("sample project");
        let cal_ds_id = project.datasets[1].id.clone();
        let y_col_id = project.datasets[1].columns[1].id.clone();
        let original_slope = project.analyses[1].parameters[0].value;

        // Modify last Y observation in calibration dataset
        project
            .dataset_mut(&cal_ds_id)
            .expect("ds")
            .set_cell(&y_col_id, 10, "2.500")
            .expect("set cell");

        project
            .recalculate_dependents_of_dataset(&cal_ds_id)
            .expect("recalc");

        let updated_slope = project.analyses[1].parameters[0].value;
        assert!(
            (updated_slope - original_slope).abs() > 1e-4,
            "Expected slope to update after modifying source dataset cell"
        );
    }

    #[test]
    fn rejects_unsupported_future_version() {
        let mut project = Project::create_blank_project("Future Project");
        project.format_version = CURRENT_PROJECT_VERSION + 5;
        let bytes = project.to_spsproj_bytes().expect("bytes");
        let err = Project::from_spsproj_bytes(&bytes).expect_err("should fail version check");
        assert!(matches!(
            err,
            ScientificError::UnsupportedVersion {
                found: 6,
                max_supported: 1
            }
        ));
    }
}
