import { create } from "zustand";
import { tauriClient } from "../services/tauriClient";
import type {
  DatasetMutation,
  FitConfiguration,
  ImportOptions,
  PlotDocument,
  PlotType,
  Project,
  WorkspaceSnapshot,
} from "../types/scientific";

export type TabKind = "worksheet" | "plot" | "analysis";

export interface WorkspaceTab {
  id: string;
  kind: TabKind;
  title: string;
}

export type ActiveModal =
  | "none"
  | "import_csv"
  | "new_plot"
  | "curve_fit"
  | "column_stats"
  | "transform_column"
  | "signal_processing"
  | "hypothesis"
  | "workflows"
  | "about"
  | "shortcuts";

interface WorkspaceState {
  snapshot: WorkspaceSnapshot | null;
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  selectedColumnId: string | null;
  selectedPlotColumnIds: string[];
  selectedLayerId: string | null;
  theme: "light" | "dark";
  statusMessage: string;
  statusLevel: "info" | "success" | "warning" | "error";
  activeModal: ActiveModal;
  leftPanelWidth: number;
  rightPanelWidth: number;

  initialize: () => Promise<void>;
  syncSnapshot: (snap: WorkspaceSnapshot, msg?: string) => void;
  setStatus: (
    msg: string,
    level?: "info" | "success" | "warning" | "error"
  ) => void;
  reportError: (title: string, err: unknown) => void;
  setActiveModal: (modal: ActiveModal) => void;
  setSelectedColumnId: (id: string | null) => void;
  setSelectedPlotColumnIds: (ids: string[]) => void;
  togglePlotColumnSelection: (id: string) => void;
  setSelectedLayerId: (id: string | null) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;
  toggleTheme: () => void;

