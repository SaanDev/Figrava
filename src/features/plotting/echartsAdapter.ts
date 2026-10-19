import type { EChartsOption, SeriesOption } from "echarts";
import type {
  AnalysisResult,
  Camera3DSpec,
  ColorMapKind,
  Dataset,
  LineStyle,
  PlotDocument,
  PlotLayer,
  SymbolShape,
} from "../../types/scientific";

const COLORMAP_STOPS: Record<ColorMapKind, string[]> = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  plasma: ["#0d0887", "#7e03a8", "#cc4778", "#f89540", "#f0f921"],
  inferno: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
  cool_warm: ["#3b4cc0", "#7b9ff9", "#dddddd", "#f29072", "#b40426"],
  cividis: ["#00224e", "#35456c", "#666970", "#9c9475", "#d3c164", "#fdea45"],
  grayscale: ["#111827", "#4b5563", "#9ca3af", "#e5e7eb"],
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return [0, 114, 178];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function sampleColormap(
  kind: ColorMapKind = "viridis",
  t: number
): string {
  const stops = COLORMAP_STOPS[kind] ?? COLORMAP_STOPS.viridis;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const c0 = hexToRgb(stops[idx]);
  const c1 = hexToRgb(stops[idx + 1]);
  const r = Math.round(c0[0] + frac * (c1[0] - c0[0]));
  const g = Math.round(c0[1] + frac * (c1[1] - c0[1]));
  const b = Math.round(c0[2] + frac * (c1[2] - c0[2]));
  return `rgb(${r}, ${g}, ${b})`;
}

function mapSymbolShape(shape: SymbolShape): string {
  switch (shape) {
    case "circle":
      return "circle";
    case "square":
      return "rect";
    case "triangle":
      return "triangle";
    case "diamond":
      return "diamond";
    case "cross":
    case "plus":
      return "pin";
    case "none":
      return "none";
  }
}

function mapLineStyle(style: LineStyle): "solid" | "dashed" | "dotted" {
  switch (style) {
    case "solid":
      return "solid";
    case "dashed":
    case "dash_dot":
      return "dashed";
    case "dotted":
      return "dotted";
  }
}

function formatAxisLabel(title: string, unit: string | null): string {
  if (unit && unit.trim().length > 0) {
    return `${title} [${unit.trim()}]`;
  }
  return title;
}

export interface ResolvedLayerPoints {
  layer: PlotLayer;
  points: [number, number][];
  points3D: [number, number, number][];
  errorPoints: [number, number, number, number][]; // [x, y, xErr, yErr]
}

/**
 * Extracts valid numeric coordinates, optional Z values, and optional error bar extents for a PlotLayer.
 */
export function resolveLayerData(
  layer: PlotLayer,
  datasets: Dataset[],
  analyses: AnalysisResult[],
  xLog: boolean,
  yLog: boolean
): ResolvedLayerPoints {
  const points: [number, number][] = [];
  const points3D: [number, number, number][] = [];
  const errorPoints: [number, number, number, number][] = [];

  if (layer.source.source_type === "dataset_columns") {
    const { dataset_id, x_col, y_col, z_col, x_err_col, y_err_col } =
      layer.source;
    const ds = datasets.find((d) => d.id === dataset_id);
    if (!ds) return { layer, points, points3D, errorPoints };

    const colX = ds.columns.find((c) => c.id === x_col);
    const colY = ds.columns.find((c) => c.id === y_col);
    const colZ = z_col
      ? ds.columns.find((c) => c.id === z_col)
      : ds.columns.find((c) => c.role === "z") ?? ds.columns[2];
    const colXErr = x_err_col
      ? ds.columns.find((c) => c.id === x_err_col)
      : undefined;
    const colYErr = y_err_col
      ? ds.columns.find((c) => c.id === y_err_col)
      : undefined;

    if (!colX || !colY) return { layer, points, points3D, errorPoints };

    const rowCount = Math.min(colX.values.length, colY.values.length);
    for (let i = 0; i < rowCount; i++) {
      const vx = colX.values[i];
      const vy = colY.values[i];
      if (vx?.kind !== "numeric" || vy?.kind !== "numeric") continue;
      const x = vx.value;
      const y = vy.value;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (xLog && x <= 0) continue;
      if (yLog && y <= 0) continue;

      points.push([x, y]);

      const vz = colZ?.values[i];
      const z =
        vz?.kind === "numeric" && Number.isFinite(vz.value) ? vz.value : y;
      points3D.push([x, y, z]);

      const xErrCell = colXErr?.values[i];
      const yErrCell = colYErr?.values[i];
      const xErr =
        xErrCell?.kind === "numeric" &&
        Number.isFinite(xErrCell.value) &&
        xErrCell.value > 0
          ? xErrCell.value
          : 0;
      const yErr =
        yErrCell?.kind === "numeric" &&
        Number.isFinite(yErrCell.value) &&
        yErrCell.value > 0
          ? yErrCell.value
          : 0;

      if (xErr > 0 || yErr > 0) {
        errorPoints.push([x, y, xErr, yErr]);
      }
    }
  } else {
    const { analysis_id, curve_kind } = layer.source;
    const ana = analyses.find((a) => a.id === analysis_id);
    if (!ana) return { layer, points, points3D, errorPoints };

    const xs = curve_kind === "residuals" ? ana.obs_x : ana.curve_x;
    const ys =
      curve_kind === "residuals"
        ? ana.residuals
        : curve_kind === "confidence_band_upper"
        ? ana.confidence_band_upper ?? ana.curve_y
        : curve_kind === "confidence_band_lower"
        ? ana.confidence_band_lower ?? ana.curve_y
        : ana.curve_y;
    const n = Math.min(xs.length, ys.length);
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (xLog && x <= 0) continue;
      if (yLog && y <= 0) continue;
      points.push([x, y]);
      points3D.push([x, y, y]);
    }
  }

  return { layer, points, points3D, errorPoints };
}

