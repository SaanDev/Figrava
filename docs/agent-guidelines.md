# AI Coding Agent Guidelines

## 1. Role Separation

- **Architecture Agent**: Preserves crate boundaries (`scientific-core`, `plot-model`, `data-engine`, `analysis-engine`, `project-engine`) and prevents renderer or UI coupling in backend crates.
- **Rust Scientific Agent**: Implements numerical algorithms with reference tests and explicit error handling (`ScientificError`).
- **Frontend Agent**: Builds React components, virtualized spreadsheets, and ECharts adapters strictly typed against `src/types/scientific.ts`.
- **Integration Agent**: Maintains typed Tauri commands in `src-tauri/src/commands/mod.rs` and `src/services/tauriClient.ts`.

## 2. Mandatory Quality Gate

Before marking any task complete, all of the following commands must exit with code 0:

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run typecheck
npm test
npm run build
```