  openTab: (id: string, kind: TabKind, title: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;

  newProject: (name: string, useSample: boolean) => Promise<void>;
  importDelimited: (
    content: string,
    fileName: string,
    options: ImportOptions
  ) => Promise<WorkspaceSnapshot | null>;
  importExcel: (
    bytes: Uint8Array,
    fileName: string,
    sheetName?: string
  ) => Promise<void>;
  load3DSample: () => Promise<void>;
  exportPlotPdf: (plotId: string, plotName: string) => Promise<void>;
  updateCell: (
    datasetId: string,
    colId: string,
    rowIndex: number,
    rawValue: string
  ) => Promise<void>;
  mutateDataset: (datasetId: string, mutation: DatasetMutation) => Promise<void>;
  createPlot: (
    name: string,
    datasetId: string,
    xColId: string,
    yColId: string,
    yErrColId: string | null,
    plotType: PlotType,
    zColId?: string | null,
    yColIds?: string[] | null
  ) => Promise<void>;
  updatePlot: (plot: PlotDocument) => Promise<void>;
  duplicatePlot: (plotId: string) => Promise<void>;
  executeCurveFit: (
    config: FitConfiguration,
    customName?: string,
    targetPlotId?: string
  ) => Promise<void>;
  deleteEntity: (kind: "plot" | "analysis", id: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  saveProjectQuick: () => Promise<void>;
  exportProjectFile: () => Promise<void>;
  openProjectWithDialog: () => Promise<boolean>;
  importProjectFile: (bytes: Uint8Array, fileName: string) => Promise<void>;
}

function deriveTabsFromProject(
  project: Project,
  existingTabs: WorkspaceTab[]
): WorkspaceTab[] {
  const validItems = new Map<string, WorkspaceTab>();
  for (const ws of project.worksheets) {
    validItems.set(ws.id, { id: ws.id, kind: "worksheet", title: ws.name });
  }
  for (const pl of project.plots) {
    validItems.set(pl.id, { id: pl.id, kind: "plot", title: pl.name });
  }
  for (const ana of project.analyses) {
    validItems.set(ana.id, { id: ana.id, kind: "analysis", title: ana.name });
  }

  const nextTabs: WorkspaceTab[] = [];
  for (const t of existingTabs) {
    const updated = validItems.get(t.id);
    if (updated) {
      nextTabs.push(updated);
    }
  }

  // Ensure active_tab_id or at least default items are open
  if (nextTabs.length === 0) {
    for (const ws of project.worksheets) {
      nextTabs.push({ id: ws.id, kind: "worksheet", title: ws.name });
    }
    for (const pl of project.plots) {
      nextTabs.push({ id: pl.id, kind: "plot", title: pl.name });
    }
    for (const ana of project.analyses) {
      nextTabs.push({ id: ana.id, kind: "analysis", title: ana.name });
    }
  } else if (
    project.active_tab_id &&
    !nextTabs.some((t) => t.id === project.active_tab_id)
  ) {
    const item = validItems.get(project.active_tab_id);
    if (item) {
      nextTabs.push(item);
    }
  }

  return nextTabs;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  snapshot: null,
  openTabs: [],
  activeTabId: null,
  selectedColumnId: null,
  selectedPlotColumnIds: [],
  selectedLayerId: null,
  theme: "light",
  statusMessage: "Ready — Figrava v1.0 (Scientific Figures & Data Visualization)",
  statusLevel: "info",
  activeModal: "none",
  leftPanelWidth: 256,
  rightPanelWidth: 320,

  initialize: async () => {
    try {
      const snap = await tauriClient.getProjectState();
      const tabs = deriveTabsFromProject(snap.project, []);
      const isBlank =
        snap.project.datasets.length === 0 && snap.project.plots.length === 0;
      set({
        snapshot: snap,
        openTabs: tabs,
        activeTabId: snap.project.active_tab_id ?? tabs[0]?.id ?? null,
        statusMessage: isBlank
          ? "Ready — Figrava v1.0 (Scientific Figures & Data Visualization)"
          : `Loaded project "${snap.project.name}" (${snap.project.datasets.length} datasets, ${snap.project.plots.length} graphs)`,
        statusLevel: "info",
      });
    } catch (err) {
      set({
        statusMessage: `Initialization error: ${String(err)}`,
        statusLevel: "error",
      });
    }
  },

  syncSnapshot: (snap, msg) => {
    const currentTabs = get().openTabs;
    const nextTabs = deriveTabsFromProject(snap.project, currentTabs);
    const currentActive = get().activeTabId;
    const preferredActive =
      snap.project.active_tab_id &&
      nextTabs.some((t) => t.id === snap.project.active_tab_id)
        ? snap.project.active_tab_id
        : currentActive && nextTabs.some((t) => t.id === currentActive)
        ? currentActive
        : nextTabs[0]?.id ?? null;

    set({
      snapshot: snap,
      openTabs: nextTabs,
      activeTabId: preferredActive,
      ...(msg ? { statusMessage: msg, statusLevel: "success" as const } : {}),
    });
  },

  setStatus: (msg, level = "info") => {
    set({ statusMessage: msg, statusLevel: level });
    if (level === "error") {
      void tauriClient.showMessageBox("Figrava v1.0 — Error", msg, "error");
    } else if (level === "warning") {
      void tauriClient.showMessageBox("Figrava v1.0 — Warning", msg, "warning");
    }
  },

  reportError: (title, err) => {
    const cleanMsg = err instanceof Error ? err.message : String(err);
    set({ statusMessage: `${title}: ${cleanMsg}`, statusLevel: "error" });
    void tauriClient.showMessageBox(title, cleanMsg, "error");
  },

  setActiveModal: (modal) => set({ activeModal: modal }),
  setSelectedColumnId: (id) => set({ selectedColumnId: id }),
  setSelectedPlotColumnIds: (ids) => set({ selectedPlotColumnIds: ids }),
  togglePlotColumnSelection: (id) =>
    set((s) => ({
      selectedPlotColumnIds: s.selectedPlotColumnIds.includes(id)
        ? s.selectedPlotColumnIds.filter((c) => c !== id)
        : [...s.selectedPlotColumnIds, id],
    })),
  setSelectedLayerId: (id) => set({ selectedLayerId: id }),
  setLeftPanelWidth: (w) => set({ leftPanelWidth: Math.max(180, Math.min(420, w)) }),
  setRightPanelWidth: (w) => set({ rightPanelWidth: Math.max(240, Math.min(480, w)) }),

  toggleTheme: () =>
    set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),

  openTab: (id, kind, title) => {
    const existing = get().openTabs;
    if (!existing.some((t) => t.id === id)) {
      set({ openTabs: [...existing, { id, kind, title }], activeTabId: id });
    } else {
      set({ activeTabId: id });
    }
  },

  closeTab: (id) => {
    const next = get().openTabs.filter((t) => t.id !== id);
    const active = get().activeTabId;
    set({
      openTabs: next,
      activeTabId:
        active === id ? next[next.length - 1]?.id ?? null : active,
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  newProject: async (name, useSample) => {
    try {
      const currentSnap = get().snapshot;
      if (
        currentSnap &&
        currentSnap.dirty &&
        (currentSnap.project.datasets.length > 0 ||
          currentSnap.project.plots.length > 0)
      ) {
        const proceed = await tauriClient.confirmMessageBox(
          "Unsaved Project Changes — Figrava v1.0",
          `The current project "${currentSnap.project.name}" has unsaved changes.\n\nDo you want to discard unsaved changes and start a new project?`,
          "warning"
        );
        if (!proceed) return;
      }
      const snap = await tauriClient.newProject(name, useSample);
      const tabs = deriveTabsFromProject(snap.project, []);
      set({
        snapshot: snap,
        openTabs: tabs,
        activeTabId: tabs[0]?.id ?? null,
        selectedColumnId: null,
        selectedPlotColumnIds: [],
        selectedLayerId: null,
        statusMessage: `Created project "${snap.project.name}"`,
        statusLevel: "success",
      });
    } catch (err) {
      get().reportError("New Project Error — Figrava v1.0", err);
    }
  },

  importDelimited: async (content, fileName, options) => {
    try {
      const snap = await tauriClient.importDelimitedDataset(
        content,
        fileName,
        options
      );
      get().syncSnapshot(snap, `Imported dataset from "${fileName}"`);
      set({ activeModal: "none" });
      return snap;
    } catch (err) {
      get().reportError("Dataset Import Error — Figrava v1.0", err);
      return null;
    }
  },

  importExcel: async (bytes, fileName, sheetName) => {
    try {
      const snap = await tauriClient.importExcelDataset(
        bytes,
        fileName,
        sheetName
      );
      get().syncSnapshot(snap, `Imported Excel workbook "${fileName}"`);
      set({ activeModal: "none" });
    } catch (err) {
      get().reportError("Excel Import Error — Figrava v1.0", err);
    }
  },

  load3DSample: async () => {
    try {
      const snap = await tauriClient.load3DSample();
      get().syncSnapshot(
        snap,
        "Loaded 3D Potential Energy Surface & Contour Matrix sample"
      );
    } catch (err) {
      get().reportError("3D Sample Error — Figrava v1.0", err);
    }
  },

  exportPlotPdf: async (plotId, plotName) => {
    try {
      const bytes = await tauriClient.exportPlotPdf(plotId);
      const safeName =
        plotName.replace(/[^a-zA-Z0-9 _.-]+/g, "_").trim() || "figure";
      const savedPath = await tauriClient.saveFileWithDialog(
        `${safeName}.pdf`,
        "PDF Document (*.pdf)",
        ["pdf"],
        bytes,
        "Export Publication PDF Figure"
      );
      if (!savedPath) {
        set({
          statusMessage: "PDF export cancelled",
          statusLevel: "info",
        });
        return;
      }
      set({
        statusMessage: `Saved Vector PDF figure to "${savedPath}"`,
        statusLevel: "success",
      });
    } catch (err) {
      get().reportError("PDF Export Error — Figrava v1.0", err);
    }
  },

  updateCell: async (datasetId, colId, rowIndex, rawValue) => {
    try {
      const snap = await tauriClient.updateCell(
        datasetId,
        colId,
        rowIndex,
        rawValue
      );
      get().syncSnapshot(
        snap,
        `Updated cell (Row ${rowIndex + 1}) & recalculated dependent analyses`
      );
    } catch (err) {
      get().reportError("Cell Update Error — Figrava v1.0", err);
    }
  },

  mutateDataset: async (datasetId, mutation) => {
    try {
      const snap = await tauriClient.datasetStructureAction(
        datasetId,
        mutation
      );
      get().syncSnapshot(snap, `Applied dataset operation: ${mutation.action}`);
    } catch (err) {
      get().reportError("Worksheet Operation Error — Figrava v1.0", err);
    }
  },

  createPlot: async (
    name,
    datasetId,
    xColId,
    yColId,
    yErrColId,
    plotType,
    zColId = null,
    yColIds = null
  ) => {
    try {
      const snap = await tauriClient.createPlot(
        name,
        datasetId,
        xColId,
        yColId,
        yErrColId,
        plotType,
        zColId,
        yColIds
      );
      const count =
        yColIds && yColIds.length > 1 ? ` (${yColIds.length} series)` : "";
      get().syncSnapshot(snap, `Created graph "${name}"${count}`);
      set({ activeModal: "none" });
    } catch (err) {
      get().reportError("Create Graph Error — Figrava v1.0", err);
    }
  },

  updatePlot: async (plot) => {
    try {
      const snap = await tauriClient.updatePlotDocument(plot);
      get().syncSnapshot(snap, `Updated figure "${plot.name}"`);
    } catch (err) {
      get().reportError("Update Figure Error — Figrava v1.0", err);
    }
  },

  duplicatePlot: async (plotId) => {
    try {
      const snap = await tauriClient.duplicatePlotDocument(plotId);
      get().syncSnapshot(snap, "Duplicated graph");
    } catch (err) {
      get().reportError("Duplicate Figure Error — Figrava v1.0", err);
    }
  },

  executeCurveFit: async (config, customName, targetPlotId) => {
    try {
      const snap = await tauriClient.executeCurveFit(
        config,
        customName,
        targetPlotId
      );
      get().syncSnapshot(
        snap,
        `Completed curve fit (${config.model.model_type.toUpperCase()})`
      );
      set({ activeModal: "none" });
    } catch (err) {
      get().reportError("Curve Fitting Error — Figrava v1.0", err);
    }
  },

  deleteEntity: async (kind, id) => {
    try {
      const snapBefore = get().snapshot;
      const itemLabel =
        kind === "plot"
          ? snapBefore?.project.plots.find((p) => p.id === id)?.name ?? "figure"
          : snapBefore?.project.analyses.find((a) => a.id === id)?.name ??
            "analysis report";
      const confirmed = await tauriClient.confirmMessageBox(
        "Confirm Delete — Figrava v1.0",
        `Are you sure you want to delete "${itemLabel}" from the project?`,
        "warning"
      );
      if (!confirmed) return;

      get().closeTab(id);
      const snap = await tauriClient.deleteEntity(kind, id);
      get().syncSnapshot(snap, `Deleted ${kind} "${itemLabel}"`);
    } catch (err) {
      get().reportError("Delete Error — Figrava v1.0", err);
    }
  },

  undo: async () => {
    try {
      const snap = await tauriClient.undo();
      get().syncSnapshot(snap, "Undid last action");
    } catch (err) {
      get().reportError("Undo Error — Figrava v1.0", err);
    }
  },

  redo: async () => {
    try {
      const snap = await tauriClient.redo();
      get().syncSnapshot(snap, "Redid action");
    } catch (err) {
      get().reportError("Redo Error — Figrava v1.0", err);
    }
  },

  saveProjectQuick: async () => {
    const snap = get().snapshot;
    if (!snap) return;
    if (snap.project_path) {
      try {
        const savedSnap = await tauriClient.saveProjectDirect(snap.project_path);
        set({
          snapshot: savedSnap,
          statusMessage: `Saved project to "${savedSnap.project_path}"`,
          statusLevel: "success",
        });
      } catch (err) {
        get().reportError("Project Save Error — Figrava v1.0", err);
      }
    } else {
      await get().exportProjectFile();
    }
  },

  exportProjectFile: async () => {
    try {
      const snap = get().snapshot;
      if (!snap) return;
      const savedSnap = await tauriClient.saveProjectWithDialog(
        snap.project.name
      );
      if (!savedSnap) {
        set({
          statusMessage: "Project save cancelled",
          statusLevel: "info",
        });
        return;
      }
      set({
        snapshot: savedSnap,
        statusMessage: `Saved project to "${savedSnap.project_path ?? `${snap.project.name}.spsproj`}"`,
        statusLevel: "success",
      });
    } catch (err) {
      get().reportError("Project Save Error — Figrava v1.0", err);
    }
  },

  openProjectWithDialog: async () => {
    try {
      const snap = await tauriClient.openProjectWithDialog();
      if (!snap) {
        return false;
      }
      const tabs = deriveTabsFromProject(snap.project, []);
      set({
        snapshot: snap,
        openTabs: tabs,
        activeTabId: tabs[0]?.id ?? null,
        statusMessage: `Opened project "${snap.project.name}"${
          snap.project_path ? ` from "${snap.project_path}"` : ""
        }`,
        statusLevel: "success",
      });
      return true;
    } catch (err) {
      get().reportError("Open Project Error — Figrava v1.0", err);
      return false;
    }
  },

  importProjectFile: async (bytes, fileName) => {
    try {
      const snap = await tauriClient.importProjectBytes(bytes, fileName);
      const tabs = deriveTabsFromProject(snap.project, []);
      set({
        snapshot: snap,
        openTabs: tabs,
        activeTabId: tabs[0]?.id ?? null,
        statusMessage: `Opened project "${snap.project.name}" from ${fileName}`,
        statusLevel: "success",
      });
    } catch (err) {
      get().reportError("Open Project Error — Figrava v1.0", err);
    }
  },
}));
