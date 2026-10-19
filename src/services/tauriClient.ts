import { invoke } from "@tauri-apps/api/core";
import type {
  AnalysisResult,
  AnovaResult,
  CellValue,
  ColumnRole,
  DataColumn,
  DatasetMutation,
  DescriptiveStats,
  DetectedPeak,
  FftSpectrumResult,
  FilterKind,
  FitConfiguration,
  FitModelKind,
  ImportOptions,
  IntegrationResult,
  PairedCorrelation,
  PlotDocument,
  PlotType,
  Project,
  TTestKind,
  TTestResult,
  WindowFunction,
  WorkspaceSnapshot,
} from "../types/scientific";

function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const PUBLICATION_PALETTE = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#E69F00",
  "#56B4E9",
  "#F0E442",
  "#333333",
];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function parseCell(raw: string): CellValue {
  const t = raw.trim();
  if (
    !t ||
    /^(na|n\/a|nan|null|--)$/i.test(t)
  ) {
    return { kind: "missing" };
  }
  const num = Number(t);
  if (Number.isFinite(num)) {
    return { kind: "numeric", value: num };
  }
  return { kind: "text", value: t };
}

function createFallbackSampleProject(): Project {
  const specId = "ds-spec-sample";
  const wlColId = "col-wl";
  const intAColId = "col-int-a";
  const errAColId = "col-err-a";
  const intBColId = "col-int-b";

  const wlVals: CellValue[] = [];
  const intAVals: CellValue[] = [];
  const errAVals: CellValue[] = [];
  const intBVals: CellValue[] = [];
  const obsX: number[] = [];
  const obsY: number[] = [];
  const fittedY: number[] = [];
  const residuals: number[] = [];
  const stdResiduals: number[] = [];

  for (let i = 0; i < 41; i++) {
    const wl = 450 + i * 5;
    const zA = (wl - 545) / 22;
    const exactA = 850 * Math.exp(-0.5 * zA * zA) + 120;
    const noiseA = Math.sin(i * 1.73) * 14.5 + Math.cos(i * 3.11) * 8.2;
    const valA = Math.round((exactA + noiseA) * 100) / 100;

    const zB = (wl - 565) / 28;
    const valB =
      Math.round(
        (620 * Math.exp(-0.5 * zB * zB) + 95 + Math.cos(i * 2.19) * 11.0) * 100
      ) / 100;
    const sigma = Math.round(Math.max(8, Math.sqrt(Math.abs(valA)) * 0.85) * 100) / 100;

    wlVals.push({ kind: "numeric", value: wl });
    intAVals.push({ kind: "numeric", value: valA });
    errAVals.push({ kind: "numeric", value: sigma });
    intBVals.push({ kind: "numeric", value: valB });

    obsX.push(wl);
    obsY.push(valA);
    fittedY.push(exactA);
    const res = valA - exactA;
    residuals.push(res);
    stdResiduals.push(res / 12.0);
  }

  const curveX: number[] = [];
  const curveY: number[] = [];
  for (let i = 0; i < 200; i++) {
    const x = 450 + (200 * i) / 199;
    const z = (x - 545) / 22;
    curveX.push(x);
    curveY.push(850 * Math.exp(-0.5 * z * z) + 120);
  }

  const anaId = "ana-gauss-sample";
  const wsId = "ws-spec-sample";
  const plotId = "plot-spec-sample";
  const panelId = "panel-spec-1";

  return {
    format_version: 1,
    id: "proj-sample-1",
    name: "Optical Spectroscopy & Calibration Study",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    active_tab_id: wsId,
    datasets: [
      {
        id: specId,
        name: "Photoluminescence Spectrum",
        source: {
          source_type: "synthesized",
          description: "GaN Quantum Dot Photoluminescence Emission (450–650 nm)",
        },
        columns: [
          {
            id: wlColId,
            name: "Wavelength",
            long_name: "Wavelength [nm]",
            unit: "nm",
            comments: null,
            role: "x",
            data_type: "numeric",
            values: wlVals,
            formula: null,
          },
          {
            id: intAColId,
            name: "Sample A Intensity",
            long_name: "Sample A Intensity [counts]",
            unit: "counts",
            comments: null,
            role: "y",
            data_type: "numeric",
            values: intAVals,
            formula: null,
          },
          {
            id: errAColId,
            name: "Sample A Sigma",
            long_name: "Sample A Sigma [counts]",
            unit: "counts",
            comments: null,
            role: "y_error",
            data_type: "numeric",
            values: errAVals,
            formula: null,
          },
          {
            id: intBColId,
            name: "Reference Sample B",
            long_name: "Reference Sample B [counts]",
            unit: "counts",
            comments: null,
            role: "y",
            data_type: "numeric",
            values: intBVals,
            formula: null,
          },
        ],
      },
    ],
    worksheets: [
      {
        id: wsId,
        name: "Spectroscopy Data",
        dataset_id: specId,
        active_filter_col: null,
        active_filter: null,
      },
    ],
    analyses: [
      {
        id: anaId,
        name: "Gaussian Fit (Sample A)",
        config: {
          dataset_id: specId,
          x_col: wlColId,
          y_col: intAColId,
          y_err_col: errAColId,
          model: { model_type: "gaussian" },
          x_range: null,
          initial_parameters: null,
          lower_bounds: null,
          upper_bounds: null,
          use_weights: true,
          max_iterations: 200,
          tolerance: 1e-10,
          curve_points: 200,
        },
        formula_template: "y = A * exp(-(x - mu)^2 / (2 * sigma^2)) + C",
        fitted_equation: "y = 850.12 * exp(-(x - 545.03)^2 / (2 * 22.04^2)) + 119.85",
        parameters: [
          {
            name: "A",
            value: 850.12,
            std_error: 6.42,
            t_value: 132.4,
            p_value: 0,
            ci_lower_95: 837.11,
            ci_upper_95: 863.13,
          },
          {
            name: "mu",
            value: 545.03,
            std_error: 0.18,
            t_value: 3027.9,
            p_value: 0,
            ci_lower_95: 544.66,
            ci_upper_95: 545.4,
          },
          {
            name: "sigma",
            value: 22.04,
            std_error: 0.21,
            t_value: 104.9,
            p_value: 0,
            ci_lower_95: 21.61,
            ci_upper_95: 22.47,
          },
          {
            name: "C",
            value: 119.85,
            std_error: 2.15,
            t_value: 55.7,
            p_value: 0,
            ci_lower_95: 115.49,
            ci_upper_95: 124.21,
          },
        ],
        diagnostics: {
          observations: 41,
          dropped_missing: 0,
          degrees_of_freedom: 37,
          rss: 5412.3,
          tss: 3124500.0,
          r_squared: 0.99827,
          adj_r_squared: 0.99813,
          rmse: 11.49,
          residual_std_error: 12.09,
          reduced_chi_square: 0.94,
          aic: 208.1,
          converged: true,
          iterations: 9,
          condition_number: 42.6,
          warnings: [],
        },
        obs_x: obsX,
        obs_y: obsY,
        fitted_y: fittedY,
        residuals,
        standardized_residuals: stdResiduals,
        curve_x: curveX,
        curve_y: curveY,
      },
    ],
    plots: [
      {
        id: plotId,
        name: "Photoluminescence Emission Spectrum",
        title: "Photoluminescence Emission Spectrum",
        subtitle: "GaN Quantum Dots (T = 298 K) with Weighted Gaussian Fit",
        background_color: "#FFFFFF",
        font_family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        base_font_size: 13,
        dimensions: {
          width_px: 800,
          height_px: 560,
          width_cm: 16.0,
          height_cm: 11.2,
          dpi: 300,
        },
        margins: { top: 56, right: 40, bottom: 64, left: 72 },
        legend: {
          visible: true,
          position: "top_right",
          frame_visible: true,
          font_size: 12,
        },
        grid_rows: 1,
        grid_cols: 1,
        panels: [
          {
            id: panelId,
            title: null,
            row: 0,
            col: 0,
            x_axis: {
              title: "Wavelength",
              unit: "nm",
              scale: "linear",
              min: null,
              max: null,
              reversed: false,
              show_major_grid: true,
              show_minor_grid: false,
              major_tick_count: null,
              minor_tick_split: 5,
              visible: true,
              scientific_notation: false,
              font_size: 13,
            },
            y_axis: {
              title: "PL Intensity",
              unit: "counts",
              scale: "linear",
              min: null,
              max: null,
              reversed: false,
              show_major_grid: true,
              show_minor_grid: false,
              major_tick_count: null,
              minor_tick_split: 5,
              visible: true,
              scientific_notation: false,
              font_size: 13,
            },
          },
        ],
        layers: [
          {
            id: "layer-spec-1",
            label: "Sample A (Measured)",
            visible: true,
            plot_type: "scatter",
            source: {
              source_type: "dataset_columns",
              dataset_id: specId,
              x_col: wlColId,
              y_col: intAColId,
              x_err_col: null,
              y_err_col: errAColId,
            },
            style: {
              color: "#0072B2",
              line_width: 2.0,
              line_style: "solid",
              symbol_shape: "circle",
              symbol_size: 7.0,
              symbol_filled: true,
              opacity: 1.0,
              show_error_bars: true,
              error_bar_cap_width: 6.0,
              error_bar_line_width: 1.25,
            },
            panel_id: panelId,
          },
          {
            id: "layer-spec-2",
            label: "Reference Sample B",
            visible: true,
            plot_type: "line_symbols",
            source: {
              source_type: "dataset_columns",
              dataset_id: specId,
              x_col: wlColId,
              y_col: intBColId,
              x_err_col: null,
              y_err_col: null,
            },
            style: {
              color: "#009E73",
              line_width: 2.0,
              line_style: "dashed",
              symbol_shape: "square",
              symbol_size: 6.0,
              symbol_filled: true,
              opacity: 0.9,
              show_error_bars: false,
              error_bar_cap_width: 6.0,
              error_bar_line_width: 1.25,
            },
            panel_id: panelId,
          },
          {
            id: "layer-spec-fit",
            label: "Gaussian Peak Fit (Sample A)",
            visible: true,
            plot_type: "line",
            source: {
              source_type: "analysis_output",
              analysis_id: anaId,
              dataset_id: specId,
              curve_kind: "fitted_curve",
            },
            style: {
              color: "#D55E00",
              line_width: 2.5,
              line_style: "solid",
              symbol_shape: "none",
              symbol_size: 0,
              symbol_filled: true,
              opacity: 1.0,
              show_error_bars: false,
              error_bar_cap_width: 6.0,
              error_bar_line_width: 1.25,
            },
            panel_id: panelId,
          },
        ],
        annotations: [],
        export_spec: {
          format: "svg",
          dpi: 300,
          width_px: 1200,
          height_px: 840,
          transparent_background: false,
        },
      },
    ],
  };
}

