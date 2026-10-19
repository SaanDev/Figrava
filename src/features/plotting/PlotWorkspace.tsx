import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import {
  RotateCcw,
  Download,
  Copy,
  Eye,
  EyeOff,
  TrendingUp,
  Image as ImageIcon,
  FileCode2,
  FileText,
  LayoutGrid,
  Compass,
  Activity,
  Box,
  Plus,
} from "lucide-react";
import { buildEChartsOption } from "./echartsAdapter";
import { tauriClient } from "../../services/tauriClient";
import { useWorkspaceStore } from "../../stores/useWorkspaceStore";
import {
  DesktopContextMenu,
  type ContextMenuEntry,
} from "../../components/DesktopContextMenu";
import type {
  AnalysisResult,
  Dataset,
  PlotDocument,
  PlotPanel,
} from "../../types/scientific";

interface PlotWorkspaceProps {
  plot: PlotDocument;
  datasets: Dataset[];
  analyses: AnalysisResult[];
}

export const PlotWorkspace: React.FC<PlotWorkspaceProps> = ({
  plot,
  datasets,
  analyses,
}) => {
  const {
    theme,
    selectedLayerId,
    setSelectedLayerId,
    updatePlot,
    duplicatePlot,
    exportPlotPdf,
    setActiveModal,
    setStatus,
  } = useWorkspaceStore();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [hoverCoords, setHoverCoords] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [enable3DMouseMove, setEnable3DMouseMove] = useState<boolean>(false);
  const [dragMode3D, setDragMode3D] = useState<"rotate" | "pan">("rotate");
  const [isDragging3D, setIsDragging3D] = useState<boolean>(false);
  const [liveCam3D, setLiveCam3D] = useState<PlotDocument["camera_3d"] | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title: string;
    items: ContextMenuEntry[];
  } | null>(null);

  const has3D = useMemo(
    () =>
      plot.layers.some(
        (l) =>
          l.visible &&
          (l.plot_type === "scatter_3d" ||
            l.plot_type === "line_3d" ||
            l.plot_type === "surface_3d" ||
            l.plot_type === "wireframe_3d" ||
            l.plot_type === "waterfall")
      ),
    [plot.layers]
  );

  const effectivePlot = useMemo(() => {
    if (!liveCam3D) return plot;
    return {
      ...plot,
      camera_3d: liveCam3D,
    };
  }, [plot, liveCam3D]);

  const option = useMemo(
    () =>
      buildEChartsOption(effectivePlot, datasets, analyses, theme === "dark"),
    [effectivePlot, datasets, analyses, theme]
  );

  useEffect(() => {
    setLiveCam3D(null);
  }, [plot.id, plot.camera_3d]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = echarts.init(el, undefined, {
      renderer: "svg",
    });
    chartRef.current = instance;

    const handleZrMouseMove = (event: { offsetX: number; offsetY: number }) => {
      const pt = instance.convertFromPixel({ seriesIndex: 0 }, [
        event.offsetX,
        event.offsetY,
      ]);
      if (
        Array.isArray(pt) &&
        Number.isFinite(pt[0]) &&
        Number.isFinite(pt[1])
      ) {
        setHoverCoords({ x: pt[0], y: pt[1] });
      }
    };

    instance.getZr().on("mousemove", handleZrMouseMove);

    const resizeObserver = new ResizeObserver(() => {
      instance.resize();
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      instance.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = chartRef.current;
    if (!instance) return;
    instance.setOption(option, { notMerge: true });
  }, [option]);

  const handleResetView = () => {
    const instance = chartRef.current;
    if (instance) {
      instance.dispatchAction({
        type: "dataZoom",
        start: 0,
        end: 100,
      });
    }
    const next = structuredClone(plot);
    next.panels[0].x_axis.min = null;
    next.panels[0].x_axis.max = null;
    next.panels[0].y_axis.min = null;
    next.panels[0].y_axis.max = null;
    if (has3D) {
      next.camera_3d = {
        azimuth_deg: 42,
        elevation_deg: 28,
        distance: 100,
        z_scale: 1.0,
        pan_x: 0,
        pan_y: 0,
      };
      setLiveCam3D(null);
    }
    updatePlot(next);
    setStatus("Reset graph view and camera to default", "info");
  };

  const handle3DMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!has3D || !enable3DMouseMove) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const isPanGesture =
      dragMode3D === "pan" || e.shiftKey || e.button === 2 || e.button === 1;

    const baseCam = liveCam3D ??
      plot.camera_3d ?? {
        azimuth_deg: 42,
        elevation_deg: 28,
        distance: 100,
        z_scale: 1.0,
        pan_x: 0,
        pan_y: 0,
      };
    let latestCam = { ...baseCam };
    setIsDragging3D(true);

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (isPanGesture) {
        latestCam = {
          ...baseCam,
          pan_x: Number(((baseCam.pan_x ?? 0) + dx * 0.004).toFixed(4)),
          pan_y: Number(((baseCam.pan_y ?? 0) - dy * 0.004).toFixed(4)),
        };
      } else {
        let nextAz = (baseCam.azimuth_deg - dx * 0.45) % 360;
        if (nextAz > 180) nextAz -= 360;
        if (nextAz < -180) nextAz += 360;
        const nextEl = Math.max(
          -80,
          Math.min(80, baseCam.elevation_deg + dy * 0.35)
        );
        latestCam = {
          ...baseCam,
          azimuth_deg: Math.round(nextAz * 10) / 10,
          elevation_deg: Math.round(nextEl * 10) / 10,
        };
      }
      setLiveCam3D(latestCam);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setIsDragging3D(false);
      const next = structuredClone(plot);
      next.camera_3d = latestCam;
      updatePlot(next);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const toggleLayerVisibility = (layerId: string) => {
    const next = structuredClone(plot);
    const target = next.layers.find((l) => l.id === layerId);
    if (target) {
      target.visible = !target.visible;
      updatePlot(next);
    }
  };

  const handleConfigureGrid = (rows: number, cols: number) => {
    const next = structuredClone(plot);
    next.grid_rows = rows;
    next.grid_cols = cols;
    const total = rows * cols;
    const basePanel = next.panels[0];
    const newPanels: PlotPanel[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const existing = next.panels[idx];
        const subLabel =
          total > 1 ? `(${String.fromCharCode(97 + idx)})` : null;
        if (existing) {
          existing.row = r;
          existing.col = c;
          existing.subfigure_label = subLabel;
          newPanels.push(existing);
        } else {
          const clone = structuredClone(basePanel);
          clone.id = `${basePanel.id}-p${idx + 1}`;
          clone.row = r;
          clone.col = c;
          clone.subfigure_label = subLabel;
          newPanels.push(clone);
        }
      }
    }
    next.panels = newPanels;
    updatePlot(next);
    setStatus(`Configured ${rows}×${cols} multi-panel figure layout`, "success");
  };

  const handleApplyPreset = (presetId: string) => {
    if (!presetId) return;
    const next = structuredClone(plot);
    next.style_preset = presetId;
    if (presetId === "nature_1col") {
      next.dimensions.width_px = 680;
      next.dimensions.height_px = 480;
      next.dimensions.width_cm = 8.9;
      next.dimensions.height_cm = 6.3;
      next.base_font_size = 11;
    } else if (presetId === "ieee_2col") {
      next.dimensions.width_px = 960;
      next.dimensions.height_px = 540;
      next.dimensions.width_cm = 17.8;
      next.dimensions.height_cm = 10.0;
      next.base_font_size = 11;
    } else if (presetId === "acs_1col") {
      next.dimensions.width_px = 660;
      next.dimensions.height_px = 460;
      next.dimensions.width_cm = 8.25;
      next.dimensions.height_cm = 5.75;
      next.base_font_size = 11;
    } else if (presetId === "presentation") {
      next.dimensions.width_px = 1040;
      next.dimensions.height_px = 620;
      next.dimensions.width_cm = 24.0;
      next.dimensions.height_cm = 14.3;
      next.base_font_size = 15;
    }
    updatePlot(next);
    setStatus(`Applied publication preset "${presetId}"`, "success");
  };

  const handleExportSvg = async () => {
    const el = containerRef.current;
    if (!el) return;
    const svgEl = el.querySelector("svg");
    if (!svgEl) {
      setStatus("SVG element not found for export", "error");
      return;
    }
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgEl);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }
    const bytes = new TextEncoder().encode(svgString);
    const safeName =
      plot.name.replace(/[^a-zA-Z0-9 _.-]+/g, "_").trim() || "figure";
    try {
      const savedPath = await tauriClient.saveFileWithDialog(
        `${safeName}.svg`,
        "Scalable Vector Graphics (*.svg)",
        ["svg"],
        bytes,
        "Export Vector SVG Figure"
      );
      if (!savedPath) {
        setStatus("SVG export cancelled", "info");
        return;
      }
      setStatus(`Saved vector figure to "${savedPath}"`, "success");
    } catch (err) {
      setStatus(`SVG export failed: ${String(err)}`, "error");
    }
  };

  const handleExportPng = async () => {
    const offscreen = document.createElement("div");
    offscreen.style.width = `${plot.dimensions.width_px}px`;
    offscreen.style.height = `${plot.dimensions.height_px}px`;
    offscreen.style.position = "fixed";
    offscreen.style.left = "-9999px";
    document.body.appendChild(offscreen);

    let pngBytes: Uint8Array | null = null;
    try {
      const tempChart = echarts.init(offscreen, undefined, {
        renderer: "canvas",
        width: plot.dimensions.width_px,
        height: plot.dimensions.height_px,
      });
      const activePlot = liveCam3D
        ? { ...plot, camera_3d: liveCam3D }
        : plot;
      const exportOpt = buildEChartsOption(activePlot, datasets, analyses, false);
      tempChart.setOption(exportOpt);
      const pixelRatio = Math.max(1, Math.round(plot.export_spec.dpi / 96));
      const dataUrl = tempChart.getDataURL({
        type: "png",
        pixelRatio,
        backgroundColor: plot.export_spec.transparent_background
          ? "transparent"
          : plot.background_color,
      });
      tempChart.dispose();

      const base64Part = dataUrl.split(",")[1] ?? "";
      const binaryStr = atob(base64Part);
      pngBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        pngBytes[i] = binaryStr.charCodeAt(i);
      }
    } finally {
      document.body.removeChild(offscreen);
    }

    if (!pngBytes) return;
    const safeName =
      plot.name.replace(/[^a-zA-Z0-9 _.-]+/g, "_").trim() || "figure";
    try {
      const savedPath = await tauriClient.saveFileWithDialog(
        `${safeName}.png`,
        "PNG Raster Image (*.png)",
        ["png"],
        pngBytes,
        `Export High-DPI PNG Figure (${plot.export_spec.dpi} DPI)`
      );
      if (!savedPath) {
        setStatus("PNG export cancelled", "info");
        return;
      }
      setStatus(
        `Saved raster figure (${plot.export_spec.dpi} DPI) to "${savedPath}"`,
        "success"
      );
    } catch (err) {
      setStatus(`PNG export failed: ${String(err)}`, "error");
    }
  };

  const cam = liveCam3D ??
    plot.camera_3d ?? {
      azimuth_deg: 42,
      elevation_deg: 28,
      distance: 100,
      z_scale: 1.0,
      pan_x: 0,
      pan_y: 0,
    };

  const openFigureContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const firstPanel = plot.panels[0];
    const gridOn = Boolean(firstPanel?.x_axis.show_major_grid);
    const frameOn = Boolean(firstPanel?.x_axis.show_top_right_border);
    const legendOn = Boolean(plot.legend.visible);

    const items: ContextMenuEntry[] = [
      {
        id: "reset-view",
        label: "Auto-Range & Reset Camera View",
        icon: <RotateCcw className="w-3.5 h-3.5 text-sky-600" />,
        action: handleResetView,
      },
      {
        id: "toggle-grid",
        label: gridOn ? "Hide Major Grid Lines" : "Show Major Grid Lines",
        icon: <LayoutGrid className="w-3.5 h-3.5" />,
        action: () => {
          const next = structuredClone(plot);
          for (const p of next.panels) {
            p.x_axis.show_major_grid = !gridOn;
            p.y_axis.show_major_grid = !gridOn;
          }
          void updatePlot(next);
        },
      },
      {
        id: "toggle-legend",
        label: legendOn ? "Hide Figure Legend" : "Show Figure Legend",
        icon: legendOn ? (
          <EyeOff className="w-3.5 h-3.5" />
        ) : (
          <Eye className="w-3.5 h-3.5" />
        ),
        action: () => {
          const next = structuredClone(plot);
          next.legend.visible = !legendOn;
          void updatePlot(next);
        },
      },
      {
        id: "toggle-frame",
        label: frameOn ? "Disable 2D Frame Box" : "Enable 2D Frame Box",
        action: () => {
          const next = structuredClone(plot);
          for (const p of next.panels) {
            p.x_axis.show_top_right_border = !frameOn;
            p.y_axis.show_top_right_border = !frameOn;
          }
          void updatePlot(next);
        },
      },
    ];

    if (has3D) {
      items.push(
        { id: "div-3d", divider: true },
        { id: "hdr-3d", header: "3D Coordinate & Camera Options" },
        {
          id: "toggle-3d-move",
          label: enable3DMouseMove
            ? "Disable 'Move 3D with Mouse'"
            : "Enable 'Move 3D with Mouse'",
          icon: <Compass className="w-3.5 h-3.5 text-violet-600" />,
          action: () => setEnable3DMouseMove((prev) => !prev),
        },
        {
          id: "toggle-3d-box",
          label: cam.show_box
            ? "Show Principal X/Y/Z Axes Only (Hide Box)"
            : "Show Full 3D Bounding Box with Ticks",
          icon: <Box className="w-3.5 h-3.5 text-violet-600" />,
          action: () => {
            const next = structuredClone(plot);
            next.camera_3d = {
              ...cam,
              show_box: !cam.show_box,
            };
            void updatePlot(next);
          },
        }
      );
    }

    items.push(
      { id: "div-ana", divider: true },
      { id: "hdr-ana", header: "Scientific Analysis" },
      {
        id: "fit-curve",
        label: "Linear, Nonlinear & Peak Curve Fitting...",
        shortcut: "Ctrl+F",
        icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />,
        action: () => setActiveModal("curve_fit"),
      },
      {
        id: "sig-proc",
        label: "Signal Processing (FFT, Filter, Peaks)...",
        icon: <Activity className="w-3.5 h-3.5 text-indigo-600" />,
        action: () => setActiveModal("signal_processing"),
      },
      { id: "div-fig", divider: true },
      { id: "hdr-fig", header: "Figure Management & Export" },
      {
        id: "new-series",
        label: "Create / Configure Graph Series...",
        shortcut: "Ctrl+P",
        icon: <Plus className="w-3.5 h-3.5 text-sky-600" />,
        action: () => setActiveModal("new_plot"),
      },
      {
        id: "dup-fig",
        label: "Duplicate Figure",
        icon: <Copy className="w-3.5 h-3.5" />,
        action: () => void duplicatePlot(plot.id),
      },
      {
        id: "exp-pdf",
        label: "Export Vector PDF (.pdf)...",
        icon: <FileText className="w-3.5 h-3.5 text-rose-600" />,
        action: () => void exportPlotPdf(plot.id, plot.name),
      },
      {
        id: "exp-svg",
        label: "Export Vector SVG (.svg)...",
        icon: <FileCode2 className="w-3.5 h-3.5 text-indigo-600" />,
        action: () => void handleExportSvg(),
      },
      {
        id: "exp-png",
        label: `Export High-DPI PNG (${plot.export_spec.dpi} DPI)...`,
        icon: <ImageIcon className="w-3.5 h-3.5 text-sky-600" />,
        action: () => void handleExportPng(),
      }
    );

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      title: `Figure: ${plot.name}`,
      items,
    });
  };

  return (
    <div
      onContextMenu={openFigureContextMenu}
      className="h-full flex flex-col bg-slate-100/70 dark:bg-slate-950 text-xs"
    >
      {/* Figure Toolbar */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleResetView}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-600" />
            <span>Auto-Range</span>
          </button>

          <button
            type="button"
            onClick={() => duplicatePlot(plot.id)}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("curve_fit")}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Fit Curve</span>
          </button>

          {/* Multi-Panel Grid Selector */}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
            <select
              aria-label="Multi-Panel Grid Layout"
              value={`${plot.grid_rows}x${plot.grid_cols}`}
              onChange={(e) => {
                const [r, c] = e.target.value.split("x").map(Number);
                handleConfigureGrid(r, c);
              }}
              className="bg-transparent text-[11px] focus:outline-none text-slate-700 dark:text-slate-200"
            >
              <option value="1x1">Grid 1×1</option>
              <option value="1x2">Grid 1×2 (a,b)</option>
              <option value="2x1">Grid 2×1 (a,b)</option>
              <option value="2x2">Grid 2×2 (a-d)</option>
            </select>
          </div>

          {/* Journal Preset Selector */}
          <select
            aria-label="Publication Style Preset"
            value={plot.style_preset ?? ""}
            onChange={(e) => handleApplyPreset(e.target.value)}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-200"
          >
            <option value="">Journal Preset...</option>
            <option value="nature_1col">Nature (1-Col 8.9cm)</option>
            <option value="ieee_2col">IEEE (2-Col 17.8cm)</option>
            <option value="acs_1col">ACS (1-Col 8.25cm)</option>
            <option value="presentation">Presentation (Widescreen)</option>
          </select>

          {has3D && (
            <div className="flex items-center gap-2.5 px-2.5 py-1 rounded border border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200">
              <Compass className="w-3.5 h-3.5 text-violet-600 shrink-0" />
              <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enable3DMouseMove}
                  onChange={(e) => setEnable3DMouseMove(e.target.checked)}
                  className="rounded accent-violet-600 cursor-pointer"
                />
                <span>Move 3D with Mouse</span>
              </label>
              {enable3DMouseMove && (
                <select
                  aria-label="3D Mouse Action Mode"
                  value={dragMode3D}
                  onChange={(e) =>
                    setDragMode3D(e.target.value as "rotate" | "pan")
                  }
                  className="px-1.5 py-0.5 rounded border border-violet-300 dark:border-violet-700 bg-white dark:bg-slate-900 text-[10px] font-medium"
                >
                  <option value="rotate">Drag: Rotate 3D</option>
                  <option value="pan">Drag: Move / Pan</option>
                </select>
              )}
              <div className="h-3.5 w-px bg-violet-200 dark:bg-violet-800" />
              <label className="flex items-center gap-1.5 text-[11px] font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(cam.show_box)}
                  onChange={(e) => {
                    const next = structuredClone(plot);
                    next.camera_3d = {
                      ...cam,
                      show_box: e.target.checked,
                    };
                    updatePlot(next);
                  }}
                  className="rounded accent-violet-600 cursor-pointer"
                />
                <span>Show 3D Box</span>
              </label>
              <div className="h-3.5 w-px bg-violet-200 dark:bg-violet-800" />
              <label className="flex items-center gap-1 text-[11px]">
                <span>Az: {Math.round(cam.azimuth_deg)}°</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={cam.azimuth_deg}
                  onChange={(e) => {
                    const next = structuredClone(plot);
                    next.camera_3d = {
                      ...cam,
                      azimuth_deg: Number(e.target.value),
                    };
                    updatePlot(next);
                  }}
                  className="w-14 accent-violet-600"
                />
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                <span>El: {Math.round(cam.elevation_deg)}°</span>
                <input
                  type="range"
                  min={-80}
                  max={80}
                  value={cam.elevation_deg}
                  onChange={(e) => {
                    const next = structuredClone(plot);
                    next.camera_3d = {
                      ...cam,
                      elevation_deg: Number(e.target.value),
                    };
                    updatePlot(next);
                  }}
                  className="w-14 accent-violet-600"
                />
              </label>
            </div>
          )}

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          {/* Layer Quick Selector Pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {plot.layers.map((layer) => {
              const isSelected = selectedLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                    isSelected
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-950 text-sky-800 dark:text-sky-200 font-medium"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: layer.style.color }}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedLayerId(layer.id)}
                    className="truncate max-w-[120px]"
                  >
                    {layer.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLayerVisibility(layer.id)}
                    title={layer.visible ? "Hide Layer" : "Show Layer"}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
                  >
                    {layer.visible ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-slate-400" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {hoverCoords && (
            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              X: {hoverCoords.x.toPrecision(5)} | Y:{" "}
              {hoverCoords.y.toPrecision(5)}
            </span>
          )}

          <button
            type="button"
            onClick={() => exportPlotPdf(plot.id, plot.name)}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-200 font-medium"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportSvg}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium"
          >
            <FileCode2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export SVG</span>
          </button>

          <button
            type="button"
            onClick={handleExportPng}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <Download className="w-3 h-3" />
            <span>Export PNG</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Figure Canvas */}
      <div className="flex-1 p-4 flex items-center justify-center overflow-auto">
        <div
          onMouseDown={handle3DMouseDown}
          onContextMenu={openFigureContextMenu}
          className={`bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-center ${
            has3D && enable3DMouseMove
              ? isDragging3D
                ? "cursor-grabbing select-none"
                : "cursor-grab select-none"
              : ""
          }`}
          style={{
            width: `${plot.dimensions.width_px}px`,
            height: `${plot.dimensions.height_px}px`,
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <div ref={containerRef} className="w-full h-full" />
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
