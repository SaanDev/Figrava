pub mod commands;
pub mod state;

use state::AppState;

#[cfg(target_os = "windows")]
fn configure_webview_data_folder() {
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some() {
        return;
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let profile_kind = if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        };
        let base_dir = std::path::PathBuf::from(local_app_data)
            .join("org.figrava.studio")
            .join(profile_kind);
        let lock_file = base_dir.join("EBWebView").join("lockfile");

        let target_dir = if lock_file.exists()
            && std::fs::OpenOptions::new()
                .write(true)
                .open(&lock_file)
                .is_err()
        {
            base_dir.join(format!("instance-{}", std::process::id()))
        } else {
            base_dir
        };

        let _ = std::fs::create_dir_all(&target_dir);
        // SAFETY: Invoked on the main thread at startup before Tauri spawns worker threads.
        unsafe {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", target_dir);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    configure_webview_data_folder();

    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_project_state,
            commands::new_project,
            commands::save_project,
            commands::save_project_with_dialog,
            commands::save_file_with_dialog,
            commands::open_project_with_dialog,
            commands::pick_dataset_file_with_dialog,
            commands::show_message_box,
            commands::confirm_message_box,
            commands::exit_application,
            commands::load_project,
            commands::export_project_bytes,
            commands::import_project_bytes,
            commands::import_delimited_dataset,
            commands::import_excel_dataset,
            commands::export_dataset_delimited,
            commands::export_plot_pdf,
            commands::load_3d_sample,
            commands::update_cell,
            commands::dataset_structure_action,
            commands::compute_column_statistics,
            commands::compute_columns_correlation,
            commands::estimate_fit_parameters,
            commands::execute_curve_fit,
            commands::create_plot,
            commands::update_plot_document,
            commands::duplicate_plot_document,
            commands::delete_entity,
            commands::undo_action,
            commands::redo_action,
            commands::run_signal_fft,
            commands::run_signal_filter,
            commands::run_peak_detection,
            commands::run_numerical_integration,
            commands::run_hypothesis_t_test,
            commands::run_hypothesis_anova,
            commands::execute_workflow,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Figrava v1.0 application");
}