function createFallbackEmptyProject(): Project {
  return {
    format_version: 1,
    id: uid("proj"),
    name: "Untitled Project",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    active_tab_id: null,
    datasets: [],
    worksheets: [],
    plots: [],
    analyses: [],
  };
}

let fallbackState: WorkspaceSnapshot = {
  project: createFallbackEmptyProject(),
  project_path: null,
  dirty: false,
  can_undo: false,
  can_redo: false,
};
const fallbackUndo: Project[] = [];
const fallbackRedo: Project[] = [];

function pushFallbackUndo() {
  fallbackUndo.push(structuredClone(fallbackState.project));
  fallbackRedo.length = 0;
  fallbackState.dirty = true;
  fallbackState.can_undo = fallbackUndo.length > 0;
  fallbackState.can_redo = false;
}

export const tauriClient = {
  async getProjectState(): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("get_project_state");
    }
    return structuredClone(fallbackState);
  },

  async newProject(name: string, useSample: boolean): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("new_project", { name, useSample });
    }
    fallbackUndo.length = 0;
    fallbackRedo.length = 0;
    if (useSample) {
      fallbackState = {
        project: createFallbackSampleProject(),
        project_path: null,
        dirty: false,
        can_undo: false,
        can_redo: false,
      };
    } else {
      const dsId = uid("ds");
      const wsId = uid("ws");
      const emptyCells: CellValue[] = Array.from({ length: 5 }, () => ({
        kind: "missing",
      }));
      fallbackState = {
        project: {
          format_version: 1,
          id: uid("proj"),
          name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          active_tab_id: wsId,
          datasets: [
            {
              id: dsId,
              name: "Dataset 1",
              source: { source_type: "manual" },
              columns: [
                {
                  id: uid("col"),
                  name: "X",
                  long_name: null,
                  unit: null,
                  comments: null,
                  role: "x",
                  data_type: "numeric",
                  values: structuredClone(emptyCells),
                  formula: null,
                },
                {
                  id: uid("col"),
                  name: "Y",
                  long_name: null,
                  unit: null,
                  comments: null,
                  role: "y",
                  data_type: "numeric",
                  values: structuredClone(emptyCells),
                  formula: null,
                },
              ],
            },
          ],
          worksheets: [
            {
              id: wsId,
              name: "Worksheet 1",
              dataset_id: dsId,
              active_filter_col: null,
              active_filter: null,
            },
          ],
          plots: [],
          analyses: [],
        },
        project_path: null,
        dirty: false,
        can_undo: false,
        can_redo: false,
      };
    }
    return structuredClone(fallbackState);
  },

  async exportProjectBytes(): Promise<Uint8Array> {
    if (isTauriEnvironment()) {
      const arr = await invoke<number[]>("export_project_bytes");
      return new Uint8Array(arr);
    }
    const json = JSON.stringify(fallbackState.project, null, 2);
    return new TextEncoder().encode(json);
  },

  async saveProjectWithDialog(
    defaultName?: string
  ): Promise<WorkspaceSnapshot | null> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot | null>("save_project_with_dialog", {
        defaultName: defaultName ?? null,
      });
    }
    const bytes = await this.exportProjectBytes();
    const safeName =
      (defaultName || fallbackState.project.name || "project").replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      ) + ".spsproj";
    const savedPath = await this.saveFileWithDialog(
      safeName,
      "Figrava Project (*.spsproj)",
      ["spsproj"],
      bytes,
      "Save Figrava v1.0 Project"
    );
    if (!savedPath) return null;
    fallbackState.project_path = savedPath;
    fallbackState.dirty = false;
    return structuredClone(fallbackState);
  },

  async saveProjectDirect(path?: string): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("save_project", {
        path: path ?? null,
      });
    }
    fallbackState.dirty = false;
    return structuredClone(fallbackState);
  },

  async openProjectWithDialog(): Promise<WorkspaceSnapshot | null> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot | null>("open_project_with_dialog");
    }
    return null;
  },

  async pickDatasetFileWithDialog(): Promise<{
    file_name: string;
    file_path: string;
    is_binary_excel: boolean;
    text_content: string | null;
    binary_bytes: number[] | null;
  } | null> {
    if (isTauriEnvironment()) {
      return invoke<{
        file_name: string;
        file_path: string;
        is_binary_excel: boolean;
        text_content: string | null;
        binary_bytes: number[] | null;
      } | null>("pick_dataset_file_with_dialog");
    }
    return null;
  },

  async showMessageBox(
    title: string,
    message: string,
    level: "info" | "warning" | "error" = "info"
  ): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke("show_message_box", { title, message, level });
      return;
    }
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(`${title}\n\n${message}`);
    }
  },

  async confirmMessageBox(
    title: string,
    message: string,
    level: "info" | "warning" | "error" = "warning"
  ): Promise<boolean> {
    if (isTauriEnvironment()) {
      return invoke<boolean>("confirm_message_box", { title, message, level });
    }
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(`${title}\n\n${message}`);
    }
    return true;
  },

  async exitApplication(): Promise<void> {
    if (isTauriEnvironment()) {
      await invoke("exit_application");
      return;
    }
    if (typeof window !== "undefined") {
      window.close();
    }
  },

  async saveFileWithDialog(
    defaultName: string,
    filterName: string,
    extensions: string[],
    bytes: Uint8Array,
    title?: string
  ): Promise<string | null> {
    if (isTauriEnvironment()) {
      return invoke<string | null>("save_file_with_dialog", {
        defaultName,
        filterName,
        extensions,
        bytes: Array.from(bytes),
        title: title ?? null,
      });
    }
    // Browser File System Access API if supported
    const win = window as unknown as {
      showSaveFilePicker?: (opts: unknown) => Promise<{
        name: string;
        createWritable: () => Promise<{
          write: (data: Uint8Array) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }>;
    };
    if (typeof win.showSaveFilePicker === "function") {
      try {
        const acceptMap: Record<string, string[]> = {
          "application/octet-stream": extensions.map((ext) =>
            ext.startsWith(".") ? ext : `.${ext}`
          ),
        };
        const handle = await win.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: filterName, accept: acceptMap }],
        });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return handle.name;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return null;
        }
      }
    }
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return defaultName;
  },

  async importProjectBytes(
    bytes: Uint8Array,
    fileName?: string
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("import_project_bytes", {
        bytes: Array.from(bytes),
        fileName: fileName ?? null,
      });
    }
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as Project;
    if (parsed.format_version > 1) {
      throw new Error(`Unsupported project format version ${parsed.format_version}`);
    }
    fallbackState = {
      project: parsed,
      project_path: fileName ?? null,
      dirty: false,
      can_undo: false,
      can_redo: false,
    };
    return structuredClone(fallbackState);
  },

  async importDelimitedDataset(
    content: string,
    fileName: string,
    options: ImportOptions
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("import_delimited_dataset", {
        content,
        fileName,
        options,
      });
    }
    pushFallbackUndo();
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    const delim =
      options.delimiter || (lines[0]?.includes("\t") ? "\t" : ",");
    const rows = lines.map((l) => l.split(delim).map((s) => s.trim()));
    const hasHeader =
      options.has_header ??
      rows[0]?.some((tok) => parseCell(tok).kind === "text");
    const headerRow = hasHeader ? rows[0] : null;
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const colCount = Math.max(...rows.map((r) => r.length));

    const columns: DataColumn[] = [];
    for (let c = 0; c < colCount; c++) {
      const rawHeader = headerRow?.[c] || `Col${c + 1}`;
      const match = rawHeader.match(/^(.*?)\s*\[(.*?)\]$/);
      const name = match ? match[1].trim() : rawHeader;
      const unit = match ? match[2].trim() : null;
      const values = dataRows.map((r) => parseCell(r[c] ?? ""));
      const lowerName = name.trim().toLowerCase();
      const role: ColumnRole =
        c === 0
          ? "x"
          : /err|sigma|sd|unc/i.test(name)
          ? "y_error"
          : lowerName === "z" || lowerName.startsWith("z_") || lowerName.startsWith("z ")
          ? "z"
          : "y";
      columns.push({
        id: uid("col"),
        name,
        long_name: rawHeader,
        unit,
        comments: null,
        role,
        data_type: "numeric",
        values,
        formula: null,
      });
    }

    const dsId = uid("ds");
    const wsId = uid("ws");
    const dsName =
      options.dataset_name || fileName.replace(/\.(csv|tsv|txt|dat)$/i, "");
    fallbackState.project.datasets.push({
      id: dsId,
      name: dsName,
      source: {
        source_type: "imported_delimited",
        file_name: fileName,
        delimiter: delim,
        has_header: Boolean(hasHeader),
      },
      columns,
    });
    fallbackState.project.worksheets.push({
      id: wsId,
      name: dsName,
      dataset_id: dsId,
      active_filter_col: null,
      active_filter: null,
    });
    fallbackState.project.active_tab_id = wsId;
    return structuredClone(fallbackState);
  },

  async exportDatasetDelimited(
    datasetId: string,
    delimiter = ","
  ): Promise<string> {
    if (isTauriEnvironment()) {
      return invoke<string>("export_dataset_delimited", {
        datasetId,
        delimiter,
      });
    }
    const ds = fallbackState.project.datasets.find((d) => d.id === datasetId);
    if (!ds) throw new Error("Dataset not found");
    const header = ds.columns
      .map((c) => (c.unit ? `${c.name} [${c.unit}]` : c.name))
      .join(delimiter);
    const rowCount = Math.max(0, ...ds.columns.map((c) => c.values.length));
    const lines = [header];
    for (let r = 0; r < rowCount; r++) {
      lines.push(
        ds.columns
          .map((c) => {
            const v = c.values[r];
            if (!v || v.kind === "missing") return "";
            return `${v.value}`;
          })
          .join(delimiter)
      );
    }
    return lines.join("\n");
  },

  async updateCell(
    datasetId: string,
    colId: string,
    rowIndex: number,
    rawValue: string
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("update_cell", {
        datasetId,
        colId,
        rowIndex,
        rawValue,
      });
    }
    pushFallbackUndo();
    const ds = fallbackState.project.datasets.find((d) => d.id === datasetId);
    const col = ds?.columns.find((c) => c.id === colId);
    if (col) {
      col.values[rowIndex] = parseCell(rawValue);
    }
    return structuredClone(fallbackState);
  },

  async datasetStructureAction(
    datasetId: string,
    mutation: DatasetMutation
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("dataset_structure_action", {
        datasetId,
        mutation,
      });
    }
    pushFallbackUndo();
    const ds = fallbackState.project.datasets.find((d) => d.id === datasetId);
    if (!ds) throw new Error("Dataset not found");
    const rows = Math.max(1, ...ds.columns.map((c) => c.values.length));
    if (mutation.action === "add_row") {
      for (const c of ds.columns) c.values.push({ kind: "missing" });
    } else if (mutation.action === "delete_row") {
      for (const c of ds.columns) c.values.splice(mutation.row_index, 1);
    } else if (mutation.action === "add_column") {
      ds.columns.push({
        id: uid("col"),
        name: mutation.name,
        long_name: null,
        unit: mutation.unit,
        comments: null,
        role: mutation.role,
        data_type: "numeric",
        values: Array.from({ length: rows }, () => ({ kind: "missing" as const })),
        formula: null,
      });
    } else if (mutation.action === "set_column_role") {
      const col = ds.columns.find((c) => c.id === mutation.col_id);
      if (col) col.role = mutation.role;
    } else if (mutation.action === "rename_column") {
      const col = ds.columns.find((c) => c.id === mutation.col_id);
      if (col) {
        col.name = mutation.new_name;
        col.unit = mutation.unit;
      }
    } else if (mutation.action === "duplicate_column") {
      const col = ds.columns.find((c) => c.id === mutation.col_id);
      if (col) {
        ds.columns.push({
          ...structuredClone(col),
          id: uid("col"),
          name: `${col.name} (Copy)`,
        });
      }
    } else if (mutation.action === "remove_column" && ds.columns.length > 1) {
      ds.columns = ds.columns.filter((c) => c.id !== mutation.col_id);
    }
    return structuredClone(fallbackState);
  },

  async computeColumnStatistics(
    datasetId: string,
    colId: string
  ): Promise<DescriptiveStats> {
    if (isTauriEnvironment()) {
      return invoke<DescriptiveStats>("compute_column_statistics", {
        datasetId,
        colId,
      });
    }
    const ds = fallbackState.project.datasets.find((d) => d.id === datasetId);
    const col = ds?.columns.find((c) => c.id === colId);
    if (!col) throw new Error("Column not found");
    const nums = col.values
      .filter((v): v is { kind: "numeric"; value: number } => v.kind === "numeric")
      .map((v) => v.value)
      .sort((a, b) => a - b);
    const missingCount = col.values.length - nums.length;
    if (nums.length === 0) throw new Error("No valid numeric observations");
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / nums.length;
    const variance =
      nums.length > 1
        ? nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (nums.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const q = (p: number) => nums[Math.floor(p * (nums.length - 1))];
    return {
      count: nums.length,
      missing_count: missingCount,
      mean,
      variance,
      std_dev: stdDev,
      sem: stdDev / Math.sqrt(nums.length),
      min: nums[0],
      q1: q(0.25),
      median: q(0.5),
      q3: q(0.75),
      iqr: q(0.75) - q(0.25),
      max: nums[nums.length - 1],
      sum,
      skewness: 0,
    };
  },

  async computeColumnsCorrelation(
    datasetId: string,
    xColId: string,
    yColId: string
  ): Promise<PairedCorrelation> {
    if (isTauriEnvironment()) {
      return invoke<PairedCorrelation>("compute_columns_correlation", {
        datasetId,
        xColId,
        yColId,
      });
    }
    return {
      observations: 10,
      dropped_missing: 0,
      pearson_r: 0.99,
      r_squared: 0.98,
      covariance: 1.0,
    };
  },

  async estimateFitParameters(
    datasetId: string,
    xColId: string,
    yColId: string,
    model: FitModelKind
  ): Promise<number[]> {
    if (isTauriEnvironment()) {
      return invoke<number[]>("estimate_fit_parameters", {
        datasetId,
        xColId,
        yColId,
        model,
      });
    }
    switch (model.model_type) {
      case "linear":
        return [1, 0];
      case "polynomial":
        return Array.from({ length: model.degree + 1 }, () => 1);
      case "exponential":
        return [100, -0.1, 10];
      case "gaussian":
      case "lorentzian":
        return [800, 545, 22, 120];
      case "multi_gaussian":
      case "multi_lorentzian":
        return Array.from({ length: model.peaks * 3 + 1 }, () => 1);
      case "custom_equation":
        return model.parameters.map(() => 1);
    }
  },

  async executeCurveFit(
    config: FitConfiguration,
    customName?: string,
    targetPlotId?: string
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("execute_curve_fit", {
        config,
        customName: customName ?? null,
        targetPlotId: targetPlotId ?? null,
      });
    }
    pushFallbackUndo();
    const ds = fallbackState.project.datasets.find(
      (d) => d.id === config.dataset_id
    );
    const colX = ds?.columns.find((c) => c.id === config.x_col);
    const colY = ds?.columns.find((c) => c.id === config.y_col);
    if (!ds || !colX || !colY) throw new Error("Dataset or columns not found");

    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < Math.min(colX.values.length, colY.values.length); i++) {
      const vx = colX.values[i];
      const vy = colY.values[i];
      if (vx.kind === "numeric" && vy.kind === "numeric") {
        xs.push(vx.value);
        ys.push(vy.value);
      }
    }
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0,
      sxy = 0,
      syy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (xs[i] - mx) ** 2;
      sxy += (xs[i] - mx) * (ys[i] - my);
      syy += (ys[i] - my) ** 2;
    }
    const m = sxy / (sxx || 1);
    const c = my - m * mx;
    const fittedY = xs.map((x) => m * x + c);
    const residuals = ys.map((y, i) => y - fittedY[i]);
    const rss = residuals.reduce((acc, r) => acc + r * r, 0);
    const r2 = syy > 0 ? 1 - rss / syy : 1;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const curveX = Array.from(
      { length: 100 },
      (_, i) => minX + ((maxX - minX) * i) / 99
    );
    const curveY = curveX.map((x) => m * x + c);
    const rse = Math.sqrt(rss / Math.max(1, n - 2));

    const anaId = uid("ana");
    const newAna: AnalysisResult = {
      id: anaId,
      name: customName || "Curve Fit",
      config,
      formula_template: "y = m * x + c",
      fitted_equation: `y = ${m.toFixed(5)} * x + ${c.toFixed(5)}`,
      parameters: [
        {
          name: "m",
          value: m,
          std_error: 0.001,
          t_value: m / 0.001,
          p_value: 0,
          ci_lower_95: m - 0.002,
          ci_upper_95: m + 0.002,
        },
        {
          name: "c",
          value: c,
          std_error: 0.01,
          t_value: c / 0.01,
          p_value: 0,
          ci_lower_95: c - 0.02,
          ci_upper_95: c + 0.02,
        },
      ],
      diagnostics: {
        observations: n,
        dropped_missing: 0,
        degrees_of_freedom: Math.max(1, n - 2),
        rss,
        tss: syy,
        r_squared: r2,
        adj_r_squared: r2,
        rmse: Math.sqrt(rss / n),
        residual_std_error: rse,
        reduced_chi_square: null,
        aic: 0,
        converged: true,
        iterations: 1,
        condition_number: 1,
        warnings: [],
      },
      obs_x: xs,
      obs_y: ys,
      fitted_y: fittedY,
      residuals,
      standardized_residuals: residuals,
      curve_x: curveX,
      curve_y: curveY,
      confidence_band_upper: curveY.map((y) => y + 1.96 * rse),
      confidence_band_lower: curveY.map((y) => y - 1.96 * rse),
    };

    fallbackState.project.analyses.push(newAna);
    if (targetPlotId) {
      const plot = fallbackState.project.plots.find(
        (p) => p.id === targetPlotId
      );
      if (plot) {
        plot.layers.push({
          id: uid("layer"),
          label: `${newAna.name} Curve`,
          visible: true,
          plot_type: "line",
          source: {
            source_type: "analysis_output",
            analysis_id: anaId,
            dataset_id: config.dataset_id,
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
          panel_id: plot.panels[0].id,
        });
      }
    } else {
      fallbackState.project.active_tab_id = anaId;
    }
    return structuredClone(fallbackState);
  },

  async createPlot(
    name: string,
    datasetId: string,
    xColId: string,
    yColId: string,
    yErrColId: string | null,
    plotType: PlotType,
    zColId: string | null = null,
    yColIds: string[] | null = null
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("create_plot", {
        name,
        datasetId,
        xColId,
        yColId,
        yErrColId,
        zColId,
        plotType,
        yColIds,
      });
    }
    pushFallbackUndo();
    const ds = fallbackState.project.datasets.find((d) => d.id === datasetId);
    const colX = ds?.columns.find((c) => c.id === xColId);
    const targetYIds =
      yColIds && yColIds.length > 0 ? yColIds : [yColId];
    const firstColY = ds?.columns.find((c) => c.id === targetYIds[0]);
    const plotId = uid("plot");
    const panelId = uid("panel");
    const newPlot: PlotDocument = {
      id: plotId,
      name,
      title: name,
      subtitle: null,
      background_color: "#FFFFFF",
      font_family: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
      base_font_size: 13,
      dimensions: {
        width_px: 800,
        height_px: 560,
        width_cm: 16,
        height_cm: 11.2,
        dpi: 300,
      },
      margins: { top: 56, right: 40, bottom: 64, left: 72 },
      legend: {
        visible: true,
        position: "top_right",
        frame_visible: true,
        font_size: 12,
      },
      grid_rows: 1,
      grid_cols: 1,
      colormap: "viridis",
      camera_3d: {
        azimuth_deg: 42,
        elevation_deg: 28,
        distance: 100,
        z_scale: 1,
      },
      panels: [
        {
          id: panelId,
          title: null,
          row: 0,
          col: 0,
          x_axis: {
            title: colX?.name ?? "X Axis",
            unit: colX?.unit ?? null,
            scale: "linear",
            min: null,
            max: null,
            reversed: false,
            show_major_grid: true,
            show_minor_grid: false,
            major_tick_count: null,
            minor_tick_split: 5,
            visible: true,
            scientific_notation: false,
            font_size: 13,
          },
          y_axis: {
            title: firstColY?.name ?? "Y Axis",
            unit: firstColY?.unit ?? null,
            scale: "linear",
            min: null,
            max: null,
            reversed: false,
            show_major_grid: true,
            show_minor_grid: false,
            major_tick_count: null,
            minor_tick_split: 5,
            visible: true,
            scientific_notation: false,
            font_size: 13,
          },
        },
      ],
      layers: targetYIds.map((ycId, idx) => {
        const colY = ds?.columns.find((c) => c.id === ycId);
        return {
          id: uid("layer"),
          label: colY?.name ?? `Series ${idx + 1}`,
          visible: true,
          plot_type: plotType,
          source: {
            source_type: "dataset_columns",
            dataset_id: datasetId,
            x_col: xColId,
            y_col: ycId,
            z_col: zColId,
            x_err_col: null,
            y_err_col: yErrColId,
          },
          style: {
            color: PUBLICATION_PALETTE[idx % PUBLICATION_PALETTE.length],
            line_width: 2.0,
            line_style: "solid",
            symbol_shape: plotType === "line" ? "none" : "circle",
            symbol_size: 7.0,
            symbol_filled: true,
            opacity: 1.0,
            show_error_bars: Boolean(yErrColId),
            error_bar_cap_width: 6.0,
            error_bar_line_width: 1.25,
          },
          panel_id: panelId,
        };
      }),
      annotations: [],
      export_spec: {
        format: "svg",
        dpi: 300,
        width_px: 1200,
        height_px: 840,
        transparent_background: false,
      },
    };
    fallbackState.project.plots.push(newPlot);
    fallbackState.project.active_tab_id = plotId;
    return structuredClone(fallbackState);
  },

  async updatePlotDocument(plot: PlotDocument): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("update_plot_document", { plot });
    }
    pushFallbackUndo();
    const idx = fallbackState.project.plots.findIndex((p) => p.id === plot.id);
    if (idx >= 0) {
      fallbackState.project.plots[idx] = structuredClone(plot);
    }
    return structuredClone(fallbackState);
  },

  async duplicatePlotDocument(plotId: string): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("duplicate_plot_document", { plotId });
    }
    pushFallbackUndo();
    const existing = fallbackState.project.plots.find((p) => p.id === plotId);
    if (existing) {
      const copy = structuredClone(existing);
      copy.id = uid("plot");
      copy.name = `${existing.name} (Copy)`;
      copy.title = copy.name;
      fallbackState.project.plots.push(copy);
      fallbackState.project.active_tab_id = copy.id;
    }
    return structuredClone(fallbackState);
  },

  async deleteEntity(
    entityKind: "plot" | "analysis",
    entityId: string
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("delete_entity", {
        entityKind,
        entityId,
      });
    }
    pushFallbackUndo();
    if (entityKind === "plot") {
      fallbackState.project.plots = fallbackState.project.plots.filter(
        (p) => p.id !== entityId
      );
    } else {
      fallbackState.project.analyses = fallbackState.project.analyses.filter(
        (a) => a.id !== entityId
      );
    }
    return structuredClone(fallbackState);
  },

  async undo(): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("undo_action");
    }
    const prev = fallbackUndo.pop();
    if (prev) {
      fallbackRedo.push(structuredClone(fallbackState.project));
      fallbackState.project = prev;
      fallbackState.can_undo = fallbackUndo.length > 0;
      fallbackState.can_redo = true;
    }
    return structuredClone(fallbackState);
  },

  async redo(): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("redo_action");
    }
    const next = fallbackRedo.pop();
    if (next) {
      fallbackUndo.push(structuredClone(fallbackState.project));
      fallbackState.project = next;
      fallbackState.can_undo = true;
      fallbackState.can_redo = fallbackRedo.length > 0;
    }
    return structuredClone(fallbackState);
  },

  async importExcelDataset(
    bytes: Uint8Array,
    fileName: string,
    sheetName?: string
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("import_excel_dataset", {
        bytes: Array.from(bytes),
        fileName,
        sheetName: sheetName ?? null,
      });
    }
    throw new Error("Excel (.xlsx) binary import requires the desktop application.");
  },

  async exportPlotPdf(plotId: string): Promise<Uint8Array> {
    if (isTauriEnvironment()) {
      const arr = await invoke<number[]>("export_plot_pdf", { plotId });
      return new Uint8Array(arr);
    }
    const header = "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n";
    return new TextEncoder().encode(header);
  },

  async load3DSample(): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("load_3d_sample");
    }
    pushFallbackUndo();
    const grid = [-3, -2, -1, 0, 1, 2, 3];
    const xVals: CellValue[] = [];
    const yVals: CellValue[] = [];
    const zVals: CellValue[] = [];
    for (const y of grid) {
      for (const x of grid) {
        const r2 = x * x + y * y;
        const r = Math.sqrt(r2);
        const z =
          Math.round(100 * Math.cos(0.75 * r) * Math.exp(-0.18 * r2) * 100) /
          100;
        xVals.push({ kind: "numeric", value: x });
        yVals.push({ kind: "numeric", value: y });
        zVals.push({ kind: "numeric", value: z });
      }
    }
    const dsId = uid("ds-3d");
    const wsId = uid("ws-3d");
    const xColId = uid("col-x");
    const yColId = uid("col-y");
    const zColId = uid("col-z");
    fallbackState.project.datasets.push({
      id: dsId,
      name: "Potential Energy Surface 3D",
      source: {
        source_type: "synthesized",
        description: "2D/3D Radial Potential Surface Z(X, Y)",
      },
      columns: [
        {
          id: xColId,
          name: "Position X",
          long_name: "Position X [nm]",
          unit: "nm",
          comments: null,
          role: "x",
          data_type: "numeric",
          values: xVals,
          formula: null,
        },
        {
          id: yColId,
          name: "Position Y",
          long_name: "Position Y [nm]",
          unit: "nm",
          comments: null,
          role: "y",
          data_type: "numeric",
          values: yVals,
          formula: null,
        },
        {
          id: zColId,
          name: "Potential Z",
          long_name: "Potential Z [meV]",
          unit: "meV",
          comments: null,
          role: "z",
          data_type: "numeric",
          values: zVals,
          formula: null,
        },
      ],
    });
    fallbackState.project.worksheets.push({
      id: wsId,
      name: "3D Surface Matrix",
      dataset_id: dsId,
      active_filter_col: null,
      active_filter: null,
    });
    return tauriClient.createPlot(
      "3D Potential Energy Surface Z(X, Y)",
      dsId,
      xColId,
      yColId,
      null,
      "surface_3d",
      zColId
    );
  },

  async runSignalFft(
    datasetId: string,
    xColId: string,
    yColId: string,
    window: WindowFunction,
    createSpectrumPlot: boolean
  ): Promise<[FftSpectrumResult, WorkspaceSnapshot]> {
    if (isTauriEnvironment()) {
      return invoke<[FftSpectrumResult, WorkspaceSnapshot]>("run_signal_fft", {
        datasetId,
        xColId,
        yColId,
        window,
        createSpectrumPlot,
      });
    }
    return [
      {
        frequencies: [0, 1, 2, 3, 4],
        magnitudes: [0, 10, 50, 12, 2],
        power_spectral_density: [0, 100, 2500, 144, 4],
        dominant_frequency: 2.0,
        dominant_magnitude: 50.0,
        sampling_rate: 10.0,
      },
      structuredClone(fallbackState),
    ];
  },

  async runSignalFilter(
    datasetId: string,
    xColId: string,
    yColId: string,
    filter: FilterKind
  ): Promise<WorkspaceSnapshot> {
    if (isTauriEnvironment()) {
      return invoke<WorkspaceSnapshot>("run_signal_filter", {
        datasetId,
        xColId,
        yColId,
        filter,
      });
    }
    return structuredClone(fallbackState);
  },

  async runPeakDetection(
    datasetId: string,
    xColId: string,
    yColId: string,
    minProminence: number,
    annotatePlotId: string | null
  ): Promise<[DetectedPeak[], WorkspaceSnapshot]> {
    if (isTauriEnvironment()) {
      return invoke<[DetectedPeak[], WorkspaceSnapshot]>("run_peak_detection", {
        datasetId,
        xColId,
        yColId,
        minProminence,
        annotatePlotId,
      });
    }
    return [
      [{ index: 19, x: 545.0, y: 970.0, prominence: 850.0, fwhm: 51.8 }],
      structuredClone(fallbackState),
    ];
  },

  async runNumericalIntegration(
    datasetId: string,
    xColId: string,
    yColId: string
  ): Promise<IntegrationResult> {
    if (isTauriEnvironment()) {
      return invoke<IntegrationResult>("run_numerical_integration", {
        datasetId,
        xColId,
        yColId,
      });
    }
    return {
      observations: 41,
      trapezoidal_area: 70850.0,
      simpson_area: 70862.5,
      absolute_area: 70850.0,
      cumulative_x: [450, 650],
      cumulative_y: [0, 70850],
    };
  },

  async runHypothesisTTest(
    datasetId: string,
    colAId: string,
    colBId: string | null,
    kind: TTestKind
  ): Promise<TTestResult> {
    if (isTauriEnvironment()) {
      return invoke<TTestResult>("run_hypothesis_t_test", {
        datasetId,
        colAId,
        colBId,
        kind,
      });
    }
    return {
      test_name: "Welch Two-Sample t-Test",
      statistic_t: 4.12,
      degrees_of_freedom: 38.0,
      p_value_two_tailed: 0.0002,
      mean_diff: 85.4,
      std_error_diff: 20.7,
      ci_lower_95: 43.5,
      ci_upper_95: 127.3,
      significant_at_05: true,
      n1: 20,
      n2: 20,
    };
  },

  async runHypothesisAnova(
    datasetId: string,
    colIds: string[]
  ): Promise<AnovaResult> {
    if (isTauriEnvironment()) {
      return invoke<AnovaResult>("run_hypothesis_anova", {
        datasetId,
        colIds,
      });
    }
    return {
      f_statistic: 18.4,
      df_between: Math.max(1, colIds.length - 1),
      df_within: 38,
      p_value: 0.0001,
      ss_between: 12500,
      ss_within: 14200,
      ms_between: 6250,
      ms_within: 373.6,
      significant_at_05: true,
      groups: [],
    };
  },

  async executeWorkflow(
    workflowId: string,
    datasetId: string,
    xColId: string,
    yColId: string,
    plotId: string | null
  ): Promise<[string, WorkspaceSnapshot]> {
    if (isTauriEnvironment()) {
      return invoke<[string, WorkspaceSnapshot]>("execute_workflow", {
        workflowId,
        datasetId,
        xColId,
        yColId,
        plotId,
      });
    }
    return ["Workflow executed", structuredClone(fallbackState)];
  },

  isTauri(): boolean {
    return isTauriEnvironment();
  },
};

