# Scientific Analysis & Curve Fitting Engine (`crates/analysis-engine`)

## 1. Mathematical Methods & Numerical Stability

1. **Linear Least Squares (`fit_linear`)**:
   - Model: $y = m x + c$.
   - Uses weighted centered summation around $(\bar{x}_w, \bar{y}_w)$ with weights $w_i = 1 / \sigma_i^2$ (or $w_i = 1$ when unweighted) to prevent catastrophic cancellation on shifted domains.
2. **SVD-Stabilized Polynomial Least Squares (`fit_polynomial`)**:
   - Model: $y = \sum_{k=0}^d a_k x^k$ ($1 \le d \le 8$).
   - Centers and scales $x$ into $u = (x - \mu_x) / s_x \in [-1, 1]$, solves the weighted Vandermonde system via Singular Value Decomposition (`nalgebra::DMatrix::svd`), and transforms both coefficients $\tilde{a}$ and the covariance matrix $\Sigma_{\tilde{a}}$ back to the original $x$ basis via the exact upper-triangular binomial Jacobian $T_{j,k} = \binom{k}{j} (-\mu_x)^{k-j} / s_x^k$.
3. **Levenberg-Marquardt Nonlinear Least Squares (`fit_nonlinear`)**:
   - Models:
     - **Exponential**: $y = A \exp(B x) + C$
     - **Gaussian**: $y = A \exp(-(x - \mu)^2 / (2 \sigma^2)) + C$
     - **Lorentzian**: $y = A \gamma^2 / ((x - x_0)^2 + \gamma^2) + C$
   - Uses analytical Jacobians, adaptive Marquardt diagonal damping, parameter bounds clamping, and SVD pseudo-inverse covariance estimation $(J^T W J)^{-1}$ at convergence.

## 2. Statistical Diagnostics & Assumptions

- Standard errors and 95% confidence intervals are computed using Student's $t$-distribution with $\nu = N - p$ degrees of freedom under the assumption of independent, Gaussian-distributed residuals.
- Reduced chi-square ($\chi^2_\nu$) is reported only when explicit measurement uncertainties ($\sigma_y > 0$) are supplied.
- Optimizer convergence is separated from statistical goodness-of-fit: converged fits with low $R^2$ or high condition numbers emit explicit diagnostic warnings.
