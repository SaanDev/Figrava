use crate::state::{AppState, WorkspaceSnapshot};
use analysis_engine::{
    apply_frequency_filter, compute_descriptive_stats, compute_fft_spectrum,
    compute_numerical_integration, compute_paired_correlation, detect_peaks,
    estimate_initial_parameters, run_one_way_anova, run_t_test, AnovaResult, DescriptiveStats,
    DetectedPeak, FftSpectrumResult, FilterKind, FitConfiguration, FitModelKind, IntegrationResult,
    PairedCorrelation, TTestKind, TTestResult, WindowFunction,
};
use data_engine::{
    export_delimited_str, import_delimited_str, import_xlsx_bytes, ColumnRole, ColumnTransform,
    DataColumn, Dataset, DatasetSource, ImportOptions,
};
use plot_model::{AnalysisCurveKind, LayerDataSource, PlotAnnotation, PlotDocument, PlotType};
use project_engine::Project;
use scientific_core::{
    clean_paired_data, AnalysisId, ColumnId, DatasetId, PlotId, ScientificError,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum DatasetMutation {
    AddRow,
    DeleteRow {
        row_index: usize,
    },
    AddColumn {
        name: String,
        role: ColumnRole,
        unit: Option<String>,
    },
    RemoveColumn {
        col_id: ColumnId,
    },
    DuplicateColumn {
        col_id: ColumnId,
    },
    RenameColumn {
        col_id: ColumnId,
        new_name: String,
        unit: Option<String>,
    },
    SetColumnRole {
        col_id: ColumnId,
        role: ColumnRole,
    },
    SortByColumn {
        col_id: ColumnId,
        ascending: bool,
    },
    TransformColumn {
        col_id: ColumnId,
        transform: ColumnTransform,
        result_name: Option<String>,
    },
}

fn map_err(err: ScientificError) -> String {
    err.to_string()
}

pub fn handle_get_project_state(state: &AppState) -> Result<WorkspaceSnapshot, String> {
    state.snapshot().map_err(map_err)
}

#[tauri::command]
pub fn get_project_state(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    handle_get_project_state(&state)
}

pub fn handle_new_project(
    state: &AppState,
    name: String,
    use_sample: bool,
) -> Result<WorkspaceSnapshot, String> {
    let proj = if use_sample {
        Project::create_sample_project().map_err(map_err)?
    } else {
        Project::create_blank_project(name)
    };
    state.replace_project(proj, None).map_err(map_err)
}

#[tauri::command]
pub fn new_project(
    state: State<'_, AppState>,
    name: String,
    use_sample: bool,
) -> Result<WorkspaceSnapshot, String> {
    handle_new_project(&state, name, use_sample)
}

pub fn handle_save_project(
    state: &AppState,
    path: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let snap = state.snapshot().map_err(map_err)?;
    let target_path = path.or(snap.project_path).ok_or_else(|| {
        "No target file path provided for saving the project (.spsproj)".to_string()
    })?;
    snap.project.save_atomic(&target_path).map_err(map_err)?;
    state.mark_saved(Some(target_path)).map_err(map_err)
}

#[tauri::command]
pub fn save_project(
    state: State<'_, AppState>,
    path: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    handle_save_project(&state, path)
}

pub fn sanitize_default_filename(raw: &str, default_stem: &str, ext: &str) -> String {
    let sanitized: String = raw
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == ' ' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string();
    let stem = if sanitized.is_empty() {
        default_stem.to_string()
    } else {
        sanitized
    };
    let expected_suffix = format!(".{}", ext.trim_start_matches('.'));
    if stem.to_ascii_lowercase().ends_with(&expected_suffix.to_ascii_lowercase()) {
        stem
    } else {
        format!("{stem}{expected_suffix}")
    }
}

pub fn write_export_bytes_to_path(
    mut path: std::path::PathBuf,
    extensions: &[String],
    bytes: &[u8],
) -> Result<String, String> {
    if path.extension().is_none() {
        if let Some(first_ext) = extensions.first() {
            let clean_ext = first_ext.trim_start_matches('.');
            if !clean_ext.is_empty() {
                path.set_extension(clean_ext);
            }
        }
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory '{}': {e}", parent.display()))?;
        }
    }
    std::fs::write(&path, bytes)
        .map_err(|e| format!("Failed to write file '{}': {e}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn save_project_with_dialog(
    state: State<'_, AppState>,
    default_name: Option<String>,
) -> Result<Option<WorkspaceSnapshot>, String> {
    let snap = state.snapshot().map_err(map_err)?;
    let fallback_name = sanitize_default_filename(
        default_name
            .as_deref()
            .unwrap_or(&snap.project.name),
        "project",
        "spsproj",
    );

    let mut dialog = rfd::FileDialog::new()
        .set_title("Save Figrava v1.0 Project")
        .add_filter("Figrava Project (*.spsproj)", &["spsproj"]);

    if let Some(ref existing_path) = snap.project_path {
        let path_ref = std::path::Path::new(existing_path);
        if let Some(parent) = path_ref.parent() {
            if parent.exists() {
                dialog = dialog.set_directory(parent);
            }
        }
        if let Some(file_name) = path_ref.file_name().and_then(|n| n.to_str()) {
            dialog = dialog.set_file_name(file_name);
        } else {
            dialog = dialog.set_file_name(&fallback_name);
        }
    } else {
        dialog = dialog.set_file_name(&fallback_name);
    }

    let Some(mut chosen_path) = dialog.save_file() else {
        return Ok(None);
    };

    if chosen_path.extension().is_none() {
        chosen_path.set_extension("spsproj");
    }

    snap.project.save_atomic(&chosen_path).map_err(map_err)?;
    let saved_path_str = chosen_path.to_string_lossy().to_string();
    let updated_snap = state.mark_saved(Some(saved_path_str)).map_err(map_err)?;
    Ok(Some(updated_snap))
}

#[tauri::command]
pub fn save_file_with_dialog(
    default_name: String,
    filter_name: String,
    extensions: Vec<String>,
    bytes: Vec<u8>,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let ext_refs: Vec<&str> = extensions
        .iter()
        .map(|s| s.trim_start_matches('.'))
        .filter(|s| !s.is_empty())
        .collect();

    let first_ext = ext_refs.first().copied().unwrap_or("dat");
    let safe_default = sanitize_default_filename(&default_name, "output", first_ext);

    let mut dialog = rfd::FileDialog::new()
        .set_title(title.as_deref().unwrap_or("Save Output File"))
        .set_file_name(&safe_default);

    if !ext_refs.is_empty() {
        dialog = dialog.add_filter(&filter_name, &ext_refs);
    }

    let Some(chosen_path) = dialog.save_file() else {
        return Ok(None);
    };

    let saved_path = write_export_bytes_to_path(chosen_path, &extensions, &bytes)?;
    Ok(Some(saved_path))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PickedDatasetFile {
    pub file_name: String,
    pub file_path: String,
    pub is_binary_excel: bool,
    pub text_content: Option<String>,
    pub binary_bytes: Option<Vec<u8>>,
}

#[tauri::command]
pub fn open_project_with_dialog(
    state: State<'_, AppState>,
) -> Result<Option<WorkspaceSnapshot>, String> {
    let chosen = rfd::FileDialog::new()
        .set_title("Open Figrava v1.0 Project")
        .add_filter("Figrava Project (*.spsproj, *.json)", &["spsproj", "json"])
        .pick_file();

    let Some(path_buf) = chosen else {
        return Ok(None);
    };

    let path_str = path_buf.to_string_lossy().to_string();
    let proj = Project::load_from_path(&path_buf).map_err(map_err)?;
    let snap = state.replace_project(proj, Some(path_str)).map_err(map_err)?;
    Ok(Some(snap))
}

#[tauri::command]
pub fn pick_dataset_file_with_dialog() -> Result<Option<PickedDatasetFile>, String> {
    let chosen = rfd::FileDialog::new()
        .set_title("Import Scientific Dataset — Figrava v1.0")
        .add_filter(
            "Scientific Datasets (*.csv, *.tsv, *.txt, *.dat, *.xlsx, *.xls)",
            &["csv", "tsv", "txt", "dat", "xlsx", "xls"],
        )
        .pick_file();

    let Some(path_buf) = chosen else {
        return Ok(None);
    };

    let file_name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("dataset.csv")
        .to_string();
    let file_path = path_buf.to_string_lossy().to_string();
    let lower = file_name.to_ascii_lowercase();
    let is_binary_excel = lower.ends_with(".xlsx") || lower.ends_with(".xls");

    let raw_bytes = std::fs::read(&path_buf)
        .map_err(|e| format!("Failed to read dataset file '{}': {e}", path_buf.display()))?;

    if is_binary_excel {
        Ok(Some(PickedDatasetFile {
            file_name,
            file_path,
            is_binary_excel: true,
            text_content: None,
            binary_bytes: Some(raw_bytes),
        }))
    } else {
        let text = String::from_utf8_lossy(&raw_bytes).to_string();
        Ok(Some(PickedDatasetFile {
            file_name,
            file_path,
            is_binary_excel: false,
            text_content: Some(text),
            binary_bytes: None,
        }))
    }
}

#[tauri::command]
pub fn show_message_box(title: String, message: String, level: Option<String>) -> Result<(), String> {
    let msg_level = match level.as_deref() {
        Some("error") => rfd::MessageLevel::Error,
        Some("warning") => rfd::MessageLevel::Warning,
        _ => rfd::MessageLevel::Info,
    };
    let _ = rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&message)
        .set_level(msg_level)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    Ok(())
}

#[tauri::command]
pub fn confirm_message_box(
    title: String,
    message: String,
    level: Option<String>,
) -> Result<bool, String> {
    let msg_level = match level.as_deref() {
        Some("error") => rfd::MessageLevel::Error,
        Some("warning") => rfd::MessageLevel::Warning,
        _ => rfd::MessageLevel::Info,
    };
    let res = rfd::MessageDialog::new()
        .set_title(&title)
        .set_description(&message)
        .set_level(msg_level)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();
    Ok(matches!(
        res,
        rfd::MessageDialogResult::Yes | rfd::MessageDialogResult::Ok
    ))
}

#[tauri::command]
pub fn exit_application(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn handle_load_project(state: &AppState, path: String) -> Result<WorkspaceSnapshot, String> {
    let proj = Project::load_from_path(&path).map_err(map_err)?;
    state.replace_project(proj, Some(path)).map_err(map_err)
}

#[tauri::command]
pub fn load_project(state: State<'_, AppState>, path: String) -> Result<WorkspaceSnapshot, String> {
    handle_load_project(&state, path)
}

#[tauri::command]
pub fn export_project_bytes(state: State<'_, AppState>) -> Result<Vec<u8>, String> {
    state
        .with_project(|p| p.to_spsproj_bytes())
        .map_err(map_err)
}

#[tauri::command]
pub fn import_project_bytes(
    state: State<'_, AppState>,
    bytes: Vec<u8>,
    file_name: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let proj = Project::from_spsproj_bytes(&bytes).map_err(map_err)?;
    state.replace_project(proj, file_name).map_err(map_err)
}

pub fn handle_import_delimited_dataset(
    state: &AppState,
    content: String,
    file_name: String,
    options: ImportOptions,
) -> Result<WorkspaceSnapshot, String> {
    let ds = import_delimited_str(&content, &file_name, &options).map_err(map_err)?;
    let ws_name = ds.name.clone();
    state
        .mutate_project(|proj| {
            let ws = proj.add_dataset_with_worksheet(ds, ws_name);
            proj.active_tab_id = Some(ws.id.to_string());
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn import_delimited_dataset(
    state: State<'_, AppState>,
    content: String,
    file_name: String,
    options: ImportOptions,
) -> Result<WorkspaceSnapshot, String> {
    handle_import_delimited_dataset(&state, content, file_name, options)
}

#[tauri::command]
pub fn export_dataset_delimited(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    delimiter: String,
) -> Result<String, String> {
    let delim_char = delimiter.chars().next().unwrap_or(',');
    state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            export_delimited_str(ds, delim_char)
        })
        .map_err(map_err)
}

pub fn handle_update_cell(
    state: &AppState,
    dataset_id: DatasetId,
    col_id: ColumnId,
    row_index: usize,
    raw_value: String,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            proj.dataset_mut(&dataset_id)?
                .set_cell(&col_id, row_index, &raw_value)?;
            proj.recalculate_dependents_of_dataset(&dataset_id)?;
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn update_cell(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    col_id: ColumnId,
    row_index: usize,
    raw_value: String,
) -> Result<WorkspaceSnapshot, String> {
    handle_update_cell(&state, dataset_id, col_id, row_index, raw_value)
}

pub fn handle_dataset_structure_action(
    state: &AppState,
    dataset_id: DatasetId,
    mutation: DatasetMutation,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            let ds = proj.dataset_mut(&dataset_id)?;
            match mutation {
                DatasetMutation::AddRow => {
                    ds.add_row();
                }
                DatasetMutation::DeleteRow { row_index } => {
                    ds.delete_row(row_index)?;
                }
                DatasetMutation::AddColumn { name, role, unit } => {
                    ds.add_column(name, role, unit);
                }
                DatasetMutation::RemoveColumn { col_id } => {
                    ds.remove_column(&col_id)?;
                }
                DatasetMutation::DuplicateColumn { col_id } => {
                    ds.duplicate_column(&col_id)?;
                }
                DatasetMutation::RenameColumn {
                    col_id,
                    new_name,
                    unit,
                } => {
                    ds.rename_column(&col_id, new_name, unit)?;
                }
                DatasetMutation::SetColumnRole { col_id, role } => {
                    ds.set_column_role(&col_id, role)?;
                }
                DatasetMutation::SortByColumn { col_id, ascending } => {
                    ds.sort_by_column(&col_id, ascending)?;
                }
                DatasetMutation::TransformColumn {
                    col_id,
                    transform,
                    result_name,
                } => {
                    ds.apply_column_transform(&col_id, &transform, result_name)?;
                }
            }
            proj.recalculate_dependents_of_dataset(&dataset_id)?;
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn dataset_structure_action(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    mutation: DatasetMutation,
) -> Result<WorkspaceSnapshot, String> {
    handle_dataset_structure_action(&state, dataset_id, mutation)
}

#[tauri::command]
pub fn compute_column_statistics(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    col_id: ColumnId,
) -> Result<DescriptiveStats, String> {
    state
        .with_project(|proj| {
            let vals = proj.dataset(&dataset_id)?.column(&col_id)?.numeric_values();
            compute_descriptive_stats(&vals)
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn compute_columns_correlation(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
) -> Result<PairedCorrelation, String> {
    state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let x_vals = ds.column(&x_col_id)?.numeric_values();
            let y_vals = ds.column(&y_col_id)?.numeric_values();
            compute_paired_correlation(&x_vals, &y_vals)
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn estimate_fit_parameters(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    model: FitModelKind,
) -> Result<Vec<f64>, String> {
    state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let x_vals = ds.column(&x_col_id)?.numeric_values();
            let y_vals = ds.column(&y_col_id)?.numeric_values();
            let cleaned = clean_paired_data(&x_vals, &y_vals, None, None, 2)?;
            Ok(estimate_initial_parameters(&model, &cleaned.x, &cleaned.y))
        })
        .map_err(map_err)
}

pub fn handle_execute_curve_fit(
    state: &AppState,
    config: FitConfiguration,
    custom_name: Option<String>,
    target_plot_id: Option<PlotId>,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            let ds_id = config.dataset_id.clone();
            let res = proj.execute_and_store_fit(config, custom_name.as_deref())?;
            if let Some(plot_id) = target_plot_id {
                let plot = proj.plot_mut(&plot_id)?;
                plot.add_analysis_layer(
                    format!("{} Curve", res.name),
                    res.id.clone(),
                    ds_id,
                    AnalysisCurveKind::FittedCurve,
                    None,
                );
                let updated = plot.clone();
                proj.update_plot(updated)?;
            } else {
                proj.active_tab_id = Some(res.id.to_string());
            }
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn execute_curve_fit(
    state: State<'_, AppState>,
    config: FitConfiguration,
    custom_name: Option<String>,
    target_plot_id: Option<PlotId>,
) -> Result<WorkspaceSnapshot, String> {
    handle_execute_curve_fit(&state, config, custom_name, target_plot_id)
}

#[allow(clippy::too_many_arguments)]
pub fn handle_create_plot(
    state: &AppState,
    name: String,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    y_err_col_id: Option<ColumnId>,
    z_col_id: Option<ColumnId>,
    plot_type: PlotType,
    y_col_ids: Option<Vec<ColumnId>>,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let x_col = ds.column(&x_col_id)?.clone();

            let target_y_ids: Vec<ColumnId> = match y_col_ids {
                Some(ids) => {
                    let filtered: Vec<ColumnId> =
                        ids.into_iter().filter(|id| !id.as_str().is_empty()).collect();
                    if filtered.is_empty() {
                        vec![y_col_id.clone()]
                    } else {
                        filtered
                    }
                }
                None => vec![y_col_id.clone()],
            };

            let first_y_col = ds.column(&target_y_ids[0])?.clone();

            let resolved_z_col = match z_col_id.filter(|id| !id.as_str().is_empty()) {
                Some(zc) => {
                    let _ = ds.column(&zc)?;
                    Some(zc)
                }
                None if plot_type.is_3d() => ds
                    .columns
                    .iter()
                    .find(|c| c.role == ColumnRole::Z && c.id != x_col_id && c.id != first_y_col.id)
                    .or_else(|| {
                        ds.columns
                            .iter()
                            .find(|c| c.id != x_col_id && c.id != first_y_col.id)
                    })
                    .map(|c| c.id.clone()),
                None => None,
            };

            let mut plot = PlotDocument::new(name);
            plot.primary_panel_mut().x_axis.title = x_col.name.clone();
            plot.primary_panel_mut().x_axis.unit = x_col.unit.clone();
            plot.primary_panel_mut().y_axis.title = if target_y_ids.len() == 1 {
                first_y_col.name.clone()
            } else if target_y_ids.len() == 2 {
                let second_name = ds
                    .column(&target_y_ids[1])
                    .map(|c| c.name.as_str())
                    .unwrap_or("Y2");
                format!("{} / {}", first_y_col.name, second_name)
            } else {
                first_y_col.name.clone()
            };
            plot.primary_panel_mut().y_axis.unit = first_y_col.unit.clone();

            let explicit_y_err = y_err_col_id.filter(|id| !id.as_str().is_empty());

            for yc_id in &target_y_ids {
                let y_col = ds.column(yc_id)?.clone();
                let layer_label = if plot_type.is_3d() && target_y_ids.len() == 1 {
                    if let Some(ref zc) = resolved_z_col {
                        ds.column(zc)
                            .map(|c| c.name.clone())
                            .unwrap_or_else(|_| y_col.name.clone())
                    } else {
                        y_col.name.clone()
                    }
                } else {
                    y_col.name.clone()
                };

                // OriginPro convention: if an explicit yErr column is chosen, use it;
                // otherwise, when plotting multiple Y columns, automatically pair a Y column
                // with its immediately adjacent [yErr] column if present.
                let paired_y_err = if explicit_y_err.is_some() && target_y_ids.len() == 1 {
                    explicit_y_err.clone()
                } else if let Some(pos) = ds.columns.iter().position(|c| &c.id == yc_id) {
                    ds.columns
                        .get(pos + 1)
                        .filter(|next_col| next_col.role == ColumnRole::YError)
                        .map(|next_col| next_col.id.clone())
                        .or_else(|| explicit_y_err.clone())
                } else {
                    explicit_y_err.clone()
                };

                let layer_id = plot.add_dataset_layer(
                    layer_label,
                    plot_type,
                    dataset_id.clone(),
                    x_col_id.clone(),
                    yc_id.clone(),
                    None,
                    paired_y_err,
                );
                if let Some(ref zc) = resolved_z_col {
                    if let Some(layer) = plot.layers.iter_mut().find(|l| l.id == layer_id) {
                        if let LayerDataSource::DatasetColumns { z_col, .. } = &mut layer.source {
                            *z_col = Some(zc.clone());
                        }
                    }
                }
            }

            let plot_id = proj.add_plot(plot)?;
            proj.active_tab_id = Some(plot_id.to_string());
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_plot(
    state: State<'_, AppState>,
    name: String,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    y_err_col_id: Option<ColumnId>,
    z_col_id: Option<ColumnId>,
    plot_type: PlotType,
    y_col_ids: Option<Vec<ColumnId>>,
) -> Result<WorkspaceSnapshot, String> {
    handle_create_plot(
        &state,
        name,
        dataset_id,
        x_col_id,
        y_col_id,
        y_err_col_id,
        z_col_id,
        plot_type,
        y_col_ids,
    )
}

pub fn handle_update_plot_document(
    state: &AppState,
    plot: PlotDocument,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| proj.update_plot(plot))
        .map_err(map_err)
}

#[tauri::command]
pub fn update_plot_document(
    state: State<'_, AppState>,
    plot: PlotDocument,
) -> Result<WorkspaceSnapshot, String> {
    handle_update_plot_document(&state, plot)
}

#[tauri::command]
pub fn duplicate_plot_document(
    state: State<'_, AppState>,
    plot_id: PlotId,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            let existing = proj.plot(&plot_id)?.clone();
            let dup = existing.duplicate(format!("{} (Copy)", existing.name));
            let new_id = proj.add_plot(dup)?;
            proj.active_tab_id = Some(new_id.to_string());
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn delete_entity(
    state: State<'_, AppState>,
    entity_kind: String,
    entity_id: String,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            match entity_kind.as_str() {
                "plot" => {
                    proj.plots.retain(|p| p.id.as_str() != entity_id);
                    proj.dependency_graph.remove_node(&entity_id);
                }
                "analysis" => {
                    let target_id = AnalysisId::from_raw(entity_id.clone());
                    proj.analyses.retain(|a| a.id != target_id);
                    for plot in &mut proj.plots {
                        plot.layers.retain(|l| match &l.source {
                            plot_model::LayerDataSource::AnalysisOutput { analysis_id, .. } => {
                                analysis_id != &target_id
                            }
                            _ => true,
                        });
                    }
                    proj.dependency_graph.remove_node(&entity_id);
                }
                _ => {
                    return Err(ScientificError::InvalidParameter {
                        name: "entity_kind".to_string(),
                        reason: format!("Unsupported entity kind '{entity_kind}'"),
                    });
                }
            }
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn undo_action(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    state.undo().map_err(map_err)
}

#[tauri::command]
pub fn redo_action(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    state.redo().map_err(map_err)
}

#[tauri::command]
pub fn import_excel_dataset(
    state: State<'_, AppState>,
    bytes: Vec<u8>,
    file_name: String,
    sheet_name: Option<String>,
) -> Result<WorkspaceSnapshot, String> {
    let ds = import_xlsx_bytes(&bytes, &file_name, sheet_name.as_deref()).map_err(map_err)?;
    let ws_name = ds.name.clone();
    state
        .mutate_project(|proj| {
            let ws = proj.add_dataset_with_worksheet(ds, ws_name);
            proj.active_tab_id = Some(ws.id.to_string());
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn export_plot_pdf(state: State<'_, AppState>, plot_id: PlotId) -> Result<Vec<u8>, String> {
    state
        .with_project(|proj| proj.export_plot_pdf_bytes(&plot_id))
        .map_err(map_err)
}

#[tauri::command]
pub fn load_3d_sample(state: State<'_, AppState>) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            proj.load_3d_sample_dataset()?;
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn run_signal_fft(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    window: WindowFunction,
    create_spectrum_plot: bool,
) -> Result<(FftSpectrumResult, WorkspaceSnapshot), String> {
    let fft_res = state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let x_vals = ds.column(&x_col_id)?.numeric_values();
            let y_vals = ds.column(&y_col_id)?.numeric_values();
            compute_fft_spectrum(&x_vals, &y_vals, window)
        })
        .map_err(map_err)?;

    let snap = if create_spectrum_plot {
        let freq_col = DataColumn::new_numeric(
            "Frequency",
            ColumnRole::X,
            Some("Hz".to_string()),
            fft_res.frequencies.clone(),
        );
        let mag_col = DataColumn::new_numeric(
            "FFT Amplitude",
            ColumnRole::Y,
            None,
            fft_res.magnitudes.clone(),
        );
        let psd_col = DataColumn::new_numeric(
            "Power Spectral Density",
            ColumnRole::Y,
            None,
            fft_res.power_spectral_density.clone(),
        );
        let f_id = freq_col.id.clone();
        let m_id = mag_col.id.clone();
        let spec_ds = Dataset::new(
            "FFT Power Spectrum",
            DatasetSource::Synthesized {
                description: format!("FFT Spectrum (f_dom = {:.4})", fft_res.dominant_frequency),
            },
            vec![freq_col, mag_col, psd_col],
        );
        let spec_ds_id = spec_ds.id.clone();

        state
            .mutate_project(|proj| {
                proj.add_dataset_with_worksheet(spec_ds, "FFT Spectrum");
                let mut plot = PlotDocument::new("FFT Frequency Spectrum");
                plot.primary_panel_mut().x_axis.title = "Frequency".to_string();
                plot.primary_panel_mut().x_axis.unit = Some("Hz".to_string());
                plot.primary_panel_mut().y_axis.title = "Amplitude".to_string();
                plot.add_dataset_layer(
                    "Single-Sided Amplitude",
                    PlotType::Line,
                    spec_ds_id,
                    f_id,
                    m_id,
                    None,
                    None,
                );
                let pid = proj.add_plot(plot)?;
                proj.active_tab_id = Some(pid.to_string());
                Ok(())
            })
            .map_err(map_err)?
    } else {
        state.snapshot().map_err(map_err)?
    };

    Ok((fft_res, snap))
}

#[tauri::command]
pub fn run_signal_filter(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    filter: FilterKind,
) -> Result<WorkspaceSnapshot, String> {
    state
        .mutate_project(|proj| {
            let ds = proj.dataset_mut(&dataset_id)?;
            let x_vals = ds.column(&x_col_id)?.numeric_values();
            let y_col = ds.column(&y_col_id)?;
            let y_name = y_col.name.clone();
            let y_unit = y_col.unit.clone();
            let y_vals = y_col.numeric_values();
            let filtered = apply_frequency_filter(&x_vals, &y_vals, filter)?;
            let col = DataColumn::new_numeric(
                format!("{y_name} (Filtered)"),
                ColumnRole::Y,
                y_unit,
                filtered,
            );
            ds.columns.push(col);
            proj.recalculate_dependents_of_dataset(&dataset_id)?;
            Ok(())
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn run_peak_detection(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    min_prominence: f64,
    annotate_plot_id: Option<PlotId>,
) -> Result<(Vec<DetectedPeak>, WorkspaceSnapshot), String> {
    let peaks = state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let x_vals = ds.column(&x_col_id)?.numeric_values();
            let y_vals = ds.column(&y_col_id)?.numeric_values();
            detect_peaks(&x_vals, &y_vals, min_prominence)
        })
        .map_err(map_err)?;

    let snap = if let Some(pid) = annotate_plot_id {
        let top_peaks: Vec<DetectedPeak> = peaks.iter().take(8).cloned().collect();
        state
            .mutate_project(|proj| {
                if let Ok(plot) = proj.plot_mut(&pid) {
                    for pk in &top_peaks {
                        plot.annotations.push(PlotAnnotation::Text {
                            id: scientific_core::AnnotationId::new(),
                            text: format!("Peak {:.2} (FWHM {:.2})", pk.x, pk.fwhm),
                            x: pk.x,
                            y: pk.y,
                            color: "#B91C1C".to_string(),
                            font_size: 10,
                        });
                    }
                }
                Ok(())
            })
            .map_err(map_err)?
    } else {
        state.snapshot().map_err(map_err)?
    };

    Ok((peaks, snap))
}

#[tauri::command]
pub fn run_numerical_integration(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
) -> Result<IntegrationResult, String> {
    state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let x_vals = ds.column(&x_col_id)?.numeric_values();
            let y_vals = ds.column(&y_col_id)?.numeric_values();
            compute_numerical_integration(&x_vals, &y_vals)
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn run_hypothesis_t_test(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    col_a_id: ColumnId,
    col_b_id: Option<ColumnId>,
    kind: TTestKind,
) -> Result<TTestResult, String> {
    state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let a_vals = ds.column(&col_a_id)?.numeric_values();
            let b_vals = match &col_b_id {
                Some(bid) => Some(ds.column(bid)?.numeric_values()),
                None => None,
            };
            run_t_test(&a_vals, b_vals.as_deref(), kind)
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn run_hypothesis_anova(
    state: State<'_, AppState>,
    dataset_id: DatasetId,
    col_ids: Vec<ColumnId>,
) -> Result<AnovaResult, String> {
    state
        .with_project(|proj| {
            let ds = proj.dataset(&dataset_id)?;
            let mut groups = Vec::with_capacity(col_ids.len());
            for cid in &col_ids {
                let col = ds.column(cid)?;
                groups.push((col.name.clone(), col.numeric_values()));
            }
            run_one_way_anova(&groups)
        })
        .map_err(map_err)
}

#[tauri::command]
pub fn execute_workflow(
    state: State<'_, AppState>,
    workflow_id: String,
    dataset_id: DatasetId,
    x_col_id: ColumnId,
    y_col_id: ColumnId,
    plot_id: Option<PlotId>,
) -> Result<(String, WorkspaceSnapshot), String> {
    let mut summary = String::new();
    let snap = state
        .mutate_project(|proj| {
            summary = proj.run_workflow(
                &workflow_id,
                &dataset_id,
                &x_col_id,
                &y_col_id,
                plot_id.as_ref(),
            )?;
            Ok(())
        })
        .map_err(map_err)?;
    Ok((summary, snap))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tauri_state_starts_empty_and_executes_undo_redo_and_recalculation() {
        let state = AppState::new();
        let empty_snap = handle_get_project_state(&state).expect("initial empty state");
        assert!(!empty_snap.dirty);
        assert!(empty_snap.project.datasets.is_empty());
        assert!(empty_snap.project.worksheets.is_empty());
        assert!(empty_snap.project.plots.is_empty());

        let snap0 = handle_new_project(&state, "Demo Study".to_string(), true).expect("load demo");
        assert!(!snap0.dirty);
        assert_eq!(snap0.project.datasets.len(), 2);

        let ds_id = snap0.project.datasets[1].id.clone();
        let y_col = snap0.project.datasets[1].columns[1].id.clone();

        let snap1 =
            handle_update_cell(&state, ds_id, y_col, 0, "0.250".to_string()).expect("update cell");
        assert!(snap1.dirty);
        assert!(snap1.can_undo);

        let snap_undo = state.undo().expect("undo");
        assert!(snap_undo.can_redo);
        assert_eq!(
            snap_undo.project.datasets[1].columns[1].values[0],
            snap0.project.datasets[1].columns[1].values[0]
        );
    }

    #[test]
    fn creates_3d_plot_from_imported_xyz_csv() {
        let state = AppState::new();
        let csv_content = "x,y,z\n0,0,1.2\n1,0,2.4\n0,1,3.1\n1,1,4.5\n".to_string();
        let snap_import = handle_import_delimited_dataset(
            &state,
            csv_content,
            "surface.csv".to_string(),
            ImportOptions::default(),
        )
        .expect("import xyz csv");
        assert_eq!(snap_import.project.datasets.len(), 1);
        let ds = &snap_import.project.datasets[0];
        assert_eq!(ds.columns.len(), 3);
        assert_eq!(ds.columns[2].role, ColumnRole::Z);

        let plot_type: PlotType = serde_json::from_str("\"surface_3d\"").expect("deserialize surface_3d");
        let snap_plot = handle_create_plot(
            &state,
            "3D Surface from CSV".to_string(),
            ds.id.clone(),
            ds.columns[0].id.clone(),
            ds.columns[1].id.clone(),
            None,
            Some(ds.columns[2].id.clone()),
            plot_type,
            None,
        )
        .expect("create 3d plot");

        assert_eq!(snap_plot.project.plots.len(), 1);
        let created_plot = &snap_plot.project.plots[0];
        assert_eq!(created_plot.layers[0].plot_type, PlotType::Surface3D);
    }

    #[test]
    fn creates_multi_series_plot_from_selected_columns() {
        let state = AppState::new();
        let csv_content =
            "Wavelength [nm],Sample A [counts],Sample B [counts],Sample C [counts]\n450,120,95,80\n500,340,210,190\n550,820,610,540\n"
                .to_string();
        let snap_import = handle_import_delimited_dataset(
            &state,
            csv_content,
            "multi_spectra.csv".to_string(),
            ImportOptions::default(),
        )
        .expect("import multi-column csv");
        let ds = &snap_import.project.datasets[0];
        assert_eq!(ds.columns.len(), 4);

        // Select Sample A and Sample C (columns 1 and 3) to plot against Wavelength (column 0)
        let selected_y = vec![ds.columns[1].id.clone(), ds.columns[3].id.clone()];
        let snap_plot = handle_create_plot(
            &state,
            "Multi-Series Spectra".to_string(),
            ds.id.clone(),
            ds.columns[0].id.clone(),
            ds.columns[1].id.clone(),
            None,
            None,
            PlotType::LineSymbols,
            Some(selected_y),
        )
        .expect("create multi-series plot");

        let created_plot = &snap_plot.project.plots[0];
        assert_eq!(created_plot.layers.len(), 2);
        assert_eq!(created_plot.layers[0].label, "Sample A");
        assert_eq!(created_plot.layers[1].label, "Sample C");
        assert_ne!(
            created_plot.layers[0].style.color,
            created_plot.layers[1].style.color
        );
    }

    #[test]
    fn sanitizes_filename_and_writes_export_bytes() {
        assert_eq!(
            sanitize_default_filename("Fig 1: Kinetics/Fit", "figure", "pdf"),
            "Fig 1_ Kinetics_Fit.pdf"
        );
        assert_eq!(
            sanitize_default_filename("report.csv", "report", "csv"),
            "report.csv"
        );

        let dir = std::env::temp_dir().join(format!("sps_export_test_{}", std::process::id()));
        let target = dir.join("test_output");
        let saved = write_export_bytes_to_path(target, &["svg".to_string()], b"<svg></svg>")
            .expect("write export bytes");
        assert!(saved.ends_with("test_output.svg"));
        let read_back = std::fs::read_to_string(&saved).expect("read exported file");
        assert_eq!(read_back, "<svg></svg>");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
