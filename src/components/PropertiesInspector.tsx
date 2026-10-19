import React, { useEffect, useState } from "react";
import {
  Sliders,
  Layers,
  Plus,
  Trash2,
  Axis3d,
  FileSpreadsheet,
  MessageSquarePlus,
} from "lucide-react";
import { useWorkspaceStore } from "../stores/useWorkspaceStore";
import { tauriClient } from "../services/tauriClient";
import type {
  AxisScale,
  ColorMapKind,
  ColumnRole,
  DescriptiveStats,
  LegendPosition,
  LineStyle,
  PlotDocument,
  PlotType,
  SymbolShape,
} from "../types/scientific";

const PALETTE = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#E69F00",
  "#56B4E9",
  "#333333",
  "#DC2626",
];

const PLOT_TYPE_OPTIONS: { value: PlotType; label: string }[] = [
  { value: "scatter", label: "XY Scatter" },
  { value: "line", label: "XY Line" },
  { value: "line_symbols", label: "Line + Symbols" },
  { value: "area", label: "Filled Area" },
  { value: "bar", label: "Bar / Column" },
  { value: "stacked_bar", label: "Stacked Bar" },
  { value: "stacked_area", label: "Stacked Area" },
  { value: "histogram", label: "Histogram" },
  { value: "box_plot", label: "Box-and-Whisker" },
  { value: "violin", label: "Violin Density" },
  { value: "heatmap", label: "2D Heatmap" },
  { value: "contour", label: "Contour Isolines" },
  { value: "polar", label: "Polar Coordinate" },
  { value: "surface_3d", label: "3D Surface Mesh" },
  { value: "wireframe_3d", label: "3D Wireframe" },
  { value: "scatter_3d", label: "3D XYZ Scatter" },
  { value: "line_3d", label: "3D Trajectory Line" },
  { value: "waterfall", label: "Waterfall 3D Spectra" },
  { value: "vector_field", label: "2D Vector Quiver" },
];