function project3DPoint(
  nx: number,
  ny: number,
  nz: number,
  cam: Camera3DSpec
): [number, number, number] {
  const az = ((cam.azimuth_deg ?? 42) * Math.PI) / 180;
  const el = ((cam.elevation_deg ?? 28) * Math.PI) / 180;
  const zs = nz * (cam.z_scale ?? 1.0);
  const rawDist = cam.distance ?? 1.0;
  const zoom = rawDist > 10 ? rawDist / 100 : rawDist > 0 ? rawDist : 1.0;
  const panX = cam.pan_x ?? 0;
  const panY = cam.pan_y ?? 0;

  // Rotate around Z by azimuth, then tilt by elevation
  const x1 = nx * Math.cos(az) - ny * Math.sin(az);
  const y1 = nx * Math.sin(az) + ny * Math.cos(az);
  const screenX = x1 * zoom + panX;
  const screenY = (-y1 * Math.sin(el) + zs * Math.cos(el)) * zoom + panY;
  const depth = y1 * Math.cos(el) + zs * Math.sin(el);
  return [screenX, screenY, depth];
}

function is3DPlotType(pt: string): boolean {
  return (
    pt === "scatter_3d" ||
    pt === "line_3d" ||
    pt === "surface_3d" ||
    pt === "wireframe_3d" ||
    pt === "waterfall"
  );
}

/**
 * Translates our renderer-independent `PlotDocument` into an Apache ECharts option object.
 */
