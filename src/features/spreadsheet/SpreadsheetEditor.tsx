import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Plus,
  Trash2,
  ArrowUpAZ,
  ArrowDownZA,
  Download,
  ScatterChart,
  TrendingUp,
  Copy,
  Calculator,
  Filter,
  LineChart,
  Sigma,
  ClipboardPaste,
  Edit3,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import { tauriClient } from "../../services/tauriClient";
import {
  DesktopContextMenu,
  type ContextMenuEntry,
} from "../../components/DesktopContextMenu";
import type { CellValue, ColumnRole, Dataset, Worksheet } from "../../types/scientific";

interface SpreadsheetEditorProps {
  worksheet: Worksheet;
  dataset: Dataset;
}

const ROLE_LABELS: Record<ColumnRole, { badge: string; color: string }> = {
  x: {
    badge: "X",
    color: "bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-200",
  },
  y: {
    badge: "Y",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200",
  },
  y_error: {
    badge: "yErr",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200",
  },
  x_error: {
    badge: "xErr",
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/70 dark:text-orange-200",
  },
  label: {
    badge: "Lbl",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/70 dark:text-purple-200",
  },
  z: {
    badge: "Z",
    color:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/70 dark:text-indigo-200",
  },
  none: {
    badge: "—",
    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

function formatCellValue(cell: CellValue | undefined): string {
  if (!cell || cell.kind === "missing") return "";
  if (cell.kind === "text") return cell.value;
  const v = cell.value;
  if (Math.abs(v) >= 1e6 || (Math.abs(v) > 0 && Math.abs(v) < 1e-4)) {
    return v.toExponential(4);
  }
  return `${Number(v.toPrecision(8))}`;
}

export const SpreadsheetEditor: React.FC<SpreadsheetEditorProps> = ({
  dataset,
}) => {
  const {
    selectedColumnId,
    setSelectedColumnId,
    selectedPlotColumnIds,
    setSelectedPlotColumnIds,
    togglePlotColumnSelection,
    updateCell,
    mutateDataset,
    createPlot,
    setActiveModal,
    setStatus,
  } = useWorkspaceStore();

  const activeColId = selectedColumnId ?? dataset.columns[0]?.id ?? null;

  // Compute effective selected column IDs for this dataset (OriginPro style)
  const datasetColIds = useMemo(
    () => new Set(dataset.columns.map((c) => c.id)),
    [dataset.columns]
  );

  const effectivePlotColIds = useMemo(() => {
    const valid = selectedPlotColumnIds.filter((id) => datasetColIds.has(id));
    if (valid.length > 0) return valid;
    // Default OriginPro selection: X column + all Y and Z columns
    return dataset.columns
      .filter((c) => c.role === "x" || c.role === "y" || c.role === "z")
      .map((c) => c.id);
  }, [selectedPlotColumnIds, datasetColIds, dataset.columns]);

  const selectedYCols = useMemo(
    () =>
      dataset.columns.filter(
        (c) => effectivePlotColIds.includes(c.id) && c.role === "y"
      ),
    [dataset.columns, effectivePlotColIds]
  );

  const handleToggleColForPlot = (colId: string) => {
    const current = effectivePlotColIds;
    if (current.includes(colId)) {
      setSelectedPlotColumnIds(current.filter((id) => id !== colId));
    } else {
      setSelectedPlotColumnIds([...current, colId]);
    }
  };

  const handleQuickPlotSelected = async (
    quickType: "scatter" | "line" | "line_symbols"
  ) => {
    const xCol =
      dataset.columns.find(
        (c) => effectivePlotColIds.includes(c.id) && c.role === "x"
      ) ??
      dataset.columns.find((c) => c.role === "x") ??
      dataset.columns[0];
    const yCols =
      selectedYCols.length > 0
        ? selectedYCols
        : dataset.columns.filter((c) => c.id !== xCol?.id && c.role === "y");
    const fallbackY = yCols[0] ?? dataset.columns[1] ?? dataset.columns[0];
    if (!xCol || !fallbackY) return;

    const targetYIds =
      yCols.length > 0 ? yCols.map((c) => c.id) : [fallbackY.id];
    const errCol = dataset.columns.find(
      (c) =>
        effectivePlotColIds.includes(c.id) && c.role === "y_error"
    );
    await createPlot(
      `${dataset.name} (${targetYIds.length > 1 ? `${targetYIds.length} Series` : fallbackY.name})`,
      dataset.id,
      xCol.id,
      targetYIds[0],
      errCol?.id ?? null,
      quickType,
      null,
      targetYIds
    );
  };

  const [editingCell, setEditingCell] = useState<{
    colId: string;
    rowIndex: number;
    draft: string;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title: string;
    items: ContextMenuEntry[];
  } | null>(null);

  const [filterText, setFilterText] = useState("");
  const parentRef = useRef<HTMLDivElement | null>(null);

  const openColumnContextMenu = (
    e: React.MouseEvent,
    colId: string,
    colLetter: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedColumnId(colId);
    const col = dataset.columns.find((c) => c.id === colId);
    if (!col) return;
    const isChecked = effectivePlotColIds.includes(col.id);
    const roleMeta = ROLE_LABELS[col.role];

    const items: ContextMenuEntry[] = [
      {
        id: "toggle-plot-col",
        label: isChecked
          ? `Uncheck ${colLetter}(${roleMeta.badge}) from Plot Selection`
          : `Include ${colLetter}(${roleMeta.badge}) in Plot Selection`,
        icon: <ScatterChart className="w-3.5 h-3.5 text-sky-600" />,
        action: () => handleToggleColForPlot(col.id),
      },
      {
        id: "plot-scatter",
        label: `Plot Selected Columns as Scatter (${selectedYCols.length || 1} Series)`,
        icon: <ScatterChart className="w-3.5 h-3.5 text-indigo-600" />,
        action: () => void handleQuickPlotSelected("scatter"),
      },
      {
        id: "plot-line-sym",
        label: "Plot Selected Columns as Line + Symbols",
        icon: <LineChart className="w-3.5 h-3.5 text-emerald-600" />,
        action: () => void handleQuickPlotSelected("line_symbols"),
      },
      {
        id: "plot-setup",
        label: "Open Plot Setup Dialog...",
        shortcut: "Ctrl+P",
        icon: <LineChart className="w-3.5 h-3.5 text-sky-600" />,
        action: () => {
          setSelectedPlotColumnIds(effectivePlotColIds);
          setActiveModal("new_plot");
        },
      },
      { id: "div-role", divider: true },
      { id: "hdr-role", header: "Assign Column Role (OriginPro Style)" },
      {
        id: "role-x",
        label: "Set as [X] Independent Axis",
        disabled: col.role === "x",
        action: () =>
          void mutateDataset(dataset.id, {
            action: "set_column_role",
            col_id: col.id,
            role: "x",
          }),
      },
      {
        id: "role-y",
        label: "Set as [Y] Dependent Series",
        disabled: col.role === "y",
        action: () =>
          void mutateDataset(dataset.id, {
            action: "set_column_role",
            col_id: col.id,
            role: "y",
          }),
      },
      {
        id: "role-z",
        label: "Set as [Z] 3D / Matrix Surface",
        disabled: col.role === "z",
        action: () =>
          void mutateDataset(dataset.id, {
            action: "set_column_role",
            col_id: col.id,
            role: "z",
          }),
      },
      {
        id: "role-yerr",
        label: "Set as [yErr] Y Error Bars",
        disabled: col.role === "y_error",
        action: () =>
          void mutateDataset(dataset.id, {
            action: "set_column_role",
            col_id: col.id,
            role: "y_error",
          }),
      },
      { id: "div-ops", divider: true },
      { id: "hdr-ops", header: "Column Operations" },
      {
        id: "sort-asc",
        label: "Sort Worksheet Ascending (A → Z)",
        icon: <ArrowUpAZ className="w-3.5 h-3.5" />,
        action: () =>
          void mutateDataset(dataset.id, {
            action: "sort_by_column",
            col_id: col.id,
            ascending: true,
          }),
      },
      {
        id: "sort-desc",
        label: "Sort Worksheet Descending (Z → A)",
        icon: <ArrowDownZA className="w-3.5 h-3.5" />,
        action: () =>
          void mutateDataset(dataset.id, {
            action: "sort_by_column",
            col_id: col.id,
            ascending: false,
          }),
      },
      {
        id: "col-transform",
        label: "Formula / Mathematical Transform...",
        icon: <Calculator className="w-3.5 h-3.5 text-orange-600" />,
        action: () => setActiveModal("transform_column"),
      },
      {
        id: "col-stats",
        label: "Descriptive Column Statistics...",
        icon: <Sigma className="w-3.5 h-3.5 text-emerald-600" />,
        action: () => setActiveModal("column_stats"),
      },
      {
        id: "dup-col",
        label: "Duplicate Column",
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () =>
          void mutateDataset(dataset.id, {
            action: "duplicate_column",
            col_id: col.id,
          }),
      },
      {
        id: "add-col",
        label: "Insert New Y Column",
        icon: <Plus className="w-3.5 h-3.5 text-emerald-600" />,
        action: () =>
          void mutateDataset(dataset.id, {
            action: "add_column",
            name: `Col${dataset.columns.length + 1}`,
            role: "y",
            unit: null,
          }),
      },
      {
        id: "del-col",
        label: `Delete Column "${col.name}"`,
        icon: <Trash2 className="w-3.5 h-3.5" />,
        danger: true,
        disabled: dataset.columns.length <= 1,
        action: () =>
          void mutateDataset(dataset.id, {
            action: "remove_column",
            col_id: col.id,
          }),
      },
    ];

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: `Column ${colLetter}(${roleMeta.badge}): ${col.name}`,
      items,
    });
  };

  const openCellContextMenu = (
    e: React.MouseEvent,
    colId: string,
    rowIndex: number,
    cell: CellValue | undefined
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedColumnId(colId);
    const col = dataset.columns.find((c) => c.id === colId);
    const formatted = formatCellValue(cell);

    const items: ContextMenuEntry[] = [
      {
        id: "edit-cell",
        label: "Edit Cell Value",
        icon: <Edit3 className="w-3.5 h-3.5 text-sky-600" />,
        action: () =>
          setEditingCell({
            colId,
            rowIndex,
            draft: formatted,
          }),
      },
      {
        id: "copy-cell",
        label: formatted ? `Copy Value "${formatted}"` : "Copy Cell Value",
        shortcut: "Ctrl+C",
        icon: <Copy className="w-3.5 h-3.5" />,
        disabled: !formatted,
        action: () => {
          if (navigator.clipboard) {
            void navigator.clipboard.writeText(formatted);
            setStatus(`Copied "${formatted}" to clipboard`, "info");
          }
        },
      },
      {
        id: "paste-cell",
        label: "Paste Value from Clipboard",
        shortcut: "Ctrl+V",
        icon: <ClipboardPaste className="w-3.5 h-3.5" />,
        action: async () => {
          try {
            if (navigator.clipboard) {
              const clipText = await navigator.clipboard.readText();
              if (clipText !== undefined) {
                await updateCell(dataset.id, colId, rowIndex, clipText.trim());
              }
            }
          } catch {
            // Ignore clipboard permission errors
          }
        },
      },
      {
        id: "clear-cell",
        label: "Clear Cell Value (Set Missing)",
        shortcut: "Del",
        disabled: !cell || cell.kind === "missing",
        action: () => void updateCell(dataset.id, colId, rowIndex, ""),
      },
      { id: "div-row", divider: true },
      { id: "hdr-row", header: `Row #${rowIndex + 1} Operations` },
      {
        id: "add-row",
        label: "Append New Row at Bottom",
        icon: <Plus className="w-3.5 h-3.5 text-sky-600" />,
        action: () => void mutateDataset(dataset.id, { action: "add_row" }),
      },
      {
        id: "del-row",
        label: `Delete Row #${rowIndex + 1}`,
        icon: <Trash2 className="w-3.5 h-3.5" />,
        danger: true,
        action: () =>
          void mutateDataset(dataset.id, {
            action: "delete_row",
            row_index: rowIndex,
          }),
      },
      { id: "div-plot", divider: true },
      { id: "hdr-plot", header: "Plot & Analysis" },
      {
        id: "quick-scatter",
        label: `Plot Selected Columns (${selectedYCols.length || 1} Series)`,
        icon: <ScatterChart className="w-3.5 h-3.5 text-sky-600" />,
        action: () => void handleQuickPlotSelected("scatter"),
      },
      {
        id: "quick-fit",
        label: "Run Curve Fitting on Dataset...",
        shortcut: "Ctrl+F",
        icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />,
        action: () => setActiveModal("curve_fit"),
      },
      {
        id: "export-csv",
        label: "Export Worksheet as CSV...",
        icon: <Download className="w-3.5 h-3.5" />,
        action: () => void handleExportDelimited(","),
      },
      {
        id: "export-tsv",
        label: "Export Worksheet as TSV...",
        icon: <Download className="w-3.5 h-3.5" />,
        action: () => void handleExportDelimited("\t"),
      },
    ];

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: `Cell [Row ${rowIndex + 1}, ${col?.name ?? "Col"}]`,
      items,
    });
  };

  const totalRows = useMemo(
    () => Math.max(0, ...dataset.columns.map((c) => c.values.length)),
    [dataset.columns]
  );

  const visibleRowIndices = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) {
      return Array.from({ length: totalRows }, (_, i) => i);
    }
    const indices: number[] = [];
    for (let r = 0; r < totalRows; r++) {
      const matches = dataset.columns.some((col) =>
        formatCellValue(col.values[r]).toLowerCase().includes(q)
      );
      if (matches) indices.push(r);
    }
    return indices;
  }, [dataset.columns, totalRows, filterText]);

  const rowVirtualizer = useVirtualizer({
    count: visibleRowIndices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 15,
  });

  const commitCellEdit = async () => {
    if (!editingCell) return;
    const { colId, rowIndex, draft } = editingCell;
    setEditingCell(null);
    await updateCell(dataset.id, colId, rowIndex, draft);
  };

  const handleExportDelimited = async (delimiter: "," | "\t") => {
    try {
      const content = await tauriClient.exportDatasetDelimited(
        dataset.id,
        delimiter
      );
      const ext = delimiter === "," ? "csv" : "tsv";
      const filterName =
        ext === "csv"
          ? "Comma-Separated Values (*.csv)"
          : "Tab-Separated Values (*.tsv)";
      const safeName =
        dataset.name.replace(/[^a-zA-Z0-9 _.-]+/g, "_").trim() || "dataset";
      const bytes = new TextEncoder().encode(content);
      const savedPath = await tauriClient.saveFileWithDialog(
        `${safeName}.${ext}`,
        filterName,
        [ext],
        bytes,
        `Export Dataset as ${ext.toUpperCase()}`
      );
      if (!savedPath) {
        setStatus(`${ext.toUpperCase()} export cancelled`, "info");
        return;
      }
      setStatus(`Saved dataset to "${savedPath}"`, "success");
    } catch (err) {
      setStatus(`Export failed: ${String(err)}`, "error");
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-950 text-xs">
      {/* Worksheet Action Bar */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => mutateDataset(dataset.id, { action: "add_row" })}
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            <Plus className="w-3 h-3 text-sky-600" />
            <span>Add Row</span>
          </button>

          <button
            type="button"
            disabled={totalRows === 0}
            onClick={() =>
              mutateDataset(dataset.id, {
                action: "delete_row",
                row_index: Math.max(0, totalRows - 1),
              })
            }
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200"
          >
            <Trash2 className="w-3 h-3 text-red-500" />
            <span>Remove Last Row</span>
          </button>

          <button
            type="button"
            onClick={() =>
              mutateDataset(dataset.id, {
                action: "add_column",
                name: `Col${dataset.columns.length + 1}`,
                role: "y",
                unit: null,
              })
            }
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            <Plus className="w-3 h-3 text-emerald-600" />
            <span>Add Column</span>
          </button>

          {activeColId && (
            <>
              <button
                type="button"
                onClick={() =>
                  mutateDataset(dataset.id, {
                    action: "duplicate_column",
                    col_id: activeColId,
                  })
                }
                title="Duplicate Selected Column"
                className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                <Copy className="w-3 h-3" />
                <span>Duplicate Col</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  mutateDataset(dataset.id, {
                    action: "sort_by_column",
                    col_id: activeColId,
                    ascending: true,
                  })
                }
                title="Sort Ascending by Selected Column"
                className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                <ArrowUpAZ className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() =>
                  mutateDataset(dataset.id, {
                    action: "sort_by_column",
                    col_id: activeColId,
                    ascending: false,
                  })
                }
                title="Sort Descending by Selected Column"
                className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                <ArrowDownZA className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

          {/* OriginPro Multi-Column Selection & Plot Bar */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200/80 dark:border-sky-800/80">
            <span className="text-[11px] font-medium text-sky-800 dark:text-sky-200">
              Plot Cols ({selectedYCols.length} Y):
            </span>
            <button
              type="button"
              onClick={() =>
                setSelectedPlotColumnIds(
                  dataset.columns
                    .filter((c) => c.role === "x" || c.role === "y" || c.role === "z")
                    .map((c) => c.id)
                )
              }
              className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-sky-100 dark:hover:bg-slate-700"
              title="Select X and all Y columns for plotting"
            >
              All Y
            </button>
            <button
              type="button"
              onClick={() => {
                const xCol =
                  dataset.columns.find((c) => c.role === "x") ?? dataset.columns[0];
                const firstY = dataset.columns.find(
                  (c) => c.role === "y" && c.id !== xCol?.id
                );
                setSelectedPlotColumnIds(
                  [xCol?.id, firstY?.id].filter((v): v is string => Boolean(v))
                );
              }}
              className="px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-sky-100 dark:hover:bg-slate-700"
              title="Select only X and first Y column"
            >
              1st Y
            </button>
            <button
              type="button"
              onClick={() => handleQuickPlotSelected("scatter")}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-semibold"
              title="Immediately plot all checked columns as XY Scatter"
            >
              <ScatterChart className="w-3 h-3" />
              <span>Plot Selected ({selectedYCols.length || 1})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPlotColumnIds(effectivePlotColIds);
                setActiveModal("new_plot");
              }}
              className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 hover:bg-sky-100 font-medium"
              title="Open Plot Setup dialog with selected columns"
            >
              Plot Setup...
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal("transform_column")}
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            <Calculator className="w-3 h-3 text-orange-600" />
            <span>Formula / Transform</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("curve_fit")}
            className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
          >
            <TrendingUp className="w-3 h-3" />
            <span>Fit Curve</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Filter className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter rows..."
              className="pl-6 pr-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-36 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="button"
            onClick={() => handleExportDelimited(",")}
            className="flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Virtualized Grid Container */}
      <div
        ref={parentRef}
        onContextMenu={(e) => {
          const firstCol = dataset.columns[0];
          if (firstCol) {
            openColumnContextMenu(e, activeColId ?? firstCol.id, "A");
          }
        }}
        className="flex-1 overflow-auto relative"
      >
        <div
          style={{
            minWidth: `${64 + dataset.columns.length * 168}px`,
          }}
        >
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 border-b border-slate-300 dark:border-slate-700 flex">
            <div className="w-16 shrink-0 px-2 py-2 border-r border-slate-200 dark:border-slate-800 font-semibold text-center text-slate-500">
              Row
            </div>

            {dataset.columns.map((col, colIdx) => {
              const isSelected = activeColId === col.id;
              const isPlotChecked = effectivePlotColIds.includes(col.id);
              const roleMeta = ROLE_LABELS[col.role];
              const colLetter = String.fromCharCode(65 + (colIdx % 26));
              return (
                <div
                  key={col.id}
                  onClick={(e) => {
                    setSelectedColumnId(col.id);
                    if (e.ctrlKey || e.metaKey) {
                      togglePlotColumnSelection(col.id);
                    }
                  }}
                  onContextMenu={(e) => openColumnContextMenu(e, col.id, colLetter)}
                  className={`w-44 shrink-0 px-2.5 py-1.5 border-r border-slate-200 dark:border-slate-800 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-sky-50/90 dark:bg-sky-950/60"
                      : isPlotChecked
                      ? "bg-emerald-50/40 dark:bg-emerald-950/20"
                      : "hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <label
                      className="flex items-center gap-1.5 truncate cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                      title={`Check to include ${colLetter}(${roleMeta.badge}): ${col.name} when plotting`}
                    >
                      <input
                        type="checkbox"
                        checked={isPlotChecked}
                        onChange={() => handleToggleColForPlot(col.id)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                        {colLetter}({roleMeta.badge})
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {col.name}
                      </span>
                    </label>
                    <select
                      value={col.role}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        mutateDataset(dataset.id, {
                          action: "set_column_role",
                          col_id: col.id,
                          role: e.target.value as ColumnRole,
                        })
                      }
                      aria-label={`Role for ${col.name}`}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer border-0 ${roleMeta.color}`}
                    >
                      <option value="x">[X]</option>
                      <option value="y">[Y]</option>
                      <option value="z">[Z]</option>
                      <option value="y_error">[yErr]</option>
                      <option value="x_error">[xErr]</option>
                      <option value="label">[Label]</option>
                      <option value="none">[None]</option>
                    </select>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{col.unit ? `Unit: ${col.unit}` : "Unit: —"}</span>
                    {col.formula && (
                      <span
                        className="text-orange-600 dark:text-orange-400 truncate max-w-[90px]"
                        title={`Formula: ${col.formula}`}
                      >
                        fx: {col.formula}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Virtualized Rows */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowIndex = visibleRowIndices[virtualRow.index];
              return (
                <div
                  key={rowIndex}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex border-b border-slate-100 dark:border-slate-800/70 hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                >
                  <div
                    onContextMenu={(e) => {
                      const col = dataset.columns[0];
                      if (col) {
                        openCellContextMenu(
                          e,
                          activeColId ?? col.id,
                          rowIndex,
                          col.values[rowIndex]
                        );
                      }
                    }}
                    className="w-16 shrink-0 px-2 flex items-center justify-center border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-400 font-mono text-[11px] cursor-context-menu"
                  >
                    {rowIndex + 1}
                  </div>

                  {dataset.columns.map((col) => {
                    const cell = col.values[rowIndex];
                    const isEditing =
                      editingCell?.colId === col.id &&
                      editingCell?.rowIndex === rowIndex;
                    const isColSelected = activeColId === col.id;

                    return (
                      <div
                        key={col.id}
                        onClick={() => {
                          setSelectedColumnId(col.id);
                          if (!isEditing) {
                            setEditingCell({
                              colId: col.id,
                              rowIndex,
                              draft: formatCellValue(cell),
                            });
                          }
                        }}
                        onContextMenu={(e) =>
                          openCellContextMenu(e, col.id, rowIndex, cell)
                        }
                        className={`w-44 shrink-0 border-r border-slate-100 dark:border-slate-800/80 flex items-center px-2 font-mono text-xs ${
                          isColSelected
                            ? "bg-sky-50/25 dark:bg-sky-950/15"
                            : ""
                        }`}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingCell.draft}
                            onChange={(e) =>
                              setEditingCell({
                                ...editingCell,
                                draft: e.target.value,
                              })
                            }
                            onBlur={commitCellEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                commitCellEdit();
                              } else if (e.key === "Escape") {
                                setEditingCell(null);
                              }
                            }}
                            className="w-full h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-1 outline-none ring-1 ring-sky-500 rounded-xs"
                          />
                        ) : cell?.kind === "missing" ? (
                          <span className="text-slate-300 dark:text-slate-600 italic">
                            --
                          </span>
                        ) : (
                          <span className="text-slate-800 dark:text-slate-200 truncate w-full text-right">
                            {formatCellValue(cell)}
                          </span>
                        )}
                      </div>
                    );
                  })}
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
    </div>
  );
};
