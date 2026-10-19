import React, { useRef, useState } from "react";
import {
  FilePlus,
  FolderOpen,
  Save,
  Upload,
  Undo2,
  Redo2,
  ScatterChart,
  TrendingUp,
  Sigma,
  Sun,
  Moon,
  FlaskConical,
  Calculator,
  Activity,
  Box,
  Play,
  Scale,
  Info,
} from "lucide-react";
import { tauriClient } from "../services/tauriClient";
import { useWorkspaceStore } from "../stores/useWorkspaceStore";

export const TopMenuToolbar: React.FC = () => {
  const {
    snapshot,
    theme,
    toggleTheme,
    newProject,
    setActiveModal,
    undo,
    redo,
    saveProjectQuick,
    exportProjectFile,
    openProjectWithDialog,
    importProjectFile,
    load3DSample,
  } = useWorkspaceStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenProjectAction = async () => {
    const openedNative = await openProjectWithDialog();
    if (
      !openedNative &&
      typeof window !== "undefined" &&
      !("__TAURI_INTERNALS__" in window)
    ) {
      projectFileInputRef.current?.click();
    }
  };

  const handleOpenProjectFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    await importProjectFile(new Uint8Array(buf), file.name);
    e.target.value = "";
  };

  const menus: Record<
    string,
    { label: string; shortcut?: string; action: () => void }[]
  > = {
    File: [
      {
        label: "New Blank Project",
        shortcut: "Ctrl+N",
        action: () => void newProject("Untitled Project", false),
      },
      {
        label: "Open Project (.spsproj)...",
        shortcut: "Ctrl+O",
        action: () => void handleOpenProjectAction(),
      },
      {
        label: "Save Project",
        shortcut: "Ctrl+S",
        action: () => void saveProjectQuick(),
      },
      {
        label: "Save Project As (.spsproj)...",
        shortcut: "Ctrl+Shift+S",
        action: () => void exportProjectFile(),
      },
      {
        label: "Import CSV / TSV / Excel (.xlsx)...",
        shortcut: "Ctrl+I",
        action: () => setActiveModal("import_csv"),
      },
      {
        label: "Load Spectroscopy & Calibration Demo",
        action: () => void newProject("Optical Spectroscopy Study", true),
      },
      {
        label: "Load 3D Laser Beam Surface Demo",
        action: () => void load3DSample(),
      },
      {
        label: "Exit Figrava",
        shortcut: "Alt+F4",
        action: () => void tauriClient.exitApplication(),
      },
    ],
    Edit: [
      {
        label: "Undo",
        shortcut: "Ctrl+Z",
        action: () => void undo(),
      },
      {
        label: "Redo",
        shortcut: "Ctrl+Y",
        action: () => void redo(),
      },
    ],
    Data: [
      {
        label: "Import Delimited / Excel Dataset...",
        shortcut: "Ctrl+I",
        action: () => setActiveModal("import_csv"),
      },
      {
        label: "Column Mathematical & Smoothing Transform...",
        action: () => setActiveModal("transform_column"),
      },
      {
        label: "Descriptive Statistics Summary...",
        action: () => setActiveModal("column_stats"),
      },
    ],
    Plot: [
      {
        label: "New 2D / Statistical / 3D Graph...",
        shortcut: "Ctrl+P",
        action: () => setActiveModal("new_plot"),
      },
      {
        label: "Load 3D Surface & Contour Demo...",
        action: () => void load3DSample(),
      },
    ],
    Analysis: [
      {
        label: "Linear, Polynomial & Custom Curve Fitting...",
        shortcut: "Ctrl+F",
        action: () => setActiveModal("curve_fit"),
      },
      {
        label: "Multi-Peak Deconvolution (Gaussian / Lorentzian)...",
        action: () => setActiveModal("curve_fit"),
      },
      {
        label: "Signal Processing (FFT, Filter, Peak Finder, Integrate)...",
        action: () => setActiveModal("signal_processing"),
      },
      {
        label: "Hypothesis Testing (t-Test & One-Way ANOVA)...",
        action: () => setActiveModal("hypothesis"),
      },
      {
        label: "Reusable Analysis Workflow Pipelines...",
        action: () => setActiveModal("workflows"),
      },
      {
        label: "Descriptive Column Statistics...",
        action: () => setActiveModal("column_stats"),
      },
    ],
    Window: [
      {
        label:
          theme === "light" ? "Switch to Dark Theme" : "Switch to Light Theme",
        action: () => toggleTheme(),
      },
      {
        label: "Keyboard Shortcuts & Desktop Guide...",
        action: () => setActiveModal("shortcuts"),
      },
    ],
    About: [
      {
        label: "About Figrava",
        shortcut: "F1",
        action: () => setActiveModal("about"),
      },
    ],
  };

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none z-30">
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".spsproj,.json"
        className="hidden"
        onChange={handleOpenProjectFile}
      />

      {/* Top Menu Bar */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-slate-100 dark:border-slate-800/80 text-xs">
        <div className="flex items-center space-x-1">
          {Object.entries(menus).map(([menuName, items]) => (
            <div
              key={menuName}
              className="relative"
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button
                type="button"
                onClick={() =>
                  setOpenMenu(openMenu === menuName ? null : menuName)
                }
                onMouseEnter={() => {
                  if (openMenu) setOpenMenu(menuName);
                }}
                className="px-2.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
              >
                {menuName}
              </button>

              {openMenu === menuName && (
                <div className="absolute left-0 top-full w-72 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50">
                  {items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        item.action();
                      }}
                      className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-sky-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="text-[10px] text-slate-400">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          {snapshot && (
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {snapshot.project.name}
              {snapshot.dirty ? " *" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setActiveModal("about")}
            title="About Figrava"
            className="text-[11px] bg-sky-100 dark:bg-sky-900/60 hover:bg-sky-200 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-300 font-semibold px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
          >
            <Info className="w-3 h-3" />
            <span>Figrava v1.0</span>
          </button>
        </div>
      </div>

      {/* Primary Action Toolbar */}
      <div className="flex items-center justify-between px-3 h-10 bg-slate-50/70 dark:bg-slate-900/60 text-xs overflow-x-auto">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => newProject("Untitled Project", false)}
            title="New Blank Project"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <FilePlus className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>New</span>
          </button>

          <button
            type="button"
            onClick={() => newProject("Optical Spectroscopy Study", true)}
            title="Load Sample Spectroscopy & Calibration Project"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <FlaskConical className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Demo</span>
          </button>

          <button
            type="button"
            onClick={() => load3DSample()}
            title="Load 3D Laser Surface Profile & Plot"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Box className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
            <span>3D Demo</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenProjectAction()}
            title="Open .spsproj Project (Ctrl+O)"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Open</span>
          </button>

          <button
            type="button"
            onClick={() => void saveProjectQuick()}
            title="Save .spsproj Project (Ctrl+S)"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Save className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Save</span>
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          <button
            type="button"
            onClick={() => setActiveModal("import_csv")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Import CSV/XLSX</span>
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          <button
            type="button"
            disabled={!snapshot?.can_undo}
            onClick={() => undo()}
            title="Undo"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-35 text-slate-700 dark:text-slate-200"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!snapshot?.can_redo}
            onClick={() => redo()}
            title="Redo"
            className="p-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-35 text-slate-700 dark:text-slate-200"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          <button
            type="button"
            onClick={() => setActiveModal("new_plot")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-xs"
          >
            <ScatterChart className="w-3.5 h-3.5" />
            <span>Create Graph</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("curve_fit")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs ml-0.5"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Fit Curve</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("signal_processing")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Activity className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Signal & Peaks</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("hypothesis")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Scale className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>t-Test / ANOVA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("column_stats")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Sigma className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>Stats</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("transform_column")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Calculator className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>Transform</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal("workflows")}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Play className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Workflows</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveModal("about")}
            title="About Figrava v1.0 (F1)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium"
          >
            <Info className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>About</span>
          </button>

          <button
            type="button"
            onClick={() => toggleTheme()}
            title="Toggle Light / Dark Theme"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            {theme === "light" ? (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
