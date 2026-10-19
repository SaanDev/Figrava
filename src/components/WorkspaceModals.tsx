import React, { useEffect, useMemo, useState } from "react";
import { X, Upload, Sparkles, Play, Download } from "lucide-react";
import { useWorkspaceStore } from "../stores/useWorkspaceStore";
import { tauriClient } from "../services/tauriClient";
import type {
  AnovaResult,
  ColumnRole,
  ColumnTransform,
  DescriptiveStats,
  DetectedPeak,
  FftSpectrumResult,
  FitModelKind,
  IntegrationResult,
  PlotType,
  TTestResult,
  WindowFunction,
} from "../types/scientific";

const SAMPLE_CSV_FIXTURES: Record<string, { name: string; content: string }> = {
  spectroscopy: {
    name: "photoluminescence_spectrum.csv",
    content: `# Photoluminescence Emission Spectrum of GaN Quantum Dots
Wavelength [nm],Sample A Intensity [counts],Sample A Sigma [counts],Reference Sample B [counts]
450.0,124.5,11.2,98.4
470.0,145.8,12.1,112.6
490.0,242.1,15.6,164.5
510.0,496.3,22.3,296.4
530.0,836.2,28.9,501.2
545.0,972.4,31.2,638.1
560.0,842.6,29.0,708.4
580.0,501.8,22.4,651.3
600.0,245.0,15.7,456.2
620.0,147.2,12.1,256.4
650.0,121.8,11.0,113.5`,
  },
  calibration: {
    name: "beer_lambert_calibration.csv",
    content: `# UV-Vis Spectrophotometric Calibration Curve
Concentration [uM],Absorbance 280nm [AU],Absorbance Error [AU],Absorbance 310nm [AU]
0.0,0.016,0.008,0.011
10.0,0.264,0.011,0.189
20.0,0.508,0.014,0.368
30.0,0.753,0.016,0.542
40.0,0.998,0.019,0.721
50.0,1.242,0.022,0.899`,
  },
  decay: {
    name: "fluorescence_decay.tsv",
    content: `# Time-Resolved Photoluminescence Decay (TCSPC)
Time [ns]\tPhoton Counts [counts]\tUncertainty [counts]
0.0\t1024.0\t32.0
2.0\t573.8\t24.0
4.0\t329.5\t18.2
6.0\t196.8\t14.0
8.0\t124.3\t11.1
10.0\t84.9\t9.2
14.0\t51.7\t7.2
18.0\t41.8\t6.5`,
  },
};

