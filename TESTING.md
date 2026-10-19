# Scientific & Software Testing Guide

## 1. Numerical Reference Tests (`crates/analysis-engine`)

- **Linear Regression**: Verified against exact analytical straight lines and constant-$X$ degenerate inputs (`crates/analysis-engine/src/regression.rs`).
- **Polynomial Regression**: Verified on shifted high-magnitude domains ($x \in [1000, 1040]$) where naive uncentered Vandermonde normal equations fail due to ill-conditioning, confirming exact recovery via domain centering ($u = (x - \mu_x)/s_x$), SVD solve, and binomial Jacobian transformation.
- **Nonlinear Curve Fitting (Levenberg-Marquardt)**:
  - **Gaussian Peak**: Verified automatic initial parameter estimation and convergence to machine tolerance on synthetic spectroscopy peaks.
  - **Lorentzian Peak**: Verified convergence and parameter standard error estimation.
  - **Exponential Decay**: Verified log-linear initial guess estimation and convergence.

## 2. Data Integrity & Persistence Tests (`crates/data-engine` & `crates/project-engine`)

- Delimited import/export round-tripping with missing values (`NA`, `NaN`, empty cells), comment lines (`#`), and physical unit headers (`[nm]`, `[AU]`).
- `.spsproj` ZIP container atomic save/load round-trips (`crates/project-engine/src/lib.rs`) and end-to-end MVP workflow (`crates/project-engine/tests/mvp_workflow.rs`).
- Reactive invalidation and recalculation of dependent curve fits when spreadsheet cells are edited.

## 3. Frontend Adapter & Store Tests (`src/`)

- Vitest suite (`npm test`) verifies `echartsAdapter.ts` coordinate filtering (including non-positive value filtering on logarithmic scales and error bar extraction) and `useWorkspaceStore.ts` end-to-end state flows.
