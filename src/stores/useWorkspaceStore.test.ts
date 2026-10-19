import { describe, expect, it } from "vitest";
import { useWorkspaceStore } from "./useWorkspaceStore";

describe("useWorkspaceStore", () => {
  it("starts with a completely blank project, starts a new project, imports CSV, creates 2D/3D plots, fits curve, and supports undo/redo", async () => {
    const store = useWorkspaceStore.getState();
    await store.initialize();

    let state = useWorkspaceStore.getState();
    expect(state.snapshot).not.toBeNull();
    expect(state.openTabs.length).toBe(0);
    expect(state.snapshot!.project.datasets.length).toBe(0);

    // Start a new blank project
    await state.newProject("New Blank Study", false);
    state = useWorkspaceStore.getState();
    expect(state.openTabs.length).toBe(1);

    // Import a CSV dataset
    const csv = "X [s],Y [V]\n1,2\n2,4\n3,6\n4,8\n";
    await state.importDelimited(csv, "voltage.csv", {
      delimiter: ",",
      has_header: true,
      dataset_name: "Voltage",
    });

    state = useWorkspaceStore.getState();
    const importedDs = state.snapshot!.project.datasets.find(
      (d) => d.name === "Voltage"
    );
    expect(importedDs).toBeDefined();
    expect(importedDs!.columns.length).toBe(2);

    // Create a plot from the imported dataset
    await state.createPlot(
      "Voltage vs Time",
      importedDs!.id,
      importedDs!.columns[0].id,
      importedDs!.columns[1].id,
      null,
      "scatter"
    );

    state = useWorkspaceStore.getState();
    const createdPlot = state.snapshot!.project.plots.find(
      (p) => p.name === "Voltage vs Time"
    );
    expect(createdPlot).toBeDefined();

    // Import an x,y,z CSV and create a 3D Surface plot
    const xyzCsv = "x,y,z\n0,0,1.0\n1,0,2.5\n0,1,3.0\n1,1,4.5\n";
    await state.importDelimited(xyzCsv, "surface.csv", {
      delimiter: ",",
      has_header: true,
      dataset_name: "SurfaceXYZ",
    });
    state = useWorkspaceStore.getState();
    const xyzDs = state.snapshot!.project.datasets.find(
      (d) => d.name === "SurfaceXYZ"
    );
    expect(xyzDs).toBeDefined();
    expect(xyzDs!.columns[2].role).toBe("z");

    await state.createPlot(
      "XYZ Surface Plot",
      xyzDs!.id,
      xyzDs!.columns[0].id,
      xyzDs!.columns[1].id,
      null,
      "surface_3d",
      xyzDs!.columns[2].id
    );
    state = useWorkspaceStore.getState();
    expect(
      state.snapshot!.project.plots.some((p) => p.name === "XYZ Surface Plot")
    ).toBe(true);

    // Execute linear fit and attach to plot
    await state.executeCurveFit(
      {
        dataset_id: importedDs!.id,
        x_col: importedDs!.columns[0].id,
        y_col: importedDs!.columns[1].id,
        y_err_col: null,
        model: { model_type: "linear" },
        x_range: null,
        initial_parameters: null,
        lower_bounds: null,
        upper_bounds: null,
        use_weights: false,
        max_iterations: 100,
        tolerance: 1e-10,
        curve_points: 100,
      },
      "Voltage Linear Fit",
      createdPlot!.id
    );

    state = useWorkspaceStore.getState();
    expect(
      state.snapshot!.project.analyses.some(
        (a) => a.name === "Voltage Linear Fit"
      )
    ).toBe(true);

    // Test undo
    expect(state.snapshot!.can_undo).toBe(true);
    await state.undo();
    state = useWorkspaceStore.getState();
    expect(state.snapshot!.can_redo).toBe(true);
  });
});