export function buildEChartsOption(
  plot: PlotDocument,
  datasets: Dataset[],
  analyses: AnalysisResult[],
  isDarkTheme = false
): EChartsOption {
  const textColor = isDarkTheme ? "#E2E8F0" : "#0F172A";
  const axisLineColor = isDarkTheme ? "#64748B" : "#334155";
  const gridLineColor = isDarkTheme
    ? "rgba(148, 163, 184, 0.16)"
    : "rgba(15, 23, 42, 0.09)";
  const minorGridColor = isDarkTheme
    ? "rgba(148, 163, 184, 0.08)"
    : "rgba(15, 23, 42, 0.04)";
  const colormap = plot.colormap ?? "viridis";
  const cam3D: Camera3DSpec = plot.camera_3d ?? {
    azimuth_deg: 42,
    elevation_deg: 28,
    distance: 100,
    z_scale: 1.0,
  };

  const rows = Math.max(1, plot.grid_rows || 1);
  const cols = Math.max(1, plot.grid_cols || 1);
  const spacing = plot.panel_spacing ?? 48;
  const topBase = plot.margins.top + (plot.subtitle ? 14 : 0);
  const availW = Math.max(
    200,
    plot.dimensions.width_px - plot.margins.left - plot.margins.right
  );
  const availH = Math.max(
    160,
    plot.dimensions.height_px - topBase - plot.margins.bottom
  );
  const cellW = (availW - (cols - 1) * spacing) / cols;
  const cellH = (availH - (rows - 1) * spacing) / rows;

  const grids: Record<string, unknown>[] = [];
  const xAxes: Record<string, unknown>[] = [];
  const yAxes: Record<string, unknown>[] = [];
  const graphicItems: Record<string, unknown>[] = [];

  const has3D = plot.layers.some((l) => l.visible && is3DPlotType(l.plot_type));

  plot.panels.forEach((panel, idx) => {
    const r = Math.min(rows - 1, panel.row || 0);
    const c = Math.min(cols - 1, panel.col || 0);
    const leftPx =
      panel.is_inset && panel.inset_rect
        ? plot.margins.left + panel.inset_rect[0] * availW
        : plot.margins.left + c * (cellW + spacing);
    const topPx =
      panel.is_inset && panel.inset_rect
        ? topBase + panel.inset_rect[1] * availH
        : topBase + r * (cellH + spacing);
    const widthPx =
      panel.is_inset && panel.inset_rect ? panel.inset_rect[2] * availW : cellW;
    const heightPx =
      panel.is_inset && panel.inset_rect ? panel.inset_rect[3] * availH : cellH;

    grids.push({
      left: leftPx,
      top: topPx,
      width: widthPx,
      height: heightPx,
      containLabel: false,
    });

    if (panel.subfigure_label) {
      graphicItems.push({
        type: "text",
        left: leftPx - 28,
        top: topPx - 18,
        style: {
          text: panel.subfigure_label,
          fill: textColor,
          font: `bold ${plot.base_font_size + 2}px ${plot.font_family}`,
        },
      });
    }

    const xLog = panel.x_axis.scale === "log10";
    const yLog = panel.y_axis.scale === "log10";

    xAxes.push({
      gridIndex: idx,
      show: has3D ? false : panel.x_axis.visible,
      type: xLog ? "log" : "value",
      name: formatAxisLabel(panel.x_axis.title, panel.x_axis.unit),
      nameLocation: "middle",
      nameGap: 34,
      nameTextStyle: {
        fontSize: panel.x_axis.font_size,
        fontWeight: 600,
        color: textColor,
      },
      min: has3D ? -1.45 : panel.x_axis.min ?? undefined,
      max: has3D ? 1.45 : panel.x_axis.max ?? undefined,
      inverse: panel.x_axis.reversed,
      splitNumber: panel.x_axis.major_tick_count ?? undefined,
      axisLine: {
        show: true,
        lineStyle: { color: axisLineColor, width: 1.25 },
      },
      axisTick: { show: true, inside: true },
      minorTick: {
        show: panel.x_axis.show_minor_grid,
        splitNumber: panel.x_axis.minor_tick_split,
      },
      splitLine: {
        show: panel.x_axis.show_major_grid,
        lineStyle: { color: gridLineColor },
      },
      minorSplitLine: {
        show: panel.x_axis.show_minor_grid,
        lineStyle: { color: minorGridColor },
      },
      axisLabel: {
        fontSize: Math.max(10, panel.x_axis.font_size - 1),
        color: textColor,
        formatter: (value: number) =>
          panel.x_axis.scientific_notation
            ? value.toExponential(2)
            : `${Number(value.toPrecision(6))}`,
      },
    });

    yAxes.push({
      gridIndex: idx,
      show: has3D ? false : panel.y_axis.visible,
      type: yLog ? "log" : "value",
      name: formatAxisLabel(panel.y_axis.title, panel.y_axis.unit),
      nameLocation: "middle",
      nameGap: 48,
      nameTextStyle: {
        fontSize: panel.y_axis.font_size,
        fontWeight: 600,
        color: textColor,
      },
      min: has3D ? -1.35 : panel.y_axis.min ?? undefined,
      max: has3D ? 1.35 : panel.y_axis.max ?? undefined,
      inverse: panel.y_axis.reversed,
      splitNumber: panel.y_axis.major_tick_count ?? undefined,
      axisLine: {
        show: true,
        lineStyle: { color: axisLineColor, width: 1.25 },
      },
      axisTick: { show: true, inside: true },
      minorTick: {
        show: panel.y_axis.show_minor_grid,
        splitNumber: panel.y_axis.minor_tick_split,
      },
      splitLine: {
        show: panel.y_axis.show_major_grid,
        lineStyle: { color: gridLineColor },
      },
      minorSplitLine: {
        show: panel.y_axis.show_minor_grid,
        lineStyle: { color: minorGridColor },
      },
      axisLabel: {
        fontSize: Math.max(10, panel.y_axis.font_size - 1),
        color: textColor,
        formatter: (value: number) =>
          panel.y_axis.scientific_notation
            ? value.toExponential(2)
            : `${Number(value.toPrecision(6))}`,
      },
    });
  });

  const series: SeriesOption[] = [];

  // Build markLines / annotations for primary panel
  const markLineData: unknown[] = [];
  const markPointData: Record<string, unknown>[] = [];
  for (const ann of plot.annotations) {
    if (ann.kind === "reference_line") {
      markLineData.push(
        ann.axis === "x"
          ? {
              name: ann.label,
              xAxis: ann.value,
              lineStyle: {
                color: ann.color,
                width: ann.line_width,
                type: mapLineStyle(ann.line_style),
              },
              label: { formatter: ann.label, color: ann.color },
            }
          : {
              name: ann.label,
              yAxis: ann.value,
              lineStyle: {
                color: ann.color,
                width: ann.line_width,
                type: mapLineStyle(ann.line_style),
              },
              label: { formatter: ann.label, color: ann.color },
            }
      );
    } else if (ann.kind === "text") {
      markPointData.push({
        name: ann.text,
        coord: [ann.x, ann.y],
        symbol: "pin",
        symbolSize: 28,
        itemStyle: { color: ann.color },
        label: {
          show: true,
          formatter: ann.text,
          color: ann.color,
          position: "top",
          fontSize: ann.font_size || 11,
          fontWeight: 600,
        },
      });
    } else if (ann.kind === "arrow") {
      markLineData.push([
        {
          name: ann.label,
          coord: [ann.x1, ann.y1],
          lineStyle: { color: ann.color, width: ann.line_width },
          label: { formatter: ann.label, color: ann.color },
        },
        {
          coord: [ann.x2, ann.y2],
        },
      ]);
    }
  }

  for (const layer of plot.layers) {
    if (!layer.visible) continue;

    const panelIdx = Math.max(
      0,
      plot.panels.findIndex((p) => p.id === layer.panel_id)
    );
    const panel = plot.panels[panelIdx] ?? plot.panels[0];
    const xLog = panel.x_axis.scale === "log10";
    const yLog = panel.y_axis.scale === "log10";

    const { points, points3D, errorPoints } = resolveLayerData(
      layer,
      datasets,
      analyses,
      xLog,
      yLog
    );

    const symbol = mapSymbolShape(layer.style.symbol_shape);
    const lineType = mapLineStyle(layer.style.line_style);
    const attachAnnotations =
      series.length === 0 &&
      (markLineData.length > 0 || markPointData.length > 0);

    const markOverlays = attachAnnotations
      ? {
          markLine:
            markLineData.length > 0
              ? { silent: true, data: markLineData as never }
              : undefined,
          markPoint:
            markPointData.length > 0
              ? { silent: true, data: markPointData as never }
              : undefined,
        }
      : {};

    if (layer.plot_type === "histogram") {
      const vals = points.map((p) => p[1]);
      if (vals.length > 0) {
        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);
        const bins = Math.max(4, Math.min(80, layer.style.histogram_bins ?? 12));
        const width = (maxV - minV || 1) / bins;
        const counts = new Array<number>(bins).fill(0);
        for (const v of vals) {
          const b = Math.min(bins - 1, Math.max(0, Math.floor((v - minV) / width)));
          counts[b] += 1;
        }
        const histPoints = counts.map((cnt, idx) => [
          minV + (idx + 0.5) * width,
          cnt,
        ]);
        series.push({
          id: layer.id,
          name: layer.label,
          type: "bar",
          xAxisIndex: panelIdx,
          yAxisIndex: panelIdx,
          data: histPoints,
          barWidth: "90%",
          itemStyle: {
            color: layer.style.color,
            opacity: layer.style.opacity * 0.85,
            borderColor: textColor,
            borderWidth: 0.75,
          },
          ...markOverlays,
        });
      }
    } else if (
      layer.plot_type === "box_plot" ||
      layer.plot_type === "violin"
    ) {
      const vals = points
        .map((p) => p[1])
        .sort((a, b) => a - b);
      if (vals.length >= 2) {
        const q = (p: number) => vals[Math.floor(p * (vals.length - 1))];
        const minV = vals[0];
        const q1 = q(0.25);
        const med = q(0.5);
        const q3 = q(0.75);
        const maxV = vals[vals.length - 1];
        const centerX =
          points.reduce((acc, p) => acc + p[0], 0) / points.length;
        const spanX =
          (Math.max(...points.map((p) => p[0])) -
            Math.min(...points.map((p) => p[0])) || 10) * 0.18;

        // Render box/violin summary + jittered observations
        series.push({
          id: `${layer.id}-box`,
          name: `${layer.label} (${layer.plot_type === "violin" ? "Violin" : "Box"})`,
          type: "custom",
          xAxisIndex: panelIdx,
          yAxisIndex: panelIdx,
          data: [[centerX, minV, q1, med, q3, maxV, spanX]],
          renderItem: (_params, api) => {
            const cx = api.value(0) as number;
            const vMin = api.value(1) as number;
            const vQ1 = api.value(2) as number;
            const vMed = api.value(3) as number;
            const vQ3 = api.value(4) as number;
            const vMax = api.value(5) as number;
            const w = api.value(6) as number;

            const ptTop = api.coord([cx, vMax]);
            const ptBottom = api.coord([cx, vMin]);
            const ptQ3Left = api.coord([cx - w, vQ3]);
            const ptQ1Right = api.coord([cx + w, vQ1]);
            const ptMedLeft = api.coord([cx - w, vMed]);
            const ptMedRight = api.coord([cx + w, vMed]);

            return {
              type: "group",
              children: [
                {
                  type: "line",
                  shape: {
                    x1: ptTop[0],
                    y1: ptTop[1],
                    x2: ptBottom[0],
                    y2: ptBottom[1],
                  },
                  style: { stroke: layer.style.color, lineWidth: 1.8 },
                },
                {
                  type: "rect",
                  shape: {
                    x: ptQ3Left[0],
                    y: ptQ3Left[1],
                    width: ptQ1Right[0] - ptQ3Left[0],
                    height: ptQ1Right[1] - ptQ3Left[1],
                  },
                  style: {
                    fill: layer.style.color,
                    opacity: 0.3,
                    stroke: layer.style.color,
                    lineWidth: 2,
                  },
                },
                {
                  type: "line",
                  shape: {
                    x1: ptMedLeft[0],
                    y1: ptMedLeft[1],
                    x2: ptMedRight[0],
                    y2: ptMedRight[1],
                  },
                  style: { stroke: textColor, lineWidth: 2.5 },
                },
              ],
            } as never;
          },
        });
      }
    } else if (
      layer.plot_type === "heatmap" ||
      layer.plot_type === "contour"
    ) {
      if (points3D.length > 0) {
        const zs = points3D.map((p) => p[2]);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        const spanZ = maxZ - minZ || 1;
        series.push({
          id: layer.id,
          name: layer.label,
          type: "scatter",
          xAxisIndex: panelIdx,
          yAxisIndex: panelIdx,
          symbol: layer.plot_type === "heatmap" ? "rect" : "circle",
          symbolSize: layer.plot_type === "heatmap" ? 26 : 14,
          data: points3D.map((p) => ({
            value: [p[0], p[1], p[2]],
            itemStyle: {
              color: sampleColormap(colormap, (p[2] - minZ) / spanZ),
              borderColor:
                layer.plot_type === "contour" ? textColor : "transparent",
              borderWidth: layer.plot_type === "contour" ? 1 : 0,
            },
          })),
        });
      }
    } else if (layer.plot_type === "vector_field") {
      series.push({
        id: layer.id,
        name: layer.label,
        type: "custom",
        xAxisIndex: panelIdx,
        yAxisIndex: panelIdx,
        data: points3D,
        renderItem: (_params, api) => {
          const x = api.value(0) as number;
          const y = api.value(1) as number;
          const angle = ((api.value(2) as number) * Math.PI) / 180;
          const p0 = api.coord([x, y]);
          const dx = 18 * Math.cos(angle);
          const dy = -18 * Math.sin(angle);
          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: {
                  x1: p0[0],
                  y1: p0[1],
                  x2: p0[0] + dx,
                  y2: p0[1] + dy,
                },
                style: { stroke: layer.style.color, lineWidth: 1.8 },
              },
              {
                type: "circle",
                shape: { cx: p0[0] + dx, cy: p0[1] + dy, r: 2.5 },
                style: { fill: layer.style.color },
              },
            ],
          } as never;
        },
      });
    } else if (is3DPlotType(layer.plot_type)) {
      if (points3D.length > 0) {
        const xs = points3D.map((p) => p[0]);
        const ys = points3D.map((p) => p[1]);
        const zs = points3D.map((p) => p[2]);
        const minX = Math.min(...xs),
          maxX = Math.max(...xs),
          spanX = maxX - minX || 1;
        const minY = Math.min(...ys),
          maxY = Math.max(...ys),
          spanY = maxY - minY || 1;
        const minZ = Math.min(...zs),
          maxZ = Math.max(...zs),
          spanZ = maxZ - minZ || 1;

        const norm3D = (x: number, y: number, z: number) =>
          project3DPoint(
            ((x - minX) / spanX) * 1.6 - 0.8,
            ((y - minY) / spanY) * 1.6 - 0.8,
            ((z - minZ) / spanZ) * 1.4 - 0.7,
            cam3D
          );

        // Draw ONLY the 3 principal 3D axes (X, Y, Z) with major/minor ticks, tick labels, and axis titles (no box)
        const formatTick3D = (v: number): string => {
          if (Math.abs(v) < 1e-10) return "0";
          if (Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3)) {
            return v.toExponential(2);
          }
          return `${Number(v.toPrecision(4))}`;
        };

        let zAxisTitle = layer.label || "Z Axis";
        if (layer.source.source_type === "dataset_columns") {
          const src = layer.source;
          const ds = datasets.find((d) => d.id === src.dataset_id);
          const colZ = src.z_col
            ? ds?.columns.find((c) => c.id === src.z_col)
            : ds?.columns.find((c) => c.role === "z") ?? ds?.columns[2];
          if (colZ) {
            zAxisTitle = formatAxisLabel(colZ.name, colZ.unit);
          }
        }
        const xAxisTitle = formatAxisLabel(panel.x_axis.title, panel.x_axis.unit);
        const yAxisTitle = formatAxisLabel(panel.y_axis.title, panel.y_axis.unit);

        type Axis3DItem = {
          kind: "line" | "text";
          x0: number;
          y0: number;
          x1: number;
          y1: number;
          text: string;
          lineWidth: number;
          isTitle: boolean;
          isBoxEdge?: boolean;
        };
        const axis3DItems: Axis3DItem[] = [];

        const pushLine3D = (
          a: [number, number, number],
          b: [number, number, number],
          lineWidth: number,
          isBoxEdge = false
        ) => {
          const p0 = project3DPoint(a[0], a[1], a[2], cam3D);
          const p1 = project3DPoint(b[0], b[1], b[2], cam3D);
          axis3DItems.push({
            kind: "line",
            x0: p0[0],
            y0: p0[1],
            x1: p1[0],
            y1: p1[1],
            text: "",
            lineWidth,
            isTitle: false,
            isBoxEdge,
          });
        };

        const pushText3D = (
          pt: [number, number, number],
          text: string,
          isTitle: boolean
        ) => {
          const p = project3DPoint(pt[0], pt[1], pt[2], cam3D);
          axis3DItems.push({
            kind: "text",
            x0: p[0],
            y0: p[1],
            x1: 0,
            y1: 0,
            text,
            lineWidth: 0,
            isTitle,
          });
        };

        // 3 Principal Axes from Origin (-0.8, -0.8, -0.7)
        pushLine3D([-0.8, -0.8, -0.7], [0.8, -0.8, -0.7], 1.8); // X Axis
        pushLine3D([-0.8, -0.8, -0.7], [-0.8, 0.8, -0.7], 1.8); // Y Axis
        pushLine3D([-0.8, -0.8, -0.7], [-0.8, -0.8, 0.7], 1.8); // Z Axis

        // Optional Full 3D Bounding Box (remaining 9 cube edges)
        if (cam3D.show_box) {
          const boxEdges: [[number, number, number], [number, number, number]][] = [
            // Bottom face remaining 2 edges
            [[0.8, -0.8, -0.7], [0.8, 0.8, -0.7]],
            [[-0.8, 0.8, -0.7], [0.8, 0.8, -0.7]],
            // Top face 4 edges
            [[-0.8, -0.8, 0.7], [0.8, -0.8, 0.7]],
            [[0.8, -0.8, 0.7], [0.8, 0.8, 0.7]],
            [[0.8, 0.8, 0.7], [-0.8, 0.8, 0.7]],
            [[-0.8, 0.8, 0.7], [-0.8, -0.8, 0.7]],
            // Remaining 3 vertical pillars
            [[0.8, -0.8, -0.7], [0.8, -0.8, 0.7]],
            [[0.8, 0.8, -0.7], [0.8, 0.8, 0.7]],
            [[-0.8, 0.8, -0.7], [-0.8, 0.8, 0.7]],
          ];
          for (const [e0, e1] of boxEdges) {
            pushLine3D(e0, e1, 1.15, true);
          }
        }

        const majorDivs = 4;
        const minorPerMajor = 4;
        const totalSteps = majorDivs * minorPerMajor;

        for (let s = 0; s <= totalSteps; s++) {
          const t = s / totalSteps;
          const isMajor = s % minorPerMajor === 0;
          const tickLen = isMajor ? 0.055 : 0.028;
          const tickW = isMajor ? 1.4 : 0.9;

          // X-axis tick & label
          const nx = -0.8 + t * 1.6;
          pushLine3D(
            [nx, -0.8, -0.7],
            [nx, -0.8 - tickLen, -0.7 - tickLen * 0.5],
            tickW
          );
          if (isMajor) {
            pushText3D(
              [nx, -0.92, -0.76],
              formatTick3D(minX + t * spanX),
              false
            );
          }

          // Y-axis tick & label
          const ny = -0.8 + t * 1.6;
          pushLine3D(
            [-0.8, ny, -0.7],
            [-0.8 - tickLen, ny, -0.7 - tickLen * 0.5],
            tickW
          );
          if (isMajor) {
            pushText3D(
              [-0.92, ny, -0.76],
              formatTick3D(minY + t * spanY),
              false
            );
          }

          // Z-axis tick & label
          const nz = -0.7 + t * 1.4;
          pushLine3D(
            [-0.8, -0.8, nz],
            [-0.8 - tickLen * 0.8, -0.8 - tickLen * 0.8, nz],
            tickW
          );
          if (isMajor) {
            pushText3D(
              [-0.92, -0.92, nz],
              formatTick3D(minZ + t * spanZ),
              false
            );
          }
        }

        // Axis Titles for X, Y, Z
        pushText3D([0.0, -1.08, -0.84], xAxisTitle, true);
        pushText3D([-1.08, 0.0, -0.84], yAxisTitle, true);
        pushText3D([-0.96, -0.96, 0.84], zAxisTitle, true);

        series.push({
          type: "custom",
          silent: true,
          xAxisIndex: panelIdx,
          yAxisIndex: panelIdx,
          data: axis3DItems.map((_, idx) => [idx]),
          renderItem: (_params, api) => {
            const idx = api.value(0) as number;
            const item = axis3DItems[idx];
            if (!item) return null as never;
            if (item.kind === "line") {
              const c0 = api.coord([item.x0, item.y0]);
              const c1 = api.coord([item.x1, item.y1]);
              return {
                type: "line",
                shape: { x1: c0[0], y1: c0[1], x2: c1[0], y2: c1[1] },
                style: {
                  stroke: axisLineColor,
                  lineWidth: item.lineWidth,
                  lineDash: item.isBoxEdge ? [4, 3] : undefined,
                  opacity: item.isBoxEdge ? 0.65 : 1.0,
                },
              } as never;
            }
            const pt = api.coord([item.x0, item.y0]);
            return {
              type: "text",
              style: {
                x: pt[0],
                y: pt[1],
                text: item.text,
                fill: textColor,
                font: item.isTitle
                  ? `600 ${Math.max(11, panel.x_axis.font_size)}px ${plot.font_family}`
                  : `${Math.max(10, panel.x_axis.font_size - 2)}px ${plot.font_family}`,
                textAlign: "center",
                textVerticalAlign: "middle",
              },
            } as never;
          },
        });

        if (
          (layer.plot_type === "surface_3d" ||
            layer.plot_type === "wireframe_3d") &&
          points3D.length >= 3
        ) {
          const idwEstimate = (gx: number, gy: number): number => {
            let num = 0;
            let den = 0;
            for (const [px, py, pz] of points3D) {
              const dx = (px - gx) / spanX;
              const dy = (py - gy) / spanY;
              const d2 = dx * dx + dy * dy;
              if (d2 < 1e-12) return pz;
              const w = 1 / ((d2 + 1e-4) * (d2 + 1e-4));
              num += w * pz;
              den += w;
            }
            return den > 0 ? num / den : minZ;
          };

          const uniqX = Array.from(
            new Set(points3D.map((p) => Number(p[0].toPrecision(8))))
          ).sort((a, b) => a - b);
          const uniqY = Array.from(
            new Set(points3D.map((p) => Number(p[1].toPrecision(8))))
          ).sort((a, b) => a - b);

          let gridX: number[];
          let gridY: number[];
          let gridZ: number[][];

          if (
            uniqX.length >= 2 &&
            uniqY.length >= 2 &&
            uniqX.length <= 80 &&
            uniqY.length <= 80 &&
            points3D.length >= uniqX.length * uniqY.length * 0.5
          ) {
            gridX = uniqX;
            gridY = uniqY;
            const lookup = new Map<string, number>();
            for (const [px, py, pz] of points3D) {
              const kx = Number(px.toPrecision(8));
              const ky = Number(py.toPrecision(8));
              lookup.set(`${kx}:${ky}`, pz);
            }
            gridZ = gridY.map((gy) =>
              gridX.map((gx) => lookup.get(`${gx}:${gy}`) ?? idwEstimate(gx, gy))
            );
          } else {
            const res = Math.min(18, Math.max(8, Math.round(Math.sqrt(points3D.length)) + 4));
            gridX = Array.from(
              { length: res },
              (_, i) => minX + (spanX * i) / (res - 1)
            );
            gridY = Array.from(
              { length: res },
              (_, j) => minY + (spanY * j) / (res - 1)
            );
            gridZ = gridY.map((gy) => gridX.map((gx) => idwEstimate(gx, gy)));
          }

          const quads: {
            pts: [number, number][];
            depth: number;
            zNorm: number;
          }[] = [];
          const rowsCount = gridY.length;
          const colsCount = gridX.length;
          for (let r = 0; r < rowsCount - 1; r++) {
            for (let c = 0; c < colsCount - 1; c++) {
              const x0 = gridX[c],
                x1 = gridX[c + 1];
              const y0 = gridY[r],
                y1 = gridY[r + 1];
              const z00 = gridZ[r][c],
                z10 = gridZ[r][c + 1],
                z11 = gridZ[r + 1][c + 1],
                z01 = gridZ[r + 1][c];
              const q00 = norm3D(x0, y0, z00);
              const q10 = norm3D(x1, y0, z10);
              const q11 = norm3D(x1, y1, z11);
              const q01 = norm3D(x0, y1, z01);
              const avgZ = (z00 + z10 + z11 + z01) * 0.25;
              const avgDepth = (q00[2] + q10[2] + q11[2] + q01[2]) * 0.25;
              quads.push({
                pts: [
                  [q00[0], q00[1]],
                  [q10[0], q10[1]],
                  [q11[0], q11[1]],
                  [q01[0], q01[1]],
                ],
                depth: avgDepth,
                zNorm: (avgZ - minZ) / spanZ,
              });
            }
          }
          quads.sort((a, b) => a.depth - b.depth);

          series.push({
            id: layer.id,
            name: layer.label,
            type: "custom",
            xAxisIndex: panelIdx,
            yAxisIndex: panelIdx,
            data: quads.map((q) => [
              q.pts[0][0],
              q.pts[0][1],
              q.pts[1][0],
              q.pts[1][1],
              q.pts[2][0],
              q.pts[2][1],
              q.pts[3][0],
              q.pts[3][1],
              q.zNorm,
            ]),
            renderItem: (_params, api) => {
              const c0 = api.coord([
                api.value(0) as number,
                api.value(1) as number,
              ]);
              const c1 = api.coord([
                api.value(2) as number,
                api.value(3) as number,
              ]);
              const c2 = api.coord([
                api.value(4) as number,
                api.value(5) as number,
              ]);
              const c3 = api.coord([
                api.value(6) as number,
                api.value(7) as number,
              ]);
              const zn = api.value(8) as number;
              const col = sampleColormap(colormap, zn);
              return {
                type: "polygon",
                shape: { points: [c0, c1, c2, c3] },
                style: {
                  fill:
                    layer.plot_type === "wireframe_3d" ? "transparent" : col,
                  opacity: layer.style.opacity * 0.88,
                  stroke:
                    layer.plot_type === "wireframe_3d"
                      ? col
                      : "rgba(15, 23, 42, 0.35)",
                  lineWidth: layer.plot_type === "wireframe_3d" ? 1.5 : 0.8,
                },
              } as never;
            },
          });
        } else {
          // 3D Scatter / 3D Line / Waterfall
          const projected = points3D.map(([x, y, z]) => {
            const p = norm3D(x, y, z);
            return {
              value: [p[0], p[1]],
              itemStyle: {
                color: sampleColormap(colormap, (z - minZ) / spanZ),
              },
            };
          });
          series.push({
            id: layer.id,
            name: layer.label,
            type: layer.plot_type === "scatter_3d" ? "scatter" : "line",
            xAxisIndex: panelIdx,
            yAxisIndex: panelIdx,
            data: projected,
            symbolSize: layer.style.symbol_size + 2,
            lineStyle: {
              color: layer.style.color,
              width: layer.style.line_width,
            },
          });
        }
      }
    } else if (layer.plot_type === "scatter" || layer.plot_type === "polar") {
      const displayPoints =
        layer.plot_type === "polar"
          ? points.map(([deg, r]) => [
              r * Math.cos((deg * Math.PI) / 180),
              r * Math.sin((deg * Math.PI) / 180),
            ])
          : points;
      series.push({
        id: layer.id,
        name: layer.label,
        type: "scatter",
        xAxisIndex: panelIdx,
        yAxisIndex: panelIdx,
        data: displayPoints,
        symbol,
        symbolSize: layer.style.symbol_size,
        itemStyle: {
          color: layer.style.color,
          opacity: layer.style.opacity,
          borderColor: layer.style.color,
          borderWidth: layer.style.symbol_filled ? 0 : 1.5,
        },
        ...markOverlays,
      });
    } else if (
      layer.plot_type === "bar" ||
      layer.plot_type === "stacked_bar"
    ) {
      series.push({
        id: layer.id,
        name: layer.label,
        type: "bar",
        xAxisIndex: panelIdx,
        yAxisIndex: panelIdx,
        stack: layer.plot_type === "stacked_bar" ? "stack-bar" : undefined,
        data: points,
        itemStyle: {
          color: layer.style.color,
          opacity: layer.style.opacity,
        },
        ...markOverlays,
      });
    } else {
      const showSymbol =
        layer.plot_type === "line_symbols" &&
        layer.style.symbol_shape !== "none";
      series.push({
        id: layer.id,
        name: layer.label,
        type: "line",
        xAxisIndex: panelIdx,
        yAxisIndex: panelIdx,
        stack: layer.plot_type === "stacked_area" ? "stack-area" : undefined,
        data: points,
        showSymbol,
        symbol,
        symbolSize: layer.style.symbol_size,
        lineStyle: {
          color: layer.style.color,
          width: layer.style.line_width,
          type: lineType,
          opacity: layer.style.opacity,
        },
        itemStyle: {
          color: layer.style.color,
          opacity: layer.style.opacity,
        },
        areaStyle:
          layer.plot_type === "area" || layer.plot_type === "stacked_area"
            ? {
                color: layer.style.color,
                opacity: 0.22,
              }
            : undefined,
        ...markOverlays,
      });
    }

    // Add error bars layer if enabled and error points exist
    if (
      layer.style.show_error_bars &&
      errorPoints.length > 0 &&
      !is3DPlotType(layer.plot_type)
    ) {
      const capHalf = layer.style.error_bar_cap_width / 2;
      const errColor = layer.style.color;
      const errLineWidth = layer.style.error_bar_line_width;

      series.push({
        id: `${layer.id}-err`,
        name: `${layer.label} Error`,
        type: "custom",
        xAxisIndex: panelIdx,
        yAxisIndex: panelIdx,
        silent: true,
        z: 2,
        data: errorPoints,
        renderItem: (_params, api) => {
          const xVal = api.value(0) as number;
          const yVal = api.value(1) as number;
          const xErr = api.value(2) as number;
          const yErr = api.value(3) as number;

          const children: Record<string, unknown>[] = [];

          if (yErr > 0) {
            const highPt = api.coord([xVal, yVal + yErr]);
            const lowPt = api.coord([
              xVal,
              xLog || yLog ? Math.max(1e-12, yVal - yErr) : yVal - yErr,
            ]);
            if (highPt && lowPt) {
              children.push(
                {
                  type: "line",
                  shape: {
                    x1: highPt[0],
                    y1: highPt[1],
                    x2: lowPt[0],
                    y2: lowPt[1],
                  },
                  style: { stroke: errColor, lineWidth: errLineWidth },
                },
                {
                  type: "line",
                  shape: {
                    x1: highPt[0] - capHalf,
                    y1: highPt[1],
                    x2: highPt[0] + capHalf,
                    y2: highPt[1],
                  },
                  style: { stroke: errColor, lineWidth: errLineWidth },
                },
                {
                  type: "line",
                  shape: {
                    x1: lowPt[0] - capHalf,
                    y1: lowPt[1],
                    x2: lowPt[0] + capHalf,
                    y2: lowPt[1],
                  },
                  style: { stroke: errColor, lineWidth: errLineWidth },
                }
              );
            }
          }

          if (xErr > 0) {
            const rightPt = api.coord([xVal + xErr, yVal]);
            const leftPt = api.coord([
              xLog ? Math.max(1e-12, xVal - xErr) : xVal - xErr,
              yVal,
            ]);
            if (rightPt && leftPt) {
              children.push(
                {
                  type: "line",
                  shape: {
                    x1: leftPt[0],
                    y1: leftPt[1],
                    x2: rightPt[0],
                    y2: rightPt[1],
                  },
                  style: { stroke: errColor, lineWidth: errLineWidth },
                },
                {
                  type: "line",
                  shape: {
                    x1: leftPt[0],
                    y1: leftPt[1] - capHalf,
                    x2: leftPt[0],
                    y2: leftPt[1] + capHalf,
                  },
                  style: { stroke: errColor, lineWidth: errLineWidth },
                },
                {
                  type: "line",
                  shape: {
                    x1: rightPt[0],
                    y1: rightPt[1] - capHalf,
                    x2: rightPt[0],
                    y2: rightPt[1] + capHalf,
                  },
                  style: { stroke: errColor, lineWidth: errLineWidth },
                }
              );
            }
          }

          return {
            type: "group",
            children,
          } as never;
        },
      });
    }
  }

  // Legend position mapping
  const legendPos: Record<string, unknown> = (() => {
    switch (plot.legend.position) {
      case "top_left":
        return { top: plot.margins.top + 8, left: plot.margins.left + 12 };
      case "bottom_right":
        return {
          bottom: plot.margins.bottom + 12,
          right: plot.margins.right + 12,
        };
      case "bottom_left":
        return {
          bottom: plot.margins.bottom + 12,
          left: plot.margins.left + 12,
        };
      case "outside_top":
        return { top: 36, right: plot.margins.right };
      case "outside_right":
      case "top_right":
      default:
        return { top: plot.margins.top + 8, right: plot.margins.right + 12 };
    }
  })();

  const legendNames = plot.layers.filter((l) => l.visible).map((l) => l.label);

  return {
    backgroundColor: plot.export_spec.transparent_background
      ? "transparent"
      : isDarkTheme && plot.background_color === "#FFFFFF"
      ? "#0F172A"
      : plot.background_color,
    animation: false,
    textStyle: {
      fontFamily: plot.font_family,
      fontSize: plot.base_font_size,
      color: textColor,
    },
    title: {
      text: plot.title,
      subtext: plot.subtitle ?? undefined,
      left: "center",
      top: 10,
      textStyle: {
        fontSize: plot.base_font_size + 3,
        fontWeight: 600,
        color: textColor,
      },
      subtextStyle: {
        fontSize: Math.max(11, plot.base_font_size - 1),
        color: isDarkTheme ? "#94A3B8" : "#475569",
      },
    },
    tooltip: {
      trigger: has3D ? "item" : "axis",
      axisPointer: {
        type: "cross",
      },
    },
    legend: {
      show: plot.legend.visible && legendNames.length > 0,
      data: legendNames,
      ...legendPos,
      backgroundColor: plot.legend.frame_visible
        ? isDarkTheme
          ? "rgba(15, 23, 42, 0.85)"
          : "rgba(255, 255, 255, 0.9)"
        : "transparent",
      borderColor: plot.legend.frame_visible
        ? isDarkTheme
          ? "#334155"
          : "#CBD5E1"
        : "transparent",
      borderWidth: plot.legend.frame_visible ? 1 : 0,
      padding: [6, 10],
      textStyle: {
        fontSize: plot.legend.font_size,
        color: textColor,
      },
    },
    graphic: graphicItems as never,
    grid: grids as never,
    xAxis: xAxes as never,
    yAxis: yAxes as never,
    dataZoom: has3D
      ? []
      : plot.panels.flatMap((_, idx) => [
          {
            type: "inside" as const,
            xAxisIndex: idx,
            filterMode: "none" as const,
          },
          {
            type: "inside" as const,
            yAxisIndex: idx,
            filterMode: "none" as const,
          },
        ]),
    series,
  };
}
