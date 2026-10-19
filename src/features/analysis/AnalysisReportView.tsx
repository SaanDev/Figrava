import React, { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  CheckCircle2,
  AlertTriangle,
  Download,
  FileText,
  PlusCircle,
  Copy,
} from "lucide-react";
import { tauriClient } from "../../services/tauriClient";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import {
  DesktopContextMenu,
  type ContextMenuEntry,
} from "../../components/DesktopContextMenu";
import type { AnalysisResult, PlotDocument } from "../../types/scientific";

interface AnalysisReportViewProps {
  analysis: AnalysisResult;
  plots: PlotDocument[];
}

export const AnalysisReportView: React.FC<AnalysisReportViewProps> = ({
  analysis,
  plots,
}) => {
  const { theme, updatePlot, openTab, setStatus } = useWorkspaceStore();
  const residualChartRef = useRef<HTMLDivElement | null>(null);
  const fitChartRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title: string;
    items: ContextMenuEntry[];
  } | null>(null);

  useEffect(() => {
    const fitEl = fitChartRef.current;
    const resEl = residualChartRef.current;
    if (!fitEl || !resEl) return;

    const isDark = theme === "dark";
    const textColor = isDark ? "#E2E8F0" : "#0F172A";
    const gridColor = isDark
      ? "rgba(148,163,184,0.15)"
      : "rgba(15,23,42,0.08)";

    const fitInstance = echarts.init(fitEl, undefined, { renderer: "svg" });
    const resInstance = echarts.init(resEl, undefined, { renderer: "svg" });

    const obsPairs = analysis.obs_x.map((x, i) => [x, analysis.obs_y[i]]);
    const curvePairs = analysis.curve_x.map((x, i) => [x, analysis.curve_y[i]]);
    const resPairs = analysis.obs_x.map((x, i) => [x, analysis.residuals[i]]);

    fitInstance.setOption({
      backgroundColor: "transparent",
      animation: false,
      title: {
        text: "Observed Data vs. Fitted Model",
        left: "center",
        top: 6,
        textStyle: { fontSize: 12, fontWeight: 600, color: textColor },
      },
      tooltip: { trigger: "axis" },
      grid: { top: 36, right: 24, bottom: 36, left: 56 },
      xAxis: {
        type: "value",
        name: "X",
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        name: "Y",
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: "Observed",
          type: "scatter",
          data: obsPairs,
          symbolSize: 6,
          itemStyle: { color: "#0072B2" },
        },
        {
          name: "Fitted Curve",
          type: "line",
          data: curvePairs,
          showSymbol: false,
          lineStyle: { color: "#D55E00", width: 2.2 },
        },
      ],
    });

    resInstance.setOption({
      backgroundColor: "transparent",
      animation: false,
      title: {
        text: "Residuals (y_obs - y_fit)",
        left: "center",
        top: 6,
        textStyle: { fontSize: 12, fontWeight: 600, color: textColor },
      },
      tooltip: { trigger: "axis" },
      grid: { top: 36, right: 24, bottom: 36, left: 56 },
      xAxis: {
        type: "value",
        name: "X",
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      yAxis: {
        type: "value",
        name: "Residual",
        axisLabel: { color: textColor, fontSize: 10 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      series: [
        {
          name: "Residual",
          type: "scatter",
          data: resPairs,
          symbolSize: 6,
          itemStyle: { color: "#009E73" },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#64748B", type: "dashed", width: 1.2 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    });

    const obs = new ResizeObserver(() => {
      fitInstance.resize();
      resInstance.resize();
    });
    obs.observe(fitEl);
    obs.observe(resEl);

    return () => {
      obs.disconnect();
      fitInstance.dispose();
      resInstance.dispose();
    };
  }, [analysis, theme]);

  const handleAddCurveToPlot = async (plot: PlotDocument) => {
    const next = structuredClone(plot);
    const alreadyExists = next.layers.some(
      (l) =>
        l.source.source_type === "analysis_output" &&
        l.source.analysis_id === analysis.id
    );
    if (!alreadyExists) {
      next.layers.push({
        id: `layer-fit-${Date.now()}`,
        label: `${analysis.name}`,
        visible: true,
        plot_type: "line",
        source: {
          source_type: "analysis_output",
          analysis_id: analysis.id,
          dataset_id: analysis.config.dataset_id,
          curve_kind: "fitted_curve",
        },
        style: {
          color: "#D55E00",
          line_width: 2.4,
          line_style: "solid",
          symbol_shape: "none",
          symbol_size: 0,
          symbol_filled: true,
          opacity: 1.0,
          show_error_bars: false,
          error_bar_cap_width: 6,
          error_bar_line_width: 1.25,
        },
        panel_id: next.panels[0].id,
      });
      await updatePlot(next);
    }
    openTab(next.id, "plot", next.name);
    setStatus(`Added fitted curve "${analysis.name}" to "${next.name}"`, "success");
  };

  const handleExportResidualsCsv = async () => {
    const lines = [
      `# Analysis Report: ${analysis.name}`,
      `# Model: ${analysis.formula_template}`,
      `# Fitted Equation: ${analysis.fitted_equation}`,
      `# R^2 = ${analysis.diagnostics.r_squared}, Adj R^2 = ${analysis.diagnostics.adj_r_squared}, RMSE = ${analysis.diagnostics.rmse}`,
      "X,Observed_Y,Fitted_Y,Residual,Standardized_Residual",
    ];
    for (let i = 0; i < analysis.obs_x.length; i++) {
      lines.push(
        `${analysis.obs_x[i]},${analysis.obs_y[i]},${analysis.fitted_y[i]},${analysis.residuals[i]},${analysis.standardized_residuals[i]}`
      );
    }
    const bytes = new TextEncoder().encode(lines.join("\n"));
    const safeName =
      analysis.name.replace(/[^a-zA-Z0-9 _.-]+/g, "_").trim() || "analysis";
    try {
      const savedPath = await tauriClient.saveFileWithDialog(
        `${safeName}_residuals.csv`,
        "CSV Report & Residuals (*.csv)",
        ["csv"],
        bytes,
        "Save Analysis Report & Residuals CSV"
      );
      if (!savedPath) {
        setStatus("Report CSV export cancelled", "info");
        return;
      }
      setStatus(`Saved fit report & residuals CSV to "${savedPath}"`, "success");
    } catch (err) {
      setStatus(`Report CSV export failed: ${String(err)}`, "error");
    }
  };

  const handleExportMarkdownReport = async () => {
    const { diagnostics } = analysis;
    const paramLines = analysis.parameters.map(
      (p) =>
        `| ${p.name} | ${p.value.toPrecision(6)} | ±${p.std_error.toPrecision(4)} | ${p.t_value.toFixed(3)} | ${p.p_value.toExponential(3)} | [${p.ci_lower_95.toPrecision(5)}, ${p.ci_upper_95.toPrecision(5)}] |`
    );
    const md = [
      `# Scientific Analysis Report: ${analysis.name}`,
      ``,
      `- **Model Formula**: \`${analysis.formula_template}\``,
      `- **Fitted Equation**: \`${analysis.fitted_equation}\``,
      `- **Convergence**: ${diagnostics.converged ? "Converged" : "Non-Converged"} (${diagnostics.iterations} iterations)`,
      ``,
      `## Parameter Estimates (95% CI)`,
      ``,
      `| Parameter | Estimate | Std. Error | t-Statistic | p-Value | 95% Confidence Interval |`,
      `| :--- | ---: | ---: | ---: | ---: | :--- |`,
      ...paramLines,
      ``,
      `## Goodness-of-Fit Diagnostics`,
      ``,
      `- **Observations (N)**: ${diagnostics.observations} (Dropped Missing: ${diagnostics.dropped_missing})`,
      `- **Degrees of Freedom (DOF)**: ${diagnostics.degrees_of_freedom}`,
      `- **R²**: ${diagnostics.r_squared.toFixed(6)}`,
      `- **Adjusted R²**: ${diagnostics.adj_r_squared.toFixed(6)}`,
      `- **RMSE**: ${diagnostics.rmse.toPrecision(6)}`,
      `- **Residual Std. Error**: ${diagnostics.residual_std_error.toPrecision(6)}`,
      `- **RSS**: ${diagnostics.rss.toPrecision(6)}`,
      `- **AIC**: ${diagnostics.aic.toFixed(3)}`,
      ``,
    ].join("\n");

    const bytes = new TextEncoder().encode(md);
    const safeName =
      analysis.name.replace(/[^a-zA-Z0-9 _.-]+/g, "_").trim() || "analysis";
    try {
      const savedPath = await tauriClient.saveFileWithDialog(
        `${safeName}_report.md`,
        "Markdown Report (*.md)",
        ["md", "txt"],
        bytes,
        "Save Analysis Summary Report"
      );
      if (!savedPath) {
        setStatus("Report export cancelled", "info");
        return;
      }
      setStatus(`Saved analysis report to "${savedPath}"`, "success");
    } catch (err) {
      setStatus(`Report export failed: ${String(err)}`, "error");
    }
  };

  const { diagnostics } = analysis;

  const openReportContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuEntry[] = [
      {
        id: "save-md",
        label: "Save Markdown Analysis Report (.md)...",
        icon: <FileText className="w-3.5 h-3.5 text-sky-600" />,
        action: () => void handleExportMarkdownReport(),
      },
      {
        id: "save-csv",
        label: "Save Residuals & Fit Table (.csv)...",
        icon: <Download className="w-3.5 h-3.5 text-emerald-600" />,
        action: () => void handleExportResidualsCsv(),
      },
      {
        id: "copy-eq",
        label: "Copy Fitted Equation to Clipboard",
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () => {
          if (navigator.clipboard) {
            void navigator.clipboard.writeText(analysis.fitted_equation);
            setStatus("Copied fitted equation to clipboard", "info");
          }
        },
      },
    ];

    if (plots.length > 0) {
      items.push(
        { id: "div-overlay", divider: true },
        {
          id: "overlay-plot",
          label: `Overlay Fitted Curve on "${plots[0].name}"`,
          icon: <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />,
          action: () => void handleAddCurveToPlot(plots[0]),
        }
      );
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: `Analysis Report: ${analysis.name}`,
      items,
    });
  };

  return (
    <div
      onContextMenu={openReportContextMenu}
      className="h-full overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950 text-xs"
    >
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {analysis.name}
            </h2>
            {diagnostics.converged ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                Converged ({diagnostics.iterations} iter)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="w-3 h-3" />
                Non-Converged ({diagnostics.iterations} iter)
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-xs text-sky-700 dark:text-sky-300">
            {analysis.fitted_equation}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {plots.length > 0 && (
            <button
              type="button"
              onClick={() => handleAddCurveToPlot(plots[0])}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add Curve to "{plots[0].name}"</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportMarkdownReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-medium"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Save Report (.md)</span>
          </button>
          <button
            type="button"
            onClick={handleExportResidualsCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report & Residuals CSV</span>
          </button>
        </div>
      </div>

      {/* Warnings Banner */}
      {diagnostics.warnings.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1">
          {diagnostics.warnings.map((w, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 text-amber-800 dark:text-amber-200"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Parameter Estimates Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-200">
          Fitted Parameters & Uncertainty Estimates (DOF ={" "}
          {diagnostics.degrees_of_freedom})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                <th className="py-2 px-4">Parameter</th>
                <th className="py-2 px-4 text-right">Estimate</th>
                <th className="py-2 px-4 text-right">Std. Error</th>
                <th className="py-2 px-4 text-right">t-Statistic</th>
                <th className="py-2 px-4 text-right">p-Value</th>
                <th className="py-2 px-4 text-right">95% CI Lower</th>
                <th className="py-2 px-4 text-right">95% CI Upper</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {analysis.parameters.map((param) => (
                <tr key={param.name}>
                  <td className="py-2 px-4 font-bold text-slate-800 dark:text-slate-100">
                    {param.name}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-800 dark:text-slate-200">
                    {param.value.toPrecision(6)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    ±{param.std_error.toPrecision(4)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    {param.t_value.toFixed(3)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    {param.p_value < 1e-4
                      ? "< 0.0001"
                      : param.p_value.toFixed(4)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    {param.ci_lower_95.toPrecision(5)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-600 dark:text-slate-400">
                    {param.ci_upper_95.toPrecision(5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Goodness-of-Fit Diagnostics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "R² (Coeff. of Det.)", value: diagnostics.r_squared.toFixed(6) },
          { label: "Adjusted R²", value: diagnostics.adj_r_squared.toFixed(6) },
          { label: "RMSE", value: diagnostics.rmse.toPrecision(5) },
          { label: "Residual Sum of Sq (RSS)", value: diagnostics.rss.toPrecision(5) },
          {
            label: "Reduced Chi-Square (χ²_ν)",
            value:
              diagnostics.reduced_chi_square !== null
                ? diagnostics.reduced_chi_square.toFixed(4)
                : "N/A (Unweighted)",
          },
          {
            label: "Observations (N / DOF)",
            value: `${diagnostics.observations} / ${diagnostics.degrees_of_freedom}`,
          },
          {
            label: "Akaike Info Crit. (AIC)",
            value: Number.isFinite(diagnostics.aic)
              ? diagnostics.aic.toFixed(2)
              : "—",
          },
          {
            label: "Condition Number",
            value: diagnostics.condition_number.toExponential(2),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3"
          >
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {stat.label}
            </div>
            <div className="mt-1 text-sm font-bold font-mono text-slate-800 dark:text-slate-100">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Dual Diagnostic Plots: Fit Overlay & Residual Plot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 h-72">
          <div ref={fitChartRef} className="w-full h-full" />
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 h-72">
          <div ref={residualChartRef} className="w-full h-full" />
        </div>
      </div>

      {contextMenu && (
        <DesktopContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
