import React, { useState } from "react";
import {
  Table2,
  LineChart,
  TrendingUp,
  Copy,
  Trash2,
  FolderTree,
  Plus,
  FileText,
  Calculator,
  Sigma,
  Upload,
  FilePlus,
} from "lucide-react";
import { useWorkspaceStore } from "../stores/useWorkspaceStore";
import {
  DesktopContextMenu,
  type ContextMenuEntry,
} from "./DesktopContextMenu";

export const ProjectExplorer: React.FC = () => {
  const {
    snapshot,
    activeTabId,
    openTab,
    setActiveModal,
    duplicatePlot,
    deleteEntity,
    exportPlotPdf,
    newProject,
  } = useWorkspaceStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title: string;
    items: ContextMenuEntry[];
  } | null>(null);

  if (!snapshot) return null;
  const { project } = snapshot;

  const openExplorerBackgroundMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: "Project Explorer",
      items: [
        {
          id: "imp-ds",
          label: "Import CSV / TSV / Excel Dataset...",
          shortcut: "Ctrl+I",
          icon: <Upload className="w-3.5 h-3.5 text-sky-600" />,
          action: () => setActiveModal("import_csv"),
        },
        {
          id: "new-plot",
          label: "Create New Scientific Graph...",
          shortcut: "Ctrl+P",
          icon: <LineChart className="w-3.5 h-3.5 text-indigo-600" />,
          disabled: project.datasets.length === 0,
          action: () => setActiveModal("new_plot"),
        },
        {
          id: "new-fit",
          label: "Run Curve Fitting...",
          shortcut: "Ctrl+F",
          icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />,
          disabled: project.datasets.length === 0,
          action: () => setActiveModal("curve_fit"),
        },
        { id: "div-1", divider: true },
        {
          id: "new-proj",
          label: "New Blank Project",
          shortcut: "Ctrl+N",
          icon: <FilePlus className="w-3.5 h-3.5" />,
          action: () => void newProject("Untitled Project", false),
        },
      ],
    });
  };

  return (
    <aside
      onContextMenu={openExplorerBackgroundMenu}
      className="h-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-xs overflow-y-auto"
    >
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <FolderTree className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Project Explorer</span>
        </div>
      </div>

      <div className="p-2 space-y-4 flex-1">
        {/* Workbooks Section */}
        <div>
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Workbooks ({project.worksheets.length})</span>
            <button
              type="button"
              onClick={() => setActiveModal("import_csv")}
              title="Import CSV/TSV Dataset"
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {project.worksheets.map((ws) => {
              const ds = project.datasets.find((d) => d.id === ws.dataset_id);
              const rows = ds
                ? Math.max(0, ...ds.columns.map((c) => c.values.length))
                : 0;
              const cols = ds ? ds.columns.length : 0;
              const isActive = activeTabId === ws.id;

              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => openTab(ws.id, "worksheet", ws.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openTab(ws.id, "worksheet", ws.name);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      title: `Workbook: ${ws.name}`,
                      items: [
                        {
                          id: "open-ws",
                          label: "Open Worksheet",
                          icon: <Table2 className="w-3.5 h-3.5 text-sky-600" />,
                          action: () => openTab(ws.id, "worksheet", ws.name),
                        },
                        {
                          id: "plot-ws",
                          label: "Create Graph from Workbook...",
                          shortcut: "Ctrl+P",
                          icon: (
                            <LineChart className="w-3.5 h-3.5 text-indigo-600" />
                          ),
                          action: () => setActiveModal("new_plot"),
                        },
                        {
                          id: "fit-ws",
                          label: "Run Curve Fitting...",
                          shortcut: "Ctrl+F",
                          icon: (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          ),
                          action: () => setActiveModal("curve_fit"),
                        },
                        { id: "div-ws", divider: true },
                        {
                          id: "trans-ws",
                          label: "Formula / Mathematical Transform...",
                          icon: (
                            <Calculator className="w-3.5 h-3.5 text-orange-600" />
                          ),
                          action: () => setActiveModal("transform_column"),
                        },
                        {
                          id: "stats-ws",
                          label: "Descriptive Column Statistics...",
                          icon: (
                            <Sigma className="w-3.5 h-3.5 text-emerald-600" />
                          ),
                          action: () => setActiveModal("column_stats"),
                        },
                      ],
                    });
                  }}
                  className={`w-full px-2.5 py-1.5 rounded flex items-center justify-between text-left transition-colors ${
                    isActive
                      ? "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-medium"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Table2 className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                    <span className="truncate">{ws.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                    {rows}×{cols}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Graphs Section */}
        <div>
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Graphs ({project.plots.length})</span>
            <button
              type="button"
              onClick={() => setActiveModal("new_plot")}
              title="Create New Graph"
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {project.plots.map((plot) => {
              const isActive = activeTabId === plot.id;
              return (
                <div
                  key={plot.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openTab(plot.id, "plot", plot.name);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      title: `Graph: ${plot.name}`,
                      items: [
                        {
                          id: "open-pl",
                          label: "Open Figure",
                          icon: (
                            <LineChart className="w-3.5 h-3.5 text-indigo-600" />
                          ),
                          action: () => openTab(plot.id, "plot", plot.name),
                        },
                        {
                          id: "dup-pl",
                          label: "Duplicate Figure",
                          icon: <Copy className="w-3.5 h-3.5" />,
                          action: () => void duplicatePlot(plot.id),
                        },
                        {
                          id: "pdf-pl",
                          label: "Export Vector PDF (.pdf)...",
                          icon: (
                            <FileText className="w-3.5 h-3.5 text-rose-600" />
                          ),
                          action: () => void exportPlotPdf(plot.id, plot.name),
                        },
                        { id: "div-pl", divider: true },
                        {
                          id: "del-pl",
                          label: "Delete Figure...",
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          danger: true,
                          action: () => void deleteEntity("plot", plot.id),
                        },
                      ],
                    });
                  }}
                  className={`group px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                    isActive
                      ? "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-medium"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openTab(plot.id, "plot", plot.name)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <LineChart className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="truncate">{plot.name}</span>
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => duplicatePlot(plot.id)}
                      title="Duplicate Graph"
                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteEntity("plot", plot.id)}
                      title="Delete Graph"
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Analysis Section */}
        <div>
          <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <span>Analysis ({project.analyses.length})</span>
            <button
              type="button"
              onClick={() => setActiveModal("curve_fit")}
              title="New Curve Fit"
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {project.analyses.map((ana) => {
              const isActive = activeTabId === ana.id;
              return (
                <div
                  key={ana.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openTab(ana.id, "analysis", ana.name);
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      title: `Analysis: ${ana.name}`,
                      items: [
                        {
                          id: "open-ana",
                          label: "Open Analysis Report",
                          icon: (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          ),
                          action: () => openTab(ana.id, "analysis", ana.name),
                        },
                        { id: "div-ana", divider: true },
                        {
                          id: "del-ana",
                          label: "Delete Analysis Report...",
                          icon: <Trash2 className="w-3.5 h-3.5" />,
                          danger: true,
                          action: () => void deleteEntity("analysis", ana.id),
                        },
                      ],
                    });
                  }}
                  className={`group px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                    isActive
                      ? "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-medium"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openTab(ana.id, "analysis", ana.name)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  >
                    <TrendingUp className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate">{ana.name}</span>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                      R²={ana.diagnostics.r_squared.toFixed(3)}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteEntity("analysis", ana.id)}
                      title="Delete Analysis"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950 text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
    </aside>
  );
};
