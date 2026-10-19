import { describe, expect, it } from "vitest";
import { buildEChartsOption, resolveLayerData } from "./echartsAdapter";
import { tauriClient } from "../../services/tauriClient";

describe("echartsAdapter", () => {
  it("resolves dataset columns, error bars, and analysis curves accurately", async () => {
    const snap = await tauriClient.newProject("Demo", true);
    const { project } = snap;
    const plot = project.plots[0];
    expect(plot).toBeDefined();
    expect(plot.layers.length).toBe(3);

    // Layer 0 is scatter with error bars
    const resolved0 = resolveLayerData(
      plot.layers[0],
      project.datasets,
      project.analyses,
      false,
      false
    );
    expect(resolved0.points.length).toBe(41);
    expect(resolved0.errorPoints.length).toBe(41);

    // Layer 2 is the Gaussian fitted curve (200 smooth points)
    const resolvedFit = resolveLayerData(
      plot.layers[2],
      project.datasets,
      project.analyses,
      false,
      false
    );
    expect(resolvedFit.points.length).toBe(200);
  });

  it("filters out non-positive values when logarithmic axes are enabled", async () => {
    const snap = await tauriClient.newProject("Log Test", false);
    const ds = snap.project.datasets[0];
    ds.columns[0].values = [-5, 0, 3, 4, 5].map((v) => ({
      kind: "numeric" as const,
      value: v,
    }));
    ds.columns[1].values = [2.1, 3.9, 6.2, 8.0, 9.9].map((v) => ({
      kind: "numeric" as const,
      value: v,
    }));

    const plotSnap = await tauriClient.createPlot(
      "Log Plot",
      ds.id,
      ds.columns[0].id,
      ds.columns[1].id,
      null,
      "scatter"
    );
    const plot = plotSnap.project.plots[0];
    plot.panels[0].x_axis.scale = "log10";

    const resolved = resolveLayerData(
      plot.layers[0],
      [ds],
      [],
      true,
      false
    );
    // Only the 3 strictly positive X points (3, 4, 5) remain
    expect(resolved.points.length).toBe(3);

    const option = buildEChartsOption(plot, [ds], [], false);
    expect(option.xAxis).toBeDefined();
  });

  it("renders 3D surface plots with depth-sorted polygons and 3D coordinate wireframe cube for both square and arbitrary x,y,z CSV datasets", async () => {
    const snap = await tauriClient.load3DSample();
    const { project } = snap;
    const plot3d = project.plots[project.plots.length - 1];
    expect(plot3d.layers[0].plot_type).toBe("surface_3d");

    const option = buildEChartsOption(
      plot3d,
      project.datasets,
      project.analyses,
      false
    );
    expect(Array.isArray(option.series)).toBe(true);
    expect((option.series as unknown[]).length).toBeGreaterThanOrEqual(2);

    // Also test non-square x, y, z CSV dataset (e.g., 6 rows)
    const csvSnap = await tauriClient.importDelimitedDataset(
      "x,y,z\n0,0,1\n1,0,2\n2,0,3\n0,1,4\n1,1,5\n2,1,6\n",
      "rect_xyz.csv",
      { delimiter: ",", has_header: true, dataset_name: "RectXYZ" }
    );
    const xyzDs = csvSnap.project.datasets.find((d) => d.name === "RectXYZ")!;
    const xyzPlotSnap = await tauriClient.createPlot(
      "Rect 3D Surface",
      xyzDs.id,
      xyzDs.columns[0].id,
      xyzDs.columns[1].id,
      null,
      "surface_3d",
      xyzDs.columns[2].id
    );
    const xyzPlot =
      xyzPlotSnap.project.plots[xyzPlotSnap.project.plots.length - 1];
    const xyzOptionNoBox = buildEChartsOption(
      xyzPlot,
      xyzPlotSnap.project.datasets,
      [],
      false
    );
    const axisSeriesNoBox = (
      xyzOptionNoBox.series as { type?: string; data?: unknown[] }[]
    )[0];
    expect(axisSeriesNoBox.type).toBe("custom");
    const countWithoutBox = axisSeriesNoBox.data?.length ?? 0;

    xyzPlot.camera_3d = {
      ...(xyzPlot.camera_3d ?? {
        azimuth_deg: 42,
        elevation_deg: 28,
        distance: 100,
        z_scale: 1,
      }),
      show_box: true,
    };
    const xyzOptionWithBox = buildEChartsOption(
      xyzPlot,
      xyzPlotSnap.project.datasets,
      [],
      false
    );
    const axisSeriesWithBox = (
      xyzOptionWithBox.series as { type?: string; data?: unknown[] }[]
    )[0];
    expect(axisSeriesWithBox.data?.length).toBe(countWithoutBox + 9);
  });

  it("renders statistical histogram and multi-panel subplot grids", async () => {
    const snap = await tauriClient.newProject("Stats Test", true);
    const ds = snap.project.datasets[0];
    const plotSnap = await tauriClient.createPlot(
      "Histogram Plot",
      ds.id,
      ds.columns[0].id,
      ds.columns[1].id,
      null,
      "histogram"
    );
    const plot = plotSnap.project.plots[plotSnap.project.plots.length - 1];
    plot.grid_rows = 1;
    plot.grid_cols = 2;
    plot.panels.push({
      ...structuredClone(plot.panels[0]),
      id: "panel-2",
      col: 1,
      subfigure_label: "(b)",
    });

    const option = buildEChartsOption(plot, [ds], [], false);
    expect(Array.isArray(option.grid)).toBe(true);
    expect((option.grid as unknown[]).length).toBe(2);
  });
});
