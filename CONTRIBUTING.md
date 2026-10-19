# Contributing to Scientific Plot Studio

## Engineering Guidelines

1. **Scientific Rigor**: Never implement numerical routines in the frontend UI layer when they belong in `crates/analysis-engine` or `crates/data-engine`. Every mathematical algorithm must document its formulation, assumptions, and failure modes.
2. **Preserve Renderer Independence**: All figure properties must be added to `crates/plot-model` and `src/types/scientific.ts` before adapting them in `src/features/plotting/echartsAdapter.ts`.
3. **Required Pre-Commit Checks**:
   ```bash
   cargo fmt --check
   cargo clippy --workspace --all-targets -- -D warnings
   cargo test --workspace
   npm run typecheck
   npm test
   npm run build
   ```
4. **Documentation**: Update the corresponding specification in `docs/` whenever data models, fitting algorithms, or `.spsproj` container schemas change.
