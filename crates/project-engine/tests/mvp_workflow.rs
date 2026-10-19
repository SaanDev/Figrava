use analysis_engine::{compute_descriptive_stats, FitConfiguration, FitModelKind};
use data_engine::{import_delimited_str, ColumnRole, ImportOptions};
use plot_model::{AnalysisCurveKind, AxisScale, LineStyle, PlotDocument, PlotType, SymbolShape};
use project_engine::Project;
use std::path::PathBuf;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crates/")
        .parent()
        .expect("workspace root")
        .join("fixtures")
        .join(name)
}

#[test]
fn end_to_end_mvp_scientific_workflow() {
    // 1. Create a new project
    let mut project = Project::create_blank_project("Spectroscopy Validation Session");
    assert_eq!(project.datasets.len(), 1);

    // 2. Import CSV and TSV datasets from fixtures/
    let csv_raw =
        std::fs::read_to_string(fixture_path("beer_lambert_calibration.csv")).expect("read csv");
    let cal_ds = import_delimited_str(
        &csv_raw,
        "beer_lambert_calibration.csv",
        &ImportOptions::default(),
    )
    .expect("import calibration csv");

    assert_eq!(cal_ds.column_count(), 4);
    assert_eq!(cal_ds.row_count(), 11);
    assert_eq!(cal_ds.columns[0].role, ColumnRole::X);
    assert_eq!(cal_ds.columns[1].role, ColumnRole::Y);
    assert_eq!(cal_ds.columns[2].role, ColumnRole::YError);

    let cal_ds_id = cal_ds.id.clone();
    let x_col = cal_ds.columns[0].id.clone();
    let y1_col = cal_ds.columns[1].id.clone();
    let yerr_col = cal_ds.columns[2].id.clone();
    let y2_col = cal_ds.columns[3].id.clone();

    project.add_dataset_with_worksheet(cal_ds, "Calibration Data");

    // 3. Compute descriptive statistics on X and Y1
    let x_vals = project
        .dataset(&cal_ds_id)
        .expect("ds")
        .column(&x_col)
        .expect("col")
        .numeric_values();
    let stats = compute_descriptive_stats(&x_vals).expect("stats");
    assert_eq!(stats.count, 11);
    assert!((stats.mean - 25.0).abs() < 1e-12);

    // 4. Create a scatter plot with error bars and a second series
    let mut plot = PlotDocument::new("Calibration Figure");
    plot.primary_panel_mut().x_axis.title = "Concentration".to_string();
    plot.primary_panel_mut().x_axis.unit = Some("uM".to_string());
    plot.primary_panel_mut().y_axis.title = "Absorbance".to_string();
    plot.primary_panel_mut().y_axis.unit = Some("AU".to_string());
    plot.primary_panel_mut().y_axis.scale = AxisScale::Linear;

    let layer1_id = plot.add_dataset_layer(
        "280 nm Series",
        PlotType::Scatter,
        cal_ds_id.clone(),
        x_col.clone(),
        y1_col.clone(),
        None,
        Some(yerr_col.clone()),
    );
    let _layer2_id = plot.add_dataset_layer(
        "310 nm Series",
        PlotType::LineSymbols,
        cal_ds_id.clone(),
        x_col.clone(),
        y2_col,
        None,
        None,
    );

    // Customize symbol and line formatting
    plot.layers[0].style.symbol_shape = SymbolShape::Square;
    plot.layers[0].style.symbol_size = 8.5;
    plot.layers[1].style.line_style = LineStyle::Dashed;
    assert_eq!(plot.layers[0].id, layer1_id);

    // 5. Perform weighted linear regression and polynomial regression
    let mut fit_cfg = FitConfiguration::new(
        cal_ds_id.clone(),
        x_col.clone(),
        y1_col,
        FitModelKind::Linear,
    );
    fit_cfg.y_err_col = Some(yerr_col);
    fit_cfg.use_weights = true;

    let fit_result = project
        .execute_and_store_fit(fit_cfg, Some("280nm Linear Fit"))
        .expect("linear fit");

    assert!(fit_result.diagnostics.converged);
    assert!(fit_result.diagnostics.r_squared > 0.999);
    assert!((fit_result.parameters[0].value - 0.0245).abs() < 1e-3);
    assert_eq!(fit_result.residuals.len(), 11);

    // 6. Add the fitted curve layer to the plot
    plot.add_analysis_layer(
        "Fitted Line",
        fit_result.id.clone(),
        cal_ds_id,
        AnalysisCurveKind::FittedCurve,
        Some("#D55E00".to_string()),
    );
    let plot_id = project.add_plot(plot).expect("add plot");

    // 7. Save and reopen project without losing data or formatting
    let temp = tempfile::tempdir().expect("tempdir");
    let proj_path = temp.path().join("calibration_session.spsproj");
    project.save_atomic(&proj_path).expect("save project");

    let reopened = Project::load_from_path(&proj_path).expect("reopen project");
    let reopened_plot = reopened.plot(&plot_id).expect("plot exists");
    assert_eq!(reopened_plot.layers.len(), 3);
    assert_eq!(
        reopened_plot.layers[0].style.symbol_shape,
        SymbolShape::Square
    );
    assert_eq!(reopened_plot.layers[1].style.line_style, LineStyle::Dashed);
    assert_eq!(reopened.analyses.len(), 1);
    assert_eq!(reopened.analyses[0].id, fit_result.id);
}