export const PropertiesInspector: React.FC = () => {
  const {
    snapshot,
    activeTabId,
    selectedColumnId,
    selectedLayerId,
    setSelectedLayerId,
    updatePlot,
    mutateDataset,
  } = useWorkspaceStore();

  const [colStats, setColStats] = useState<DescriptiveStats | null>(null);
  const [newSeriesDatasetId, setNewSeriesDatasetId] = useState<string>("");
  const [newSeriesXColId, setNewSeriesXColId] = useState<string>("");
  const [newSeriesYColId, setNewSeriesYColId] = useState<string>("");
  const [newSeriesZColId, setNewSeriesZColId] = useState<string>("");
  const [newSeriesPlotType, setNewSeriesPlotType] =
    useState<PlotType>("scatter");

  // Annotation creator state
  const [annKind, setAnnKind] = useState<"text" | "reference_line" | "arrow">(
    "text"
  );
  const [annLabel, setAnnLabel] = useState("Peak λ_max");
  const [annX, setAnnX] = useState(545);
  const [annY, setAnnY] = useState(950);

  if (!snapshot) return null;
  const { project } = snapshot;

  const activeWorksheet = project.worksheets.find(
    (w) => w.id === activeTabId
  );
  const activeDataset = activeWorksheet
    ? project.datasets.find((d) => d.id === activeWorksheet.dataset_id)
    : undefined;
  const activePlot = project.plots.find((p) => p.id === activeTabId);

  const effectiveCol =
    activeDataset?.columns.find((c) => c.id === selectedColumnId) ??
    activeDataset?.columns[0];

  useEffect(() => {
    if (!activeDataset || !effectiveCol) {
      setColStats(null);
      return;
    }
    tauriClient
      .computeColumnStatistics(activeDataset.id, effectiveCol.id)
      .then(setColStats)
      .catch(() => setColStats(null));
  }, [activeDataset, effectiveCol]);

  useEffect(() => {
    if (project.datasets.length > 0 && !newSeriesDatasetId) {
      const ds = project.datasets[0];
      setNewSeriesDatasetId(ds.id);
      setNewSeriesXColId(
        ds.columns.find((c) => c.role === "x")?.id ?? ds.columns[0]?.id ?? ""
      );
      setNewSeriesYColId(
        ds.columns.find((c) => c.role === "y")?.id ??
          ds.columns[1]?.id ??
          ds.columns[0]?.id ??
          ""
      );
      setNewSeriesZColId(ds.columns.find((c) => c.role === "z")?.id ?? "");
    }
  }, [project.datasets, newSeriesDatasetId]);

  if (activePlot) {
    const panel = activePlot.panels[0];
    const activeLayer =
      activePlot.layers.find((l) => l.id === selectedLayerId) ??
      activePlot.layers[0];

    const mutatePlot = (fn: (draft: PlotDocument) => void) => {
      const next = structuredClone(activePlot);
      fn(next);
      updatePlot(next);
    };

    const selectedAddDs =
      project.datasets.find((d) => d.id === newSeriesDatasetId) ??
      project.datasets[0];

    const handleAddSeriesToPlot = () => {
      if (!selectedAddDs || !newSeriesXColId || !newSeriesYColId) return;
      const yCol = selectedAddDs.columns.find((c) => c.id === newSeriesYColId);
      mutatePlot((draft) => {
        const idx = draft.layers.length;
        const newId = `layer-${Date.now()}`;
        draft.layers.push({
          id: newId,
          label: yCol?.name ?? `Series ${idx + 1}`,
          visible: true,
          plot_type: newSeriesPlotType,
          source: {
            source_type: "dataset_columns",
            dataset_id: selectedAddDs.id,
            x_col: newSeriesXColId,
            y_col: newSeriesYColId,
            z_col: newSeriesZColId || null,
            x_err_col: null,
            y_err_col: null,
          },
          style: {
            color: PALETTE[idx % PALETTE.length],
            line_width: 2.0,
            line_style: "solid",
            symbol_shape: newSeriesPlotType === "line" ? "none" : "circle",
            symbol_size: 7.0,
            symbol_filled: true,
            opacity: 1.0,
            show_error_bars: false,
            error_bar_cap_width: 6.0,
            error_bar_line_width: 1.25,
            histogram_bins: 15,
          },
          panel_id: draft.panels[0].id,
        });
        setSelectedLayerId(newId);
      });
    };

    const handleAddAnnotation = () => {
      mutatePlot((draft) => {
        if (!draft.annotations) draft.annotations = [];
        if (annKind === "text") {
          draft.annotations.push({
            kind: "text",
            id: `ann-${Date.now()}`,
            text: annLabel || "Annotation",
            x: annX,
            y: annY,
            color: "#D55E00",
            font_size: 11,
          });
        } else if (annKind === "reference_line") {
          draft.annotations.push({
            kind: "reference_line",
            id: `ann-${Date.now()}`,
            label: annLabel || "Threshold",
            axis: "y",
            value: annY,
            color: "#DC2626",
            line_style: "dashed",
            line_width: 1.5,
          });
        } else {
          draft.annotations.push({
            kind: "arrow",
            id: `ann-${Date.now()}`,
            label: annLabel || "Feature",
            x1: annX - 20,
            y1: annY + 50,
            x2: annX,
            y2: annY,
            color: "#0072B2",
            line_width: 1.5,
          });
        }
      });
    };

    return (
      <aside className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-xs overflow-y-auto">
        <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
          <Sliders className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Figure & Graph Inspector</span>
        </div>

        <div className="p-3 space-y-5">
          {/* Figure Properties */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Figure General & Layout
            </h3>

            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">
                Figure Title
              </label>
              <input
                type="text"
                value={activePlot.title}
                onChange={(e) =>
                  mutatePlot((d) => {
                    d.title = e.target.value;
                    d.name = e.target.value || d.name;
                  })
                }
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">
                Subtitle
              </label>
              <input
                type="text"
                value={activePlot.subtitle ?? ""}
                onChange={(e) =>
                  mutatePlot((d) => {
                    d.subtitle = e.target.value || null;
                  })
                }
                placeholder="Optional subtitle..."
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500">
                  Width (px)
                </label>
                <input
                  type="number"
                  value={activePlot.dimensions.width_px}
                  onChange={(e) =>
                    mutatePlot((d) => {
                      d.dimensions.width_px = Math.max(
                        320,
                        Number(e.target.value) || 800
                      );
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">
                  Height (px)
                </label>
                <input
                  type="number"
                  value={activePlot.dimensions.height_px}
                  onChange={(e) =>
                    mutatePlot((d) => {
                      d.dimensions.height_px = Math.max(
                        240,
                        Number(e.target.value) || 560
                      );
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">
                  Export DPI
                </label>
                <select
                  value={activePlot.export_spec.dpi}
                  onChange={(e) =>
                    mutatePlot((d) => {
                      const dpi = Number(e.target.value);
                      d.export_spec.dpi = dpi;
                      d.dimensions.dpi = dpi;
                    })
                  }
                  className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value={150}>150 DPI</option>
                  <option value={300}>300 DPI</option>
                  <option value={600}>600 DPI</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[10px] text-slate-500">
                  Legend Position
                </label>
                <select
                  value={activePlot.legend.position}
                  onChange={(e) =>
                    mutatePlot((d) => {
                      d.legend.position = e.target.value as LegendPosition;
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="top_right">Top Right</option>
                  <option value="top_left">Top Left</option>
                  <option value="bottom_right">Bottom Right</option>
                  <option value="bottom_left">Bottom Left</option>
                  <option value="outside_top">Outside Top</option>
                </select>
              </div>
              <div className="flex flex-col justify-end gap-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activePlot.legend.visible}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        d.legend.visible = e.target.checked;
                      })
                    }
                  />
                  <span>Show Legend</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activePlot.export_spec.transparent_background}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        d.export_spec.transparent_background = e.target.checked;
                      })
                    }
                  />
                  <span>Transparent BG</span>
                </label>
              </div>
            </div>
          </section>

          {/* Axes Configuration */}
          {(["x_axis", "y_axis"] as const).map((axisKey) => {
            const axis = panel[axisKey];
            const label = axisKey === "x_axis" ? "X-Axis" : "Y-Axis";
            return (
              <section
                key={axisKey}
                className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Axis3d className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{label} Properties</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[10px] text-slate-500">
                      Title
                    </label>
                    <input
                      type="text"
                      value={axis.title}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].title = e.target.value;
                        })
                      }
                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={axis.unit ?? ""}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].unit = e.target.value || null;
                        })
                      }
                      placeholder="nm, uM"
                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Scale
                    </label>
                    <select
                      value={axis.scale}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].scale = e.target
                            .value as AxisScale;
                        })
                      }
                      className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value="linear">Linear</option>
                      <option value="log10">Log10</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Min
                    </label>
                    <input
                      type="number"
                      value={axis.min ?? ""}
                      placeholder="Auto"
                      onChange={(e) =>
                        mutatePlot((d) => {
                          const v = e.target.value.trim();
                          d.panels[0][axisKey].min =
                            v === "" ? null : Number(v);
                        })
                      }
                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Max
                    </label>
                    <input
                      type="number"
                      value={axis.max ?? ""}
                      placeholder="Auto"
                      onChange={(e) =>
                        mutatePlot((d) => {
                          const v = e.target.value.trim();
                          d.panels[0][axisKey].max =
                            v === "" ? null : Number(v);
                        })
                      }
                      className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 pt-0.5 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={axis.show_major_grid}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].show_major_grid =
                            e.target.checked;
                        })
                      }
                    />
                    <span>Major Grid</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={axis.show_minor_grid}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].show_minor_grid =
                            e.target.checked;
                        })
                      }
                    />
                    <span>Minor Ticks/Grid</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={axis.reversed}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].reversed = e.target.checked;
                        })
                      }
                    />
                    <span>Reverse Axis</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={axis.scientific_notation}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          d.panels[0][axisKey].scientific_notation =
                            e.target.checked;
                        })
                      }
                    />
                    <span>Sci. Notation</span>
                  </label>
                </div>
              </section>
            );
          })}

          {/* Series & Layer Formatting */}
          {activeLayer && (
            <section className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Series Formatting</span>
                </div>
                {activePlot.layers.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      mutatePlot((d) => {
                        d.layers = d.layers.filter(
                          (l) => l.id !== activeLayer.id
                        );
                      })
                    }
                    title="Remove Series Layer"
                    className="text-red-500 hover:text-red-600 p-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[10px] text-slate-500">
                  Select Active Series Layer
                </label>
                <select
                  value={activeLayer.id}
                  onChange={(e) => setSelectedLayerId(e.target.value)}
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  {activePlot.layers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label} ({l.plot_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Legend Label
                  </label>
                  <input
                    type="text"
                    value={activeLayer.label}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.label = e.target.value;
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Plot Type
                  </label>
                  <select
                    value={activeLayer.plot_type}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.plot_type = e.target.value as PlotType;
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {PLOT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activePlot.panels.length > 1 && (
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Target Subplot Panel
                  </label>
                  <select
                    value={activeLayer.panel_id}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.panel_id = e.target.value;
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {activePlot.panels.map((p, idx) => (
                      <option key={p.id} value={p.id}>
                        Panel {idx + 1} {p.subfigure_label ? `(${p.subfigure_label})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Color Swatches & Colormap */}
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">
                    Publication Color
                  </label>
                  <div className="flex items-center gap-1 flex-wrap">
                    {PALETTE.slice(0, 6).map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() =>
                          mutatePlot((d) => {
                            const l = d.layers.find(
                              (item) => item.id === activeLayer.id
                            );
                            if (l) l.style.color = hex;
                          })
                        }
                        className={`w-4 h-4 rounded-full border ${
                          activeLayer.style.color === hex
                            ? "ring-2 ring-offset-1 ring-sky-500 border-white"
                            : "border-slate-300"
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <input
                      type="color"
                      value={activeLayer.style.color}
                      onChange={(e) =>
                        mutatePlot((d) => {
                          const l = d.layers.find(
                            (item) => item.id === activeLayer.id
                          );
                          if (l) l.style.color = e.target.value;
                        })
                      }
                      className="w-5 h-5 p-0 border-0 bg-transparent cursor-pointer"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Scientific Colormap
                  </label>
                  <select
                    value={activePlot.colormap ?? "viridis"}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        d.colormap = e.target.value as ColorMapKind;
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="viridis">Viridis (Perceptual)</option>
                    <option value="plasma">Plasma</option>
                    <option value="inferno">Inferno</option>
                    <option value="cool_warm">Cool-Warm Diverging</option>
                    <option value="cividis">Cividis</option>
                    <option value="grayscale">Grayscale</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Symbol Shape
                  </label>
                  <select
                    value={activeLayer.style.symbol_shape}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l)
                          l.style.symbol_shape = e.target.value as SymbolShape;
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="circle">Circle</option>
                    <option value="square">Square</option>
                    <option value="triangle">Triangle</option>
                    <option value="diamond">Diamond</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Symbol Size ({activeLayer.style.symbol_size}px)
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={18}
                    step={0.5}
                    value={activeLayer.style.symbol_size}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.style.symbol_size = Number(e.target.value);
                      })
                    }
                    className="w-full mt-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Line Style
                  </label>
                  <select
                    value={activeLayer.style.line_style}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.style.line_style = e.target.value as LineStyle;
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">
                    Line Width ({activeLayer.style.line_width}px)
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={6}
                    step={0.25}
                    value={activeLayer.style.line_width}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.style.line_width = Number(e.target.value);
                      })
                    }
                    className="w-full mt-1.5"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeLayer.style.show_error_bars}
                    onChange={(e) =>
                      mutatePlot((d) => {
                        const l = d.layers.find(
                          (item) => item.id === activeLayer.id
                        );
                        if (l) l.style.show_error_bars = e.target.checked;
                      })
                    }
                  />
                  <span>Show Error Bars</span>
                </label>
              </div>
            </section>
          )}

          {/* Annotations Manager */}
          <section className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <MessageSquarePlus className="w-3.5 h-3.5 text-amber-500" />
              <span>Annotations & Callouts</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={annKind}
                onChange={(e) =>
                  setAnnKind(
                    e.target.value as "text" | "reference_line" | "arrow"
                  )
                }
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="text">Text Label</option>
                <option value="reference_line">Ref. Threshold Line</option>
                <option value="arrow">Pointer Arrow</option>
              </select>
              <input
                type="text"
                value={annLabel}
                onChange={(e) => setAnnLabel(e.target.value)}
                placeholder="Label text..."
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                value={annX}
                onChange={(e) => setAnnX(Number(e.target.value))}
                placeholder="X"
                title="X Data Coordinate"
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <input
                type="number"
                value={annY}
                onChange={(e) => setAnnY(Number(e.target.value))}
                placeholder="Y"
                title="Y Data Coordinate"
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={handleAddAnnotation}
                className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                + Add
              </button>
            </div>

            {activePlot.annotations && activePlot.annotations.length > 0 && (
              <div className="space-y-1 pt-1">
                {activePlot.annotations.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-[11px]"
                  >
                    <span className="truncate">
                      [{a.kind}] {a.kind === "text" ? a.text : a.label}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        mutatePlot((d) => {
                          d.annotations = d.annotations.filter(
                            (item) => item.id !== a.id
                          );
                        })
                      }
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add Another Series to Current Graph */}
          <section className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Add Data Series to Graph
            </h3>

            {selectedAddDs && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      X Col
                    </label>
                    <select
                      value={newSeriesXColId}
                      onChange={(e) => setNewSeriesXColId(e.target.value)}
                      className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {selectedAddDs.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Y Col
                    </label>
                    <select
                      value={newSeriesYColId}
                      onChange={(e) => setNewSeriesYColId(e.target.value)}
                      className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      {selectedAddDs.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Z Col (3D)
                    </label>
                    <select
                      value={newSeriesZColId}
                      onChange={(e) => setNewSeriesZColId(e.target.value)}
                      className="w-full px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <option value="">None</option>
                      {selectedAddDs.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={newSeriesPlotType}
                    onChange={(e) =>
                      setNewSeriesPlotType(e.target.value as PlotType)
                    }
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    {PLOT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddSeriesToPlot}
                    className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Series</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    );
  }

  // Worksheet / Column Inspector
  return (
    <aside className="h-full flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-xs overflow-y-auto">
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
        <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
        <span>Column & Data Inspector</span>
      </div>

      {activeDataset && effectiveCol ? (
        <div className="p-3 space-y-5">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Selected Column Properties
              </h3>
              {activeDataset.columns.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    mutateDataset(activeDataset.id, {
                      action: "remove_column",
                      col_id: effectiveCol.id,
                    })
                  }
                  title="Delete Column"
                  className="text-red-500 hover:text-red-600 p-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">
                Column Name
              </label>
              <input
                type="text"
                value={effectiveCol.name}
                onChange={(e) =>
                  mutateDataset(activeDataset.id, {
                    action: "rename_column",
                    col_id: effectiveCol.id,
                    new_name: e.target.value,
                    unit: effectiveCol.unit,
                  })
                }
                className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">
                  Physical Unit
                </label>
                <input
                  type="text"
                  value={effectiveCol.unit ?? ""}
                  placeholder="nm, uM, s..."
                  onChange={(e) =>
                    mutateDataset(activeDataset.id, {
                      action: "rename_column",
                      col_id: effectiveCol.id,
                      new_name: effectiveCol.name,
                      unit: e.target.value || null,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">
                  Plot Designation
                </label>
                <select
                  value={effectiveCol.role}
                  onChange={(e) =>
                    mutateDataset(activeDataset.id, {
                      action: "set_column_role",
                      col_id: effectiveCol.id,
                      role: e.target.value as ColumnRole,
                    })
                  }
                  className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="x">X (Independent)</option>
                  <option value="y">Y (Dependent)</option>
                  <option value="z">Z (3D Surface / Matrix)</option>
                  <option value="y_error">Y Error ( ±σ_y )</option>
                  <option value="x_error">X Error ( ±σ_x )</option>
                  <option value="label">Label</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </section>

          {colStats && (
            <section className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Descriptive Statistics ({effectiveCol.name})
              </h3>
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-md p-2.5 space-y-1.5 font-mono text-[11px]">
                {[
                  ["Valid N / Missing", `${colStats.count} / ${colStats.missing_count}`],
                  ["Mean", colStats.mean.toPrecision(6)],
                  ["Std. Dev (s)", colStats.std_dev.toPrecision(6)],
                  ["Std. Error (SEM)", colStats.sem.toPrecision(5)],
                  ["Variance (s²)", colStats.variance.toPrecision(6)],
                  ["Minimum", colStats.min.toPrecision(6)],
                  ["25% Quartile (Q1)", colStats.q1.toPrecision(6)],
                  ["Median (50%)", colStats.median.toPrecision(6)],
                  ["75% Quartile (Q3)", colStats.q3.toPrecision(6)],
                  ["IQR (Q3 - Q1)", colStats.iqr.toPrecision(5)],
                  ["Maximum", colStats.max.toPrecision(6)],
                  ["Skewness", colStats.skewness.toFixed(4)],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-slate-500 font-sans">{k}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="p-4 text-slate-400">
          Select a worksheet column or figure to inspect its properties.
        </div>
      )}
    </aside>
  );
};