export const WorkspaceModals: React.FC = () => {
  const {
    snapshot,
    activeTabId,
    activeModal,
    setActiveModal,
    selectedPlotColumnIds,
    setSelectedPlotColumnIds,
    importDelimited,
    importExcel,
    createPlot,
    executeCurveFit,
    mutateDataset,
    setStatus,
  } = useWorkspaceStore();

  // Import CSV / XLSX state
  const [csvContent, setCsvContent] = useState(
    SAMPLE_CSV_FIXTURES.calibration.content
  );
  const [csvFileName, setCsvFileName] = useState(
    SAMPLE_CSV_FIXTURES.calibration.name
  );
  const [delimiterOpt, setDelimiterOpt] = useState<string>("auto");
  const [headerOpt, setHeaderOpt] = useState<string>("auto");
  const [importColRoles, setImportColRoles] = useState<
    Record<number, ColumnRole>
  >({});
  const [importColSelected, setImportColSelected] = useState<
    Record<number, boolean>
  >({});
  const [importPlotType, setImportPlotType] = useState<PlotType>("scatter");

  // New Plot state
  const [plotName, setPlotName] = useState("Scientific Figure");
  const [plotDsId, setPlotDsId] = useState("");
  const [plotXColId, setPlotXColId] = useState("");
  const [plotYColId, setPlotYColId] = useState("");
  const [plotSelectedYColIds, setPlotSelectedYColIds] = useState<string[]>([]);
  const [plotZColId, setPlotZColId] = useState("");
  const [plotYErrColId, setPlotYErrColId] = useState("");
  const [plotType, setPlotType] = useState<PlotType>("scatter");

  // Parse live preview of columns in Import Modal (OriginPro style)
  const previewColumns = useMemo(() => {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    if (lines.length === 0) return [];

    const firstLine = lines[0];
    const delim =
      delimiterOpt !== "auto"
        ? delimiterOpt
        : firstLine.includes("\t")
        ? "\t"
        : firstLine.includes(";")
        ? ";"
        : firstLine.includes(",")
        ? ","
        : " ";

    const splitLine = (line: string) =>
      delim === " "
        ? line.split(/\s+/).filter(Boolean)
        : line.split(delim).map((s) => s.trim());

    const rows = lines.slice(0, 8).map(splitLine);
    const hasHeader =
      headerOpt === "yes"
        ? true
        : headerOpt === "no"
        ? false
        : rows[0]?.some((tok) => tok.length > 0 && !Number.isFinite(Number(tok)));

    const headerRow = hasHeader ? rows[0] : null;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const colCount = Math.max(0, ...rows.map((r) => r.length));

    return Array.from({ length: colCount }, (_, idx) => {
      const rawHeader = headerRow?.[idx] || `Col${idx + 1}`;
      const match = rawHeader.match(/^(.*?)\s*\[(.*?)\]$/);
      const name = match ? match[1].trim() : rawHeader;
      const unit = match ? match[2].trim() : null;
      const lower = name.trim().toLowerCase();
      const inferredRole: ColumnRole =
        idx === 0
          ? "x"
          : /err|sigma|sd|unc/i.test(name)
          ? "y_error"
          : lower === "z" || lower.startsWith("z_") || lower.startsWith("z ")
          ? "z"
          : "y";
      const role = importColRoles[idx] ?? inferredRole;
      const selected =
        importColSelected[idx] ??
        (role === "x" || role === "y" || role === "z" || role === "y_error");
      const sampleValues = dataRows
        .slice(0, 3)
        .map((r) => r[idx] ?? "")
        .filter(Boolean);
      const colLetter = String.fromCharCode(65 + (idx % 26));
      return {
        idx,
        colLetter,
        name,
        unit,
        role,
        selected,
        sampleValues,
      };
    });
  }, [csvContent, delimiterOpt, headerOpt, importColRoles, importColSelected]);

  // Curve Fit state
  const [fitName, setFitName] = useState("");
  const [fitDsId, setFitDsId] = useState("");
  const [fitXColId, setFitXColId] = useState("");
  const [fitYColId, setFitYColId] = useState("");
  const [fitYErrColId, setFitYErrColId] = useState("");
  const [fitUseWeights, setFitUseWeights] = useState(true);
  const [fitModelType, setFitModelType] = useState<
    | "linear"
    | "polynomial"
    | "gaussian"
    | "lorentzian"
    | "exponential"
    | "multi_gaussian"
    | "multi_lorentzian"
    | "custom_equation"
  >("linear");
  const [polyDegree, setPolyDegree] = useState(2);
  const [multiPeaksCount, setMultiPeaksCount] = useState(2);
  const [customExpr, setCustomExpr] = useState("A * exp(-k * x) + C");
  const [customParamNames, setCustomParamNames] = useState("A, k, C");
  const [fitTargetPlotId, setFitTargetPlotId] = useState("");
  const [initialParamsText, setInitialParamsText] = useState("");

  // Transform Column state
  const [transDsId, setTransDsId] = useState("");
  const [transColId, setTransColId] = useState("");
  const [transXColId, setTransXColId] = useState("");
  const [transKind, setTransKind] = useState<
    | "scale_offset"
    | "log10"
    | "ln"
    | "normalize_min_max"
    | "standardize_z_score"
    | "first_derivative"
    | "cumulative_integral"
    | "moving_average"
    | "savitzky_golay_5"
    | "baseline_subtract_linear"
  >("normalize_min_max");
  const [scaleVal, setScaleVal] = useState(1.0);
  const [offsetVal, setOffsetVal] = useState(0.0);
  const [maWindow, setMaWindow] = useState(5);
  const [transResultName, setTransResultName] = useState("");

  // Statistics summary state
  const [allColStats, setAllColStats] = useState<
    { colName: string; unit: string | null; stats: DescriptiveStats }[]
  >([]);

  // Signal Processing & Numerical state
  const [sigTab, setSigTab] = useState<"peaks" | "fft" | "filter" | "integrate">(
    "peaks"
  );
  const [sigDsId, setSigDsId] = useState("");
  const [sigXColId, setSigXColId] = useState("");
  const [sigYColId, setSigYColId] = useState("");
  const [peakProminence, setPeakProminence] = useState(10.0);
  const [peakMinDist, setPeakMinDist] = useState(2);
  const [detectedPeaks, setDetectedPeaks] = useState<DetectedPeak[] | null>(
    null
  );
  const [fftWindow, setFftWindow] = useState<WindowFunction>("hann");
  const [fftResult, setFftResult] = useState<FftSpectrumResult | null>(null);
  const [filterKind, setFilterKind] = useState<"low_pass" | "high_pass">(
    "low_pass"
  );
  const [filterCutoff, setFilterCutoff] = useState(0.05);
  const [integrationResult, setIntegrationResult] =
    useState<IntegrationResult | null>(null);

  // Hypothesis Testing state
  const [hypTab, setHypTab] = useState<"ttest" | "anova">("ttest");
  const [hypDsId, setHypDsId] = useState("");
  const [hypColA, setHypColA] = useState("");
  const [hypColB, setHypColB] = useState("");
  const [hypTKind, setHypTKind] = useState<
    "one_sample" | "two_sample_student" | "two_sample_welch"
  >("two_sample_welch");
  const [hypMu0, setHypMu0] = useState(0.0);
  const [tTestResult, setTTestResult] = useState<TTestResult | null>(null);
  const [anovaResult, setAnovaResult] = useState<AnovaResult | null>(null);

  // Workflows state
  const [wfName, setWfName] = useState(
    "Baseline + Savitzky-Golay + Linear Fit Pipeline"
  );

  useEffect(() => {
    if (!snapshot) return;
    const activeWs = snapshot.project.worksheets.find(
      (w) => w.id === activeTabId
    );
    const ds =
      (activeWs
        ? snapshot.project.datasets.find((d) => d.id === activeWs.dataset_id)
        : undefined) ??
      snapshot.project.datasets[snapshot.project.datasets.length - 1] ??
      snapshot.project.datasets[0];
    if (!ds) return;

    const dsColIds = new Set(ds.columns.map((c) => c.id));
    const preselectedIds = selectedPlotColumnIds.filter((id) =>
      dsColIds.has(id)
    );

    const xCol =
      ds.columns.find((c) => preselectedIds.includes(c.id) && c.role === "x") ??
      ds.columns.find((c) => c.role === "x") ??
      ds.columns[0];
    const yCol =
      ds.columns.find(
        (c) =>
          preselectedIds.includes(c.id) && c.role === "y" && c.id !== xCol?.id
      ) ??
      ds.columns.find((c) => c.role === "y" && c.id !== xCol?.id) ??
      ds.columns[1] ??
      ds.columns[0];
    const zCol =
      ds.columns.find((c) => preselectedIds.includes(c.id) && c.role === "z") ??
      ds.columns.find((c) => c.role === "z") ??
      ds.columns.find(
        (c) =>
          c.id !== xCol?.id &&
          c.id !== yCol?.id &&
          c.role !== "x_error" &&
          c.role !== "y_error"
      );
    const errCol = ds.columns.find((c) => c.role === "y_error");

    const preselectedYCols = ds.columns
      .filter(
        (c) =>
          preselectedIds.includes(c.id) &&
          c.role === "y" &&
          c.id !== xCol?.id
      )
      .map((c) => c.id);
    const allYCols = ds.columns
      .filter((c) => c.role === "y" && c.id !== xCol?.id)
      .map((c) => c.id);

    setPlotDsId(ds.id);
    setPlotXColId(xCol?.id ?? "");
    setPlotYColId(yCol?.id ?? "");
    setPlotSelectedYColIds(
      preselectedYCols.length > 0
        ? preselectedYCols
        : allYCols.length > 0
        ? allYCols
        : yCol
        ? [yCol.id]
        : []
    );
    setPlotZColId(zCol?.id ?? "");
    setPlotYErrColId(errCol?.id ?? "");

    setFitDsId(ds.id);
    setFitXColId(xCol?.id ?? "");
    setFitYColId(yCol?.id ?? "");
    setFitYErrColId(errCol?.id ?? "");
    setFitTargetPlotId(snapshot.project.plots[0]?.id ?? "");

    setTransDsId(ds.id);
    setTransColId(yCol?.id ?? "");
    setTransXColId(xCol?.id ?? "");

    setSigDsId(ds.id);
    setSigXColId(xCol?.id ?? "");
    setSigYColId(yCol?.id ?? "");

    setHypDsId(ds.id);
    setHypColA(yCol?.id ?? "");
    setHypColB(ds.columns[3]?.id ?? ds.columns[2]?.id ?? yCol?.id ?? "");
  }, [snapshot, activeModal, activeTabId, selectedPlotColumnIds]);

  useEffect(() => {
    if (activeModal !== "column_stats" || !snapshot) return;
    const ds = snapshot.project.datasets[0];
    if (!ds) return;
    Promise.all(
      ds.columns.map(async (c) => {
        try {
          const stats = await tauriClient.computeColumnStatistics(ds.id, c.id);
          return { colName: c.name, unit: c.unit, stats };
        } catch {
          return null;
        }
      })
    ).then((items) =>
      setAllColStats(
        items.filter(
          (
            i
          ): i is {
            colName: string;
            unit: string | null;
            stats: DescriptiveStats;
          } => i !== null
        )
      )
    );
  }, [activeModal, snapshot]);

  if (!snapshot || activeModal === "none") return null;
  const { project } = snapshot;

  const currentFitModel = (): FitModelKind => {
    switch (fitModelType) {
      case "linear":
        return { model_type: "linear" };
      case "polynomial":
        return { model_type: "polynomial", degree: polyDegree };
      case "gaussian":
        return { model_type: "gaussian" };
      case "lorentzian":
        return { model_type: "lorentzian" };
      case "exponential":
        return { model_type: "exponential" };
      case "multi_gaussian":
        return { model_type: "multi_gaussian", peaks: multiPeaksCount };
      case "multi_lorentzian":
        return { model_type: "multi_lorentzian", peaks: multiPeaksCount };
      case "custom_equation":
        return {
          model_type: "custom_equation",
          expression: customExpr,
          parameters: customParamNames
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
        };
    }
  };

  const handleAutoEstimateParams = async () => {
    if (!fitDsId || !fitXColId || !fitYColId) return;
    const est = await tauriClient.estimateFitParameters(
      fitDsId,
      fitXColId,
      fitYColId,
      currentFitModel()
    );
    setInitialParamsText(est.map((v) => Number(v.toPrecision(5))).join(", "));
  };

  const handleImportDatasetWithSelections = async (plotImmediately: boolean) => {
    const snap = await importDelimited(csvContent, csvFileName, {
      delimiter: delimiterOpt === "auto" ? null : delimiterOpt,
      has_header: headerOpt === "auto" ? null : headerOpt === "yes",
      dataset_name: null,
    });
    if (!snap) return;

    const newDs = snap.project.datasets[snap.project.datasets.length - 1];
    if (!newDs) return;

    // Apply any user role overrides configured in the Import Column Table
    for (const colMeta of previewColumns) {
      const dsCol = newDs.columns[colMeta.idx];
      if (dsCol && dsCol.role !== colMeta.role) {
        await mutateDataset(newDs.id, {
          action: "set_column_role",
          col_id: dsCol.id,
          role: colMeta.role,
        });
      }
    }

    // Map selected indices to imported column IDs
    const selectedColIds = previewColumns
      .filter((c) => c.selected && newDs.columns[c.idx])
      .map((c) => newDs.columns[c.idx].id);
    setSelectedPlotColumnIds(selectedColIds);

    if (plotImmediately) {
      const xMeta =
        previewColumns.find((c) => c.selected && c.role === "x") ??
        previewColumns.find((c) => c.role === "x") ??
        previewColumns[0];
      const yMetas = previewColumns.filter(
        (c) => c.selected && c.role === "y" && c.idx !== xMeta?.idx
      );
      const zMeta = previewColumns.find(
        (c) => c.selected && c.role === "z" && c.idx !== xMeta?.idx
      );
      const errMeta = previewColumns.find(
        (c) => c.selected && c.role === "y_error"
      );

      const xCol = xMeta ? newDs.columns[xMeta.idx] : newDs.columns[0];
      const yColList =
        yMetas.length > 0
          ? yMetas
              .map((m) => newDs.columns[m.idx])
              .filter((c): c is NonNullable<typeof c> => Boolean(c))
          : [newDs.columns[1] ?? newDs.columns[0]].filter(Boolean);
      const zCol = zMeta ? newDs.columns[zMeta.idx] : undefined;
      const errCol = errMeta ? newDs.columns[errMeta.idx] : undefined;

      if (xCol && yColList.length > 0) {
        const yIds = yColList.map((c) => c.id);
        await createPlot(
          `${newDs.name} (${yIds.length > 1 ? `${yIds.length} Series` : yColList[0].name})`,
          newDs.id,
          xCol.id,
          yIds[0],
          errCol?.id ?? null,
          importPlotType,
          zCol?.id ?? null,
          yIds
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 text-xs">
      <div
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full ${
          activeModal === "about" ? "max-w-sm" : "max-w-2xl"
        } overflow-hidden max-h-[92vh] flex flex-col`}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 shrink-0">
          <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100">
            {activeModal === "import_csv" &&
              "Import Dataset & Select Columns to Plot (OriginPro Style)"}
            {activeModal === "new_plot" &&
              "Create 2D, Statistical, or 3D Scientific Graph"}
            {activeModal === "curve_fit" &&
              "Regression, Multi-Peak Deconvolution & Custom Fitting"}
            {activeModal === "transform_column" &&
              "Column Mathematical & Smoothing Transformation"}
            {activeModal === "column_stats" &&
              "Dataset Descriptive Statistics Summary"}
            {activeModal === "signal_processing" &&
              "Signal Processing, Peak Finder, FFT & Numerical Integration"}
            {activeModal === "hypothesis" &&
              "Statistical Hypothesis Testing (t-Test & One-Way ANOVA)"}
            {activeModal === "workflows" &&
              "Automated Reproducible Analysis Workflows"}
            {activeModal === "about" && "About Figrava"}
            {activeModal === "shortcuts" &&
              "Figrava v1.0 — Desktop Keyboard Shortcuts & Context Menu Guide"}
          </h2>
          <button
            type="button"
            onClick={() => setActiveModal("none")}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Import CSV/TSV/XLSX Modal */}
        {activeModal === "import_csv" && (
          <div className="p-4 space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Sample Fixtures:</span>
                {Object.entries(SAMPLE_CSV_FIXTURES).map(([key, item]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCsvFileName(item.name);
                      setCsvContent(item.content);
                      setImportColRoles({});
                      setImportColSelected({});
                    }}
                    className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950 text-sky-700 dark:text-sky-300 font-medium capitalize"
                  >
                    {key}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    const picked =
                      await tauriClient.pickDatasetFileWithDialog();
                    if (picked) {
                      if (picked.is_binary_excel && picked.binary_bytes) {
                        await importExcel(
                          new Uint8Array(picked.binary_bytes),
                          picked.file_name
                        );
                        return;
                      }
                      if (picked.text_content !== null) {
                        setCsvFileName(picked.file_name);
                        setCsvContent(picked.text_content);
                        setImportColRoles({});
                        setImportColSelected({});
                        return;
                      }
                    } else if (
                      typeof window !== "undefined" &&
                      "__TAURI_INTERNALS__" in window
                    ) {
                      return;
                    }
                    const fallbackInput = document.getElementById(
                      "fallback-dataset-file-input"
                    ) as HTMLInputElement | null;
                    fallbackInput?.click();
                  } catch (err) {
                    setStatus(`Failed to open dataset file: ${String(err)}`, "error");
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 cursor-pointer font-medium"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Browse CSV / TSV / .XLSX...</span>
              </button>
              <input
                id="fallback-dataset-file-input"
                type="file"
                accept=".csv,.tsv,.txt,.dat,.xlsx,.xls"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (
                    file.name.toLowerCase().endsWith(".xlsx") ||
                    file.name.toLowerCase().endsWith(".xls")
                  ) {
                    const buf = await file.arrayBuffer();
                    await importExcel(new Uint8Array(buf), file.name);
                    return;
                  }
                  setCsvFileName(file.name);
                  setCsvContent(await file.text());
                  setImportColRoles({});
                  setImportColSelected({});
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Dataset Name / File
                </label>
                <input
                  type="text"
                  value={csvFileName}
                  onChange={(e) => setCsvFileName(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Delimiter Detection
                </label>
                <select
                  value={delimiterOpt}
                  onChange={(e) => setDelimiterOpt(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="auto">Auto-Detect</option>
                  <option value=",">Comma (,)</option>
                  <option value="\t">Tab (\t)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value=" ">Whitespace</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Header Row
                </label>
                <select
                  value={headerOpt}
                  onChange={(e) => setHeaderOpt(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="auto">Auto-Detect</option>
                  <option value="yes">First Row is Header</option>
                  <option value="no">No Header Row</option>
                </select>
              </div>
            </div>

            {/* OriginPro-Style Column Selection & Role Assignment Table */}
            {previewColumns.length > 0 && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-[11px] text-slate-700 dark:text-slate-200">
                    Detected Columns ({previewColumns.length}) — Select Columns & Roles to Plot:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<number, boolean> = {};
                        previewColumns.forEach((c) => {
                          next[c.idx] =
                            c.role === "x" || c.role === "y" || c.role === "z";
                        });
                        setImportColSelected(next);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-sky-50"
                    >
                      Select All Y
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next: Record<number, boolean> = {};
                        let foundFirstY = false;
                        previewColumns.forEach((c) => {
                          if (c.role === "x") {
                            next[c.idx] = true;
                          } else if (c.role === "y" && !foundFirstY) {
                            next[c.idx] = true;
                            foundFirstY = true;
                          } else {
                            next[c.idx] = false;
                          }
                        });
                        setImportColSelected(next);
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-sky-50"
                    >
                      First Y Only
                    </button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <th className="py-1.5 px-2.5 w-14">Plot</th>
                        <th className="py-1.5 px-2">Col</th>
                        <th className="py-1.5 px-2">Column Name</th>
                        <th className="py-1.5 px-2">Role Designation</th>
                        <th className="py-1.5 px-2">Sample Values</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {previewColumns.map((col) => (
                        <tr
                          key={col.idx}
                          className={
                            col.selected
                              ? "bg-sky-50/40 dark:bg-sky-950/20"
                              : "opacity-60"
                          }
                        >
                          <td className="py-1.5 px-2.5">
                            <input
                              type="checkbox"
                              checked={col.selected}
                              onChange={(e) =>
                                setImportColSelected((prev) => ({
                                  ...prev,
                                  [col.idx]: e.target.checked,
                                }))
                              }
                              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-1.5 px-2 font-mono font-bold text-slate-600 dark:text-slate-300">
                            {col.colLetter}({col.role.toUpperCase()})
                          </td>
                          <td className="py-1.5 px-2 font-medium text-slate-800 dark:text-slate-100">
                            {col.name}{" "}
                            {col.unit && (
                              <span className="text-slate-400 font-normal">
                                [{col.unit}]
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2">
                            <select
                              value={col.role}
                              onChange={(e) =>
                                setImportColRoles((prev) => ({
                                  ...prev,
                                  [col.idx]: e.target.value as ColumnRole,
                                }))
                              }
                              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-[10px]"
                            >
                              <option value="x">[X] Predictor</option>
                              <option value="y">[Y] Response</option>
                              <option value="z">[Z] 3D / Matrix</option>
                              <option value="y_error">[yErr] Y Error</option>
                              <option value="x_error">[xErr] X Error</option>
                              <option value="label">[Label]</option>
                              <option value="none">[Disregard]</option>
                            </select>
                          </td>
                          <td className="py-1.5 px-2 font-mono text-slate-500 truncate max-w-[160px]">
                            {col.sampleValues.join(", ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                Raw Delimited Data Preview / Editor
              </label>
              <textarea
                rows={5}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-[11px]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Plot Type:</span>
                <select
                  value={importPlotType}
                  onChange={(e) =>
                    setImportPlotType(e.target.value as PlotType)
                  }
                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium text-[11px]"
                >
                  <option value="scatter">XY Scatter Plot</option>
                  <option value="line">XY Line Plot</option>
                  <option value="line_symbols">Line + Symbols</option>
                  <option value="area">Filled Area Plot</option>
                  <option value="bar">Column / Bar Plot</option>
                  <option value="surface_3d">3D Surface Mesh</option>
                  <option value="scatter_3d">3D XYZ Scatter</option>
                  <option value="line_3d">3D Trajectory Line</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal("none")}
                  className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleImportDatasetWithSelections(false)}
                  className="px-3 py-1.5 rounded border border-sky-600 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950 font-semibold"
                >
                  Import to Worksheet
                </button>
                <button
                  type="button"
                  onClick={() => handleImportDatasetWithSelections(true)}
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                >
                  Import & Plot Selected Columns
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Create Graph Modal */}
        {activeModal === "new_plot" && (
          <div className="p-4 space-y-3 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Graph Title
                </label>
                <input
                  type="text"
                  value={plotName}
                  onChange={(e) => setPlotName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Plot Type
                </label>
                <select
                  value={plotType}
                  onChange={(e) => setPlotType(e.target.value as PlotType)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <optgroup label="2D Cartesian Plots">
                    <option value="scatter">XY Scatter Plot</option>
                    <option value="line">XY Line Plot</option>
                    <option value="line_symbols">Line + Symbols</option>
                    <option value="area">Filled Area Plot</option>
                    <option value="bar">Column / Bar Plot</option>
                    <option value="stacked_bar">Stacked Bar Plot</option>
                    <option value="stacked_area">Stacked Area Plot</option>
                  </optgroup>
                  <optgroup label="Statistical & Specialized">
                    <option value="histogram">Histogram Distribution</option>
                    <option value="box_plot">Box-and-Whisker Plot</option>
                    <option value="violin">Violin Density Plot</option>
                    <option value="heatmap">2D Heatmap Matrix</option>
                    <option value="contour">Contour Isolines</option>
                    <option value="polar">Polar Coordinate Plot</option>
                  </optgroup>
                  <optgroup label="3D & Matrix Visualization">
                    <option value="surface_3d">3D Surface Mesh</option>
                    <option value="wireframe_3d">3D Wireframe Grid</option>
                    <option value="scatter_3d">3D XYZ Scatter</option>
                    <option value="line_3d">3D Trajectory Line</option>
                    <option value="waterfall">3D Waterfall Spectra</option>
                    <option value="vector_field">2D Vector Quiver Field</option>
                  </optgroup>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">
                Source Dataset
              </label>
              <select
                value={plotDsId}
                onChange={(e) => {
                  const id = e.target.value;
                  setPlotDsId(id);
                  const ds = project.datasets.find((d) => d.id === id);
                  if (ds) {
                    const xCol = ds.columns.find((c) => c.role === "x") ?? ds.columns[0];
                    const yCol =
                      ds.columns.find((c) => c.role === "y" && c.id !== xCol?.id) ??
                      ds.columns[1] ??
                      ds.columns[0];
                    const zCol =
                      ds.columns.find((c) => c.role === "z") ??
                      ds.columns.find(
                        (c) =>
                          c.id !== xCol?.id &&
                          c.id !== yCol?.id &&
                          c.role !== "x_error" &&
                          c.role !== "y_error"
                      );
                    const yCols = ds.columns
                      .filter((c) => c.role === "y" && c.id !== xCol?.id)
                      .map((c) => c.id);
                    setPlotXColId(xCol?.id ?? "");
                    setPlotYColId(yCol?.id ?? "");
                    setPlotSelectedYColIds(
                      yCols.length > 0 ? yCols : yCol ? [yCol.id] : []
                    );
                    setPlotZColId(zCol?.id ?? "");
                  }
                }}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                {project.datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.columns.length} columns)
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const ds =
                project.datasets.find((d) => d.id === plotDsId) ??
                project.datasets[0];
              if (!ds) return null;
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        X Axis Column
                      </label>
                      <select
                        value={plotXColId}
                        onChange={(e) => setPlotXColId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c, idx) => (
                          <option key={c.id} value={c.id}>
                            {String.fromCharCode(65 + (idx % 26))}({c.role.toUpperCase()}): {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Z Column (3D / Matrix)
                      </label>
                      <select
                        value={plotZColId}
                        onChange={(e) => setPlotZColId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="">None</option>
                        {ds.columns.map((c, idx) => (
                          <option key={c.id} value={c.id}>
                            {String.fromCharCode(65 + (idx % 26))}({c.role.toUpperCase()}): {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Y Error Bars
                      </label>
                      <select
                        value={plotYErrColId}
                        onChange={(e) => setPlotYErrColId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="">Auto-Pair / None</option>
                        {ds.columns.map((c, idx) => (
                          <option key={c.id} value={c.id}>
                            {String.fromCharCode(65 + (idx % 26))}({c.role.toUpperCase()}): {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* OriginPro Multi-Column Y Selection Checklist */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                      <span className="font-semibold text-[11px] text-slate-700 dark:text-slate-200">
                        Select Y Column(s) to Plot ({plotSelectedYColIds.length} selected):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const allY = ds.columns
                              .filter(
                                (c) => c.id !== plotXColId && c.role === "y"
                              )
                              .map((c) => c.id);
                            setPlotSelectedYColIds(
                              allY.length > 0
                                ? allY
                                : ds.columns
                                    .filter((c) => c.id !== plotXColId)
                                    .map((c) => c.id)
                            );
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-sky-50"
                        >
                          Select All Y
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const firstY =
                              ds.columns.find(
                                (c) => c.id !== plotXColId && c.role === "y"
                              ) ??
                              ds.columns.find((c) => c.id !== plotXColId) ??
                              ds.columns[0];
                            if (firstY) {
                              setPlotSelectedYColIds([firstY.id]);
                              setPlotYColId(firstY.id);
                            }
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-sky-50"
                        >
                          1st Y Only
                        </button>
                      </div>
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {ds.columns.map((col, idx) => {
                        const colLetter = String.fromCharCode(65 + (idx % 26));
                        const isChecked = plotSelectedYColIds.includes(col.id);
                        const isX = col.id === plotXColId;
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center justify-between px-3 py-1.5 cursor-pointer ${
                              isChecked
                                ? "bg-sky-50/60 dark:bg-sky-950/30"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const next = [
                                      ...plotSelectedYColIds,
                                      col.id,
                                    ];
                                    setPlotSelectedYColIds(next);
                                    setPlotYColId(next[0]);
                                  } else {
                                    const next = plotSelectedYColIds.filter(
                                      (id) => id !== col.id
                                    );
                                    setPlotSelectedYColIds(next);
                                    if (next[0]) setPlotYColId(next[0]);
                                  }
                                }}
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                              />
                              <span className="font-mono font-bold text-[11px] text-slate-500">
                                {colLetter}({col.role.toUpperCase()})
                              </span>
                              <span className="font-medium text-slate-800 dark:text-slate-100">
                                {col.name}
                              </span>
                              {col.unit && (
                                <span className="text-slate-400">
                                  [{col.unit}]
                                </span>
                              )}
                            </div>
                            {isX && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-semibold">
                                Active X Axis
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()}

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setActiveModal("none")}
                className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const yIds =
                    plotSelectedYColIds.length > 0
                      ? plotSelectedYColIds
                      : plotYColId
                      ? [plotYColId]
                      : [];
                  createPlot(
                    plotName,
                    plotDsId,
                    plotXColId,
                    yIds[0] ?? plotYColId,
                    plotYErrColId || null,
                    plotType,
                    plotZColId || null,
                    yIds
                  );
                }}
                className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold"
              >
                Create Graph ({plotSelectedYColIds.length || 1} Series)
              </button>
            </div>
          </div>
        )}

        {/* 3. Curve Fitting Modal */}
        {activeModal === "curve_fit" && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5">
                  Mathematical Model
                </label>
                <select
                  value={fitModelType}
                  onChange={(e) => {
                    setFitModelType(e.target.value as typeof fitModelType);
                    setInitialParamsText("");
                  }}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="linear">Linear Regression (y = m·x + c)</option>
                  <option value="polynomial">
                    Polynomial Least Squares (SVD-Stabilized)
                  </option>
                  <option value="gaussian">
                    Single Gaussian Peak (A·exp(-(x-μ)²/(2σ²)) + C)
                  </option>
                  <option value="lorentzian">
                    Single Lorentzian Peak (A·γ²/((x-x₀)²+γ²) + C)
                  </option>
                  <option value="exponential">
                    Exponential (y = A·exp(B·x) + C)
                  </option>
                  <option value="multi_gaussian">
                    Multi-Peak Gaussian Deconvolution (N Peaks)
                  </option>
                  <option value="multi_lorentzian">
                    Multi-Peak Lorentzian Deconvolution (N Peaks)
                  </option>
                  <option value="custom_equation">
                    User-Defined Custom Equation y = f(x; p₁, p₂, ...)
                  </option>
                </select>
              </div>

              {fitModelType === "polynomial" ? (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Polynomial Degree (1–8)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={polyDegree}
                    onChange={(e) =>
                      setPolyDegree(
                        Math.max(1, Math.min(8, Number(e.target.value) || 2))
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              ) : fitModelType === "multi_gaussian" ||
                fitModelType === "multi_lorentzian" ? (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Number of Overlapping Peaks (1–5)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={multiPeaksCount}
                    onChange={(e) =>
                      setMultiPeaksCount(
                        Math.max(1, Math.min(5, Number(e.target.value) || 2))
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Analysis Result Name
                  </label>
                  <input
                    type="text"
                    value={fitName}
                    placeholder="Auto-named from model"
                    onChange={(e) => setFitName(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              )}
            </div>

            {fitModelType === "custom_equation" && (
              <div className="grid grid-cols-2 gap-3 bg-indigo-50/60 dark:bg-indigo-950/30 p-2.5 rounded border border-indigo-200 dark:border-indigo-800">
                <div>
                  <label className="block text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">
                    Mathematical Expression f(x)
                  </label>
                  <input
                    type="text"
                    value={customExpr}
                    onChange={(e) => setCustomExpr(e.target.value)}
                    placeholder="A * exp(-k * x) + C"
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">
                    Fit Parameter Names (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={customParamNames}
                    onChange={(e) => setCustomParamNames(e.target.value)}
                    placeholder="A, k, C"
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>
            )}

            {(() => {
              const ds =
                project.datasets.find((d) => d.id === fitDsId) ??
                project.datasets[0];
              if (!ds) return null;
              return (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Source Dataset
                      </label>
                      <select
                        value={fitDsId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setFitDsId(id);
                          const nextDs = project.datasets.find(
                            (d) => d.id === id
                          );
                          if (nextDs) {
                            setFitXColId(nextDs.columns[0]?.id ?? "");
                            setFitYColId(
                              nextDs.columns[1]?.id ??
                                nextDs.columns[0]?.id ??
                                ""
                            );
                          }
                        }}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {project.datasets.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Overlay Fitted Curve on Graph
                      </label>
                      <select
                        value={fitTargetPlotId}
                        onChange={(e) => setFitTargetPlotId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="">Open Analysis Report Only</option>
                        {project.plots.map((p) => (
                          <option key={p.id} value={p.id}>
                            Add to "{p.name}"
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Predictor (X)
                      </label>
                      <select
                        value={fitXColId}
                        onChange={(e) => setFitXColId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Response (Y)
                      </label>
                      <select
                        value={fitYColId}
                        onChange={(e) => setFitYColId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Uncertainty (σ_y)
                      </label>
                      <select
                        value={fitYErrColId}
                        onChange={(e) => setFitYErrColId(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="">Unweighted</option>
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              );
            })()}

            {fitModelType !== "linear" && fitModelType !== "polynomial" && (
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    Initial Parameter Guesses (Optional — Auto-Estimated if
                    Blank)
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoEstimateParams}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-200 font-medium"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Auto-Estimate</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={initialParamsText}
                  onChange={(e) => setInitialParamsText(e.target.value)}
                  placeholder="Comma-separated initial parameter guesses (leave blank for automatic)"
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fitUseWeights}
                  onChange={(e) => setFitUseWeights(e.target.checked)}
                />
                <span>
                  Use Instrumental Weighting (w_i = 1 / σ_i²) when σ_y is
                  selected
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModal("none")}
                  className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parsedInit = initialParamsText
                      .split(",")
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0)
                      .map(Number);

                    executeCurveFit(
                      {
                        dataset_id: fitDsId,
                        x_col: fitXColId,
                        y_col: fitYColId,
                        y_err_col: fitYErrColId || null,
                        model: currentFitModel(),
                        x_range: null,
                        initial_parameters:
                          parsedInit.length > 0 &&
                          parsedInit.every(Number.isFinite)
                            ? parsedInit
                            : null,
                        lower_bounds: null,
                        upper_bounds: null,
                        use_weights: Boolean(fitYErrColId && fitUseWeights),
                        max_iterations: 200,
                        tolerance: 1e-10,
                        curve_points: 200,
                      },
                      fitName.trim() || undefined,
                      fitTargetPlotId || undefined
                    );
                  }}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  Execute Curve Fit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Transform Column Modal */}
        {activeModal === "transform_column" && (
          <div className="p-4 space-y-3">
            {(() => {
              const ds =
                project.datasets.find((d) => d.id === transDsId) ??
                project.datasets[0];
              if (!ds) return null;
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Source Column
                      </label>
                      <select
                        value={transColId}
                        onChange={(e) => setTransColId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Mathematical / Signal Operation
                      </label>
                      <select
                        value={transKind}
                        onChange={(e) =>
                          setTransKind(e.target.value as typeof transKind)
                        }
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="normalize_min_max">
                          Normalize Min-Max [0, 1]
                        </option>
                        <option value="standardize_z_score">
                          Standardize Z-Score ((y - μ)/s)
                        </option>
                        <option value="scale_offset">
                          Linear Scale & Offset (a·y + b)
                        </option>
                        <option value="log10">Base-10 Logarithm log10(y)</option>
                        <option value="ln">Natural Logarithm ln(y)</option>
                        <option value="first_derivative">
                          Numerical First Derivative (dY/dX)
                        </option>
                        <option value="cumulative_integral">
                          Cumulative Trapezoidal Integral ∫Y dX
                        </option>
                        <option value="moving_average">
                          Moving Average Smoothing
                        </option>
                        <option value="savitzky_golay_5">
                          Savitzky-Golay 5-pt Quadratic Smoothing
                        </option>
                        <option value="baseline_subtract_linear">
                          Linear Baseline Subtraction
                        </option>
                      </select>
                    </div>
                  </div>

                  {transKind === "scale_offset" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">
                          Scale Factor (a)
                        </label>
                        <input
                          type="number"
                          value={scaleVal}
                          onChange={(e) =>
                            setScaleVal(Number(e.target.value) || 1)
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">
                          Offset (b)
                        </label>
                        <input
                          type="number"
                          value={offsetVal}
                          onChange={(e) =>
                            setOffsetVal(Number(e.target.value) || 0)
                          }
                          className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {transKind === "moving_average" && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Smoothing Window Width (Points)
                      </label>
                      <input
                        type="number"
                        min={3}
                        max={25}
                        step={2}
                        value={maWindow}
                        onChange={(e) =>
                          setMaWindow(Math.max(3, Number(e.target.value) || 5))
                        }
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                    </div>
                  )}

                  {(transKind === "first_derivative" ||
                    transKind === "cumulative_integral") && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        With Respect to X Column
                      </label>
                      <select
                        value={transXColId}
                        onChange={(e) => setTransXColId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">
                      Output Column Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={transResultName}
                      onChange={(e) => setTransResultName(e.target.value)}
                      placeholder="Auto-named from formula"
                      className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveModal("none")}
                      className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        let transformSpec: ColumnTransform;
                        switch (transKind) {
                          case "scale_offset":
                            transformSpec = {
                              transform: "scale_offset",
                              scale: scaleVal,
                              offset: offsetVal,
                            };
                            break;
                          case "log10":
                            transformSpec = { transform: "log10" };
                            break;
                          case "ln":
                            transformSpec = { transform: "ln" };
                            break;
                          case "normalize_min_max":
                            transformSpec = { transform: "normalize_min_max" };
                            break;
                          case "standardize_z_score":
                            transformSpec = {
                              transform: "standardize_z_score",
                            };
                            break;
                          case "first_derivative":
                            transformSpec = {
                              transform: "first_derivative",
                              x_col: transXColId,
                            };
                            break;
                          case "cumulative_integral":
                            transformSpec = {
                              transform: "cumulative_integral",
                              x_col: transXColId,
                            };
                            break;
                          case "moving_average":
                            transformSpec = {
                              transform: "moving_average",
                              window: maWindow,
                            };
                            break;
                          case "savitzky_golay_5":
                            transformSpec = { transform: "savitzky_golay5" };
                            break;
                          case "baseline_subtract_linear":
                            transformSpec = {
                              transform: "baseline_subtract_linear",
                            };
                            break;
                        }
                        await mutateDataset(ds.id, {
                          action: "transform_column",
                          col_id: transColId,
                          transform: transformSpec,
                          result_name: transResultName.trim() || null,
                        });
                        setActiveModal("none");
                      }}
                      className="px-4 py-1.5 rounded bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                    >
                      Compute Derived Column
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* 5. Descriptive Statistics Modal */}
        {activeModal === "column_stats" && (
          <div className="p-4 space-y-3">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] text-slate-500">
                    <th className="p-2">Column</th>
                    <th className="p-2 text-right">N</th>
                    <th className="p-2 text-right">Mean</th>
                    <th className="p-2 text-right">SD</th>
                    <th className="p-2 text-right">SEM</th>
                    <th className="p-2 text-right">Min</th>
                    <th className="p-2 text-right">Median</th>
                    <th className="p-2 text-right">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {allColStats.map(({ colName, unit, stats }) => (
                    <tr key={colName}>
                      <td className="p-2 font-sans font-semibold">
                        {colName} {unit ? `[${unit}]` : ""}
                      </td>
                      <td className="p-2 text-right">{stats.count}</td>
                      <td className="p-2 text-right">
                        {stats.mean.toPrecision(5)}
                      </td>
                      <td className="p-2 text-right">
                        {stats.std_dev.toPrecision(4)}
                      </td>
                      <td className="p-2 text-right">
                        {stats.sem.toPrecision(4)}
                      </td>
                      <td className="p-2 text-right">
                        {stats.min.toPrecision(5)}
                      </td>
                      <td className="p-2 text-right">
                        {stats.median.toPrecision(5)}
                      </td>
                      <td className="p-2 text-right">
                        {stats.max.toPrecision(5)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              {allColStats.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const header =
                      "Column,Unit,N,Missing,Mean,StdDev,SEM,Min,Q1,Median,Q3,IQR,Max,Sum,Skewness";
                    const rows = allColStats.map(
                      ({ colName, unit, stats }) =>
                        `"${colName}","${unit ?? ""}",${stats.count},${stats.missing_count},${stats.mean},${stats.std_dev},${stats.sem},${stats.min},${stats.q1},${stats.median},${stats.q3},${stats.iqr},${stats.max},${stats.sum},${stats.skewness}`
                    );
                    const bytes = new TextEncoder().encode(
                      [header, ...rows].join("\n")
                    );
                    const savedPath = await tauriClient.saveFileWithDialog(
                      "descriptive_statistics.csv",
                      "CSV Statistics Report (*.csv)",
                      ["csv"],
                      bytes,
                      "Save Descriptive Statistics Report"
                    );
                    if (savedPath) {
                      setStatus(
                        `Saved descriptive statistics to "${savedPath}"`,
                        "success"
                      );
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save Statistics CSV</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModal("none")}
                className="px-4 py-1.5 rounded bg-sky-600 text-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* 6. Signal Processing, Peak Detection & Integration Modal */}
        {activeModal === "signal_processing" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 pb-2">
              {(
                [
                  ["peaks", "Peak Finder (FWHM)"],
                  ["fft", "FFT Power Spectrum"],
                  ["filter", "Frequency Filter"],
                  ["integrate", "Numerical Integration"],
                ] as const
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setSigTab(tabKey)}
                  className={`px-3 py-1.5 rounded font-medium ${
                    sigTab === tabKey
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(() => {
              const ds =
                project.datasets.find((d) => d.id === sigDsId) ??
                project.datasets[0];
              if (!ds) return null;
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Dataset
                      </label>
                      <select
                        value={sigDsId}
                        onChange={(e) => setSigDsId(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {project.datasets.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        X Axis (Time / Wavelength)
                      </label>
                      <select
                        value={sigXColId}
                        onChange={(e) => setSigXColId(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        Signal Y Column
                      </label>
                      <select
                        value={sigYColId}
                        onChange={(e) => setSigYColId(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        {ds.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {sigTab === "peaks" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 items-end">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Min Prominence
                          </label>
                          <input
                            type="number"
                            value={peakProminence}
                            onChange={(e) =>
                              setPeakProminence(Number(e.target.value))
                            }
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Min Distance (samples)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={peakMinDist}
                            onChange={(e) =>
                              setPeakMinDist(
                                Math.max(1, Number(e.target.value) || 1)
                              )
                            }
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const [peaks, snap] =
                              await tauriClient.runPeakDetection(
                                sigDsId,
                                sigXColId,
                                sigYColId,
                                peakProminence,
                                project.plots[0]?.id ?? null
                              );
                            setDetectedPeaks(peaks);
                            useWorkspaceStore.setState({ snapshot: snap });
                          }}
                          className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                          Detect & Annotate Peaks
                        </button>
                      </div>

                      {detectedPeaks && (
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold">
                              Detected {detectedPeaks.length} Peak(s):
                            </span>
                            {detectedPeaks.length > 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const lines = [
                                    "Peak_Index,Center_X,Height_Y,Prominence,FWHM",
                                    ...detectedPeaks.map(
                                      (pk, i) =>
                                        `${i + 1},${pk.x},${pk.y},${pk.prominence},${pk.fwhm}`
                                    ),
                                  ];
                                  const savedPath =
                                    await tauriClient.saveFileWithDialog(
                                      "detected_peaks.csv",
                                      "CSV Peak Report (*.csv)",
                                      ["csv"],
                                      new TextEncoder().encode(
                                        lines.join("\n")
                                      ),
                                      "Save Detected Peaks CSV"
                                    );
                                  if (savedPath) {
                                    setStatus(
                                      `Saved peak report to "${savedPath}"`,
                                      "success"
                                    );
                                  }
                                }}
                                className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[10px]"
                              >
                                <Download className="w-3 h-3" />
                                <span>Save Peaks CSV</span>
                              </button>
                            )}
                          </div>
                          <table className="w-full font-mono text-[11px]">
                            <thead>
                              <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                                <th className="text-left py-1">#</th>
                                <th className="text-right py-1">Center X</th>
                                <th className="text-right py-1">Height Y</th>
                                <th className="text-right py-1">Prominence</th>
                                <th className="text-right py-1">FWHM</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detectedPeaks.map((pk, idx) => (
                                <tr key={pk.index}>
                                  <td className="py-1">{idx + 1}</td>
                                  <td className="text-right">
                                    {pk.x.toPrecision(5)}
                                  </td>
                                  <td className="text-right">
                                    {pk.y.toPrecision(5)}
                                  </td>
                                  <td className="text-right">
                                    {pk.prominence.toPrecision(4)}
                                  </td>
                                  <td className="text-right">
                                    {pk.fwhm.toPrecision(4)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {sigTab === "fft" && (
                    <div className="space-y-3">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Apodization Window Function
                          </label>
                          <select
                            value={fftWindow}
                            onChange={(e) =>
                              setFftWindow(e.target.value as WindowFunction)
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="rectangular">
                              Rectangular (No Window)
                            </option>
                            <option value="hann">Hann Window</option>
                            <option value="hamming">Hamming Window</option>
                            <option value="blackman">Blackman Window</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const [res, snap] = await tauriClient.runSignalFft(
                              sigDsId,
                              sigXColId,
                              sigYColId,
                              fftWindow,
                              true
                            );
                            setFftResult(res);
                            useWorkspaceStore.setState({ snapshot: snap });
                          }}
                          className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                          Compute FFT Spectrum
                        </button>
                      </div>

                      {fftResult && (
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700 font-mono text-[11px] space-y-1">
                          <div>
                            Sampling Rate fs:{" "}
                            <strong>
                              {fftResult.sampling_rate.toPrecision(5)} Hz
                            </strong>
                          </div>
                          <div>
                            Dominant Frequency:{" "}
                            <strong className="text-rose-600 dark:text-rose-400">
                              {fftResult.dominant_frequency.toPrecision(5)} Hz
                            </strong>
                          </div>
                          <div>
                            Spectral Bins Computed:{" "}
                            {fftResult.frequencies.length}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {sigTab === "filter" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 items-end">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Filter Type
                          </label>
                          <select
                            value={filterKind}
                            onChange={(e) =>
                              setFilterKind(
                                e.target.value as "low_pass" | "high_pass"
                              )
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="low_pass">Low-Pass Filter</option>
                            <option value="high_pass">High-Pass Filter</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Cutoff Frequency (Hz)
                          </label>
                          <input
                            type="number"
                            step={0.01}
                            value={filterCutoff}
                            onChange={(e) =>
                              setFilterCutoff(Number(e.target.value) || 0.05)
                            }
                            className="w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const snap = await tauriClient.runSignalFilter(
                              sigDsId,
                              sigXColId,
                              sigYColId,
                              {
                                filter_type: filterKind,
                                cutoff_hz: filterCutoff,
                              }
                            );
                            useWorkspaceStore.setState({ snapshot: snap });
                            setStatus(
                              `Appended ${filterKind} filtered column to worksheet`,
                              "success"
                            );
                            setActiveModal("none");
                          }}
                          className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                        >
                          Filter & Add Column
                        </button>
                      </div>
                    </div>
                  )}

                  {sigTab === "integrate" && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={async () => {
                          const res =
                            await tauriClient.runNumericalIntegration(
                              sigDsId,
                              sigXColId,
                              sigYColId
                            );
                          setIntegrationResult(res);
                        }}
                        className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                      >
                        Compute Definite Integral ∫Y dX
                      </button>

                      {integrationResult && (
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700 font-mono text-[11px] space-y-1">
                          <div>
                            Observations Integrated:{" "}
                            {integrationResult.observations}
                          </div>
                          <div>
                            Trapezoidal Rule Area:{" "}
                            <strong className="text-sky-600 dark:text-sky-400">
                              {integrationResult.trapezoidal_area.toPrecision(
                                7
                              )}
                            </strong>
                          </div>
                          <div>
                            Composite Simpson's 1/3 Area:{" "}
                            <strong className="text-emerald-600 dark:text-emerald-400">
                              {integrationResult.simpson_area.toPrecision(7)}
                            </strong>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* 7. Hypothesis Testing (t-Test & One-Way ANOVA) Modal */}
        {activeModal === "hypothesis" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
              <button
                type="button"
                onClick={() => setHypTab("ttest")}
                className={`px-3 py-1.5 rounded font-medium ${
                  hypTab === "ttest"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                Student's & Welch's t-Test
              </button>
              <button
                type="button"
                onClick={() => setHypTab("anova")}
                className={`px-3 py-1.5 rounded font-medium ${
                  hypTab === "anova"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                One-Way ANOVA (Multi-Group)
              </button>
            </div>

            {(() => {
              const ds =
                project.datasets.find((d) => d.id === hypDsId) ??
                project.datasets[0];
              if (!ds) return null;
              return (
                <>
                  {hypTab === "ttest" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Test Variant
                          </label>
                          <select
                            value={hypTKind}
                            onChange={(e) =>
                              setHypTKind(e.target.value as typeof hypTKind)
                            }
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            <option value="two_sample_welch">
                              Two-Sample Welch's t-Test
                            </option>
                            <option value="two_sample_student">
                              Two-Sample Pooled Student's t-Test
                            </option>
                            <option value="one_sample">
                              One-Sample t-Test vs μ₀
                            </option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-500 mb-0.5">
                            Sample Column A
                          </label>
                          <select
                            value={hypColA}
                            onChange={(e) => setHypColA(e.target.value)}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                          >
                            {ds.columns.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {hypTKind === "one_sample" ? (
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              Hypothesized Mean μ₀
                            </label>
                            <input
                              type="number"
                              value={hypMu0}
                              onChange={(e) =>
                                setHypMu0(Number(e.target.value) || 0)
                              }
                              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-0.5">
                              Sample Column B
                            </label>
                            <select
                              value={hypColB}
                              onChange={(e) => setHypColB(e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                            >
                              {ds.columns.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const res = await tauriClient.runHypothesisTTest(
                            ds.id,
                            hypColA,
                            hypTKind === "one_sample" ? null : hypColB,
                            hypTKind === "one_sample"
                              ? { test_kind: "one_sample", mu0: hypMu0 }
                              : { test_kind: hypTKind }
                          );
                          setTTestResult(res);
                        }}
                        className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                      >
                        Run t-Test
                      </button>

                      {tTestResult && (
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700 font-mono text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-sans font-bold text-slate-700 dark:text-slate-200">
                              {tTestResult.test_name}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                const report = [
                                  `# Hypothesis Test Report: ${tTestResult.test_name}`,
                                  `- Sample Size A (n1): ${tTestResult.n1}`,
                                  tTestResult.n2 != null
                                    ? `- Sample Size B (n2): ${tTestResult.n2}`
                                    : null,
                                  `- Mean Difference: ${tTestResult.mean_diff} (SE = ${tTestResult.std_error_diff})`,
                                  `- t-Statistic: ${tTestResult.statistic_t}`,
                                  `- Degrees of Freedom: ${tTestResult.degrees_of_freedom}`,
                                  `- Two-Tailed p-Value: ${tTestResult.p_value_two_tailed}`,
                                  `- 95% Confidence Interval: [${tTestResult.ci_lower_95}, ${tTestResult.ci_upper_95}]`,
                                  `- Significant at alpha=0.05: ${tTestResult.significant_at_05}`,
                                ]
                                  .filter(Boolean)
                                  .join("\n");
                                const savedPath =
                                  await tauriClient.saveFileWithDialog(
                                    "t_test_report.md",
                                    "Markdown Report (*.md)",
                                    ["md", "txt"],
                                    new TextEncoder().encode(report),
                                    "Save t-Test Report"
                                  );
                                if (savedPath) {
                                  setStatus(
                                    `Saved t-Test report to "${savedPath}"`,
                                    "success"
                                  );
                                }
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-sans text-[10px]"
                            >
                              <Download className="w-3 h-3" />
                              <span>Save Report</span>
                            </button>
                          </div>
                          <div>
                            t-Statistic:{" "}
                            <strong>
                              {tTestResult.statistic_t.toPrecision(5)}
                            </strong>{" "}
                            (df = {tTestResult.degrees_of_freedom.toFixed(2)})
                          </div>
                          <div>
                            Two-Tailed p-Value:{" "}
                            <strong
                              className={
                                tTestResult.significant_at_05
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600"
                              }
                            >
                              {tTestResult.p_value_two_tailed.toExponential(4)}{" "}
                              {tTestResult.significant_at_05
                                ? "(Significant at α = 0.05)"
                                : "(Not Significant at α = 0.05)"}
                            </strong>
                          </div>
                          <div>
                            95% CI of Difference: [
                            {tTestResult.ci_lower_95.toPrecision(4)},{" "}
                            {tTestResult.ci_upper_95.toPrecision(4)}]
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-slate-500">
                        Runs One-Way Analysis of Variance (ANOVA) across all Y
                        data columns in <strong>{ds.name}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          const yCols = ds.columns
                            .filter((c) => c.role === "y" || c.role === "none")
                            .map((c) => c.id);
                          const cols =
                            yCols.length >= 2
                              ? yCols
                              : ds.columns.slice(0, 2).map((c) => c.id);
                          const res = await tauriClient.runHypothesisAnova(
                            ds.id,
                            cols
                          );
                          setAnovaResult(res);
                        }}
                        className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold"
                      >
                        Run One-Way ANOVA
                      </button>

                      {anovaResult && (
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded border border-slate-200 dark:border-slate-700 font-mono text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              F-Statistic:{" "}
                              <strong>
                                {anovaResult.f_statistic.toPrecision(5)}
                              </strong>{" "}
                              (df_between = {anovaResult.df_between}, df_within ={" "}
                              {anovaResult.df_within})
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                const report = [
                                  `# One-Way ANOVA Report`,
                                  `- F-Statistic: ${anovaResult.f_statistic}`,
                                  `- df_between: ${anovaResult.df_between}, df_within: ${anovaResult.df_within}`,
                                  `- p-Value: ${anovaResult.p_value}`,
                                  `- Significant at alpha=0.05: ${anovaResult.significant_at_05}`,
                                  ``,
                                  `## Group Summaries`,
                                  ...anovaResult.groups.map(
                                    (g) =>
                                      `- ${g.group_name}: N=${g.count}, Mean=${g.mean}, StdDev=${g.std_dev}`
                                  ),
                                ].join("\n");
                                const savedPath =
                                  await tauriClient.saveFileWithDialog(
                                    "anova_report.md",
                                    "Markdown Report (*.md)",
                                    ["md", "txt"],
                                    new TextEncoder().encode(report),
                                    "Save One-Way ANOVA Report"
                                  );
                                if (savedPath) {
                                  setStatus(
                                    `Saved ANOVA report to "${savedPath}"`,
                                    "success"
                                  );
                                }
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-sans text-[10px]"
                            >
                              <Download className="w-3 h-3" />
                              <span>Save Report</span>
                            </button>
                          </div>
                          <div>
                            p-Value:{" "}
                            <strong
                              className={
                                anovaResult.significant_at_05
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600"
                              }
                            >
                              {anovaResult.p_value.toExponential(4)}{" "}
                              {anovaResult.significant_at_05
                                ? "(Significant difference between groups)"
                                : "(No significant difference)"}
                            </strong>
                          </div>
                          <div className="pt-1">
                            Group Means:{" "}
                            {anovaResult.groups
                              .map(
                                (g) => `${g.group_name}: ${g.mean.toPrecision(4)}`
                              )
                              .join(" | ")}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* 8. Reusable Analysis Workflows Modal */}
        {activeModal === "workflows" && (
          <div className="p-4 space-y-3">
            <p className="text-slate-600 dark:text-slate-300">
              Execute a multi-step reproducible scientific processing pipeline
              on the active dataset (Linear Baseline Subtraction → 5-Point
              Savitzky-Golay Smoothing → Automated Regression Fit) and save the
              workflow in the project.
            </p>
            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">
                Workflow Template Name
              </label>
              <input
                type="text"
                value={wfName}
                onChange={(e) => setWfName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            {project.workflows && project.workflows.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded border border-slate-200 dark:border-slate-700 space-y-1">
                <div className="font-semibold text-[11px] text-slate-500">
                  Saved Project Workflows ({project.workflows.length}):
                </div>
                {project.workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span>{wf.name}</span>
                    <span className="text-slate-400">
                      {wf.actions.length} steps
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal("none")}
                className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ds = project.datasets[0];
                  if (!ds || ds.columns.length < 2) return;
                  const xCol = ds.columns[0];
                  const yCol = ds.columns[1];
                  const wfId = project.workflows?.[0]?.id ?? "wf-default";
                  const [msg, snap] = await tauriClient.executeWorkflow(
                    wfId,
                    ds.id,
                    xCol.id,
                    yCol.id,
                    project.plots[0]?.id ?? null
                  );
                  useWorkspaceStore.setState({
                    snapshot: snap,
                    activeModal: "none",
                    statusMessage: msg || `Executed workflow "${wfName}"`,
                    statusLevel: "success",
                  });
                }}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Run Pipeline Now</span>
              </button>
            </div>
          </div>
        )}

        {/* 9. About Figrava Window */}
        {activeModal === "about" && (
          <div className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="px-6 py-3 rounded-2xl bg-white dark:bg-slate-100 shadow-sm border border-slate-200">
              <img
                src="/Logo.png"
                alt="Figrava Logo"
                className="h-16 w-auto object-contain mx-auto"
              />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-sky-900 dark:text-sky-300">
                Figrava
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Scientific Figures &amp; Data Visualization
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Version 1.0
              </p>
            </div>
            <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              <p>
                Created by <strong>Sahan S Liyanage</strong>
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Copyright © 2026 Sahan S Liyanage. All rights reserved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModal("none")}
              className="px-6 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        )}

        {/* 10. Desktop Keyboard Shortcuts & Context Menu Guide */}
        {activeModal === "shortcuts" && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <p className="text-slate-600 dark:text-slate-300">
              <strong>Figrava v1.0</strong> is a native desktop application with context-sensitive right-click menus across worksheets, figures, analysis reports, and the project explorer.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                ["Ctrl + N", "New Blank Project"],
                ["Ctrl + O", "Open Project (.spsproj) via Native Dialog"],
                ["Ctrl + S", "Save Project"],
                ["Ctrl + Shift + S", "Save Project As (.spsproj)..."],
                ["Ctrl + I", "Import CSV / TSV / Excel Dataset..."],
                ["Ctrl + P", "Create New 2D / 3D Scientific Graph..."],
                ["Ctrl + F", "Run Linear / Nonlinear Curve Fitting..."],
                ["Ctrl + Z / Ctrl + Y", "Undo / Redo Project Action"],
                ["F1", "Open About Figrava v1.0 Window"],
                ["Right-Click Column Header", "Assign Role (X/Y/Z/yErr), Sort, Plot Selected"],
                ["Right-Click Worksheet Cell", "Edit, Copy, Paste, Clear, Insert/Delete Row"],
                ["Right-Click Figure Canvas", "Reset View, Toggle Grid/Legend/3D Box, Export PDF/SVG/PNG"],
              ].map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                >
                  <span className="text-slate-700 dark:text-slate-200 font-medium">
                    {desc}
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[10px] font-bold text-sky-700 dark:text-sky-300 shrink-0 ml-2">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveModal("none")}
                className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
