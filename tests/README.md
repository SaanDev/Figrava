# Integration & Reference Tests

Workspace integration and scientific reference test suites are executed via `cargo test --workspace` and `npm test`:

- **End-to-End MVP Workflow**: `crates/project-engine/tests/mvp_workflow.rs`
- **Regression & Nonlinear Fitting Reference Tests**: `crates/analysis-engine/src/regression.rs` and `crates/analysis-engine/src/nonlinear.rs`
- **Data Sanitization & Dependency DAG Tests**: `crates/scientific-core/src/validation.rs` and `crates/scientific-core/src/dependency.rs`
- **Tauri State & Command Tests**: `src-tauri/src/commands/mod.rs`
- **Frontend ECharts Adapter & Store Tests**: `src/features/plotting/echartsAdapter.test.ts` and `src/stores/useWorkspaceStore.test.ts`
