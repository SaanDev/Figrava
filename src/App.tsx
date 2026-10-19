import React, { useEffect, useRef, useState } from "react";
import {
  Table2,
  LineChart,
  TrendingUp,
  X,
  Plus,
  FilePlus2,
  Upload,
  FolderOpen,
  Sparkles,
  Save,
  Info,
  Sun,
  Moon,
  Keyboard,
} from "lucide-react";
import { TopMenuToolbar } from "./components/TopMenuToolbar";
import { ProjectExplorer } from "./components/ProjectExplorer";
import { PropertiesInspector } from "./components/PropertiesInspector";
import { StatusBar } from "./components/StatusBar";
import { WorkspaceModals } from "./components/WorkspaceModals";
import {
  DesktopContextMenu,
  ContextMenuEntry,
} from "./components/DesktopContextMenu";
import { SpreadsheetEditor } from "./features/spreadsheet/SpreadsheetEditor";
import { PlotWorkspace } from "./features/plotting/PlotWorkspace";
import { AnalysisReportView } from "./features/analysis/AnalysisReportView";
import { useWorkspaceStore } from "./stores/useWorkspaceStore";
import { tauriClient } from "./services/tauriClient";

export const App: React.FC = () => {
  const {
    snapshot,
    openTabs,
    activeTabId,
    theme,
    leftPanelWidth,
    rightPanelWidth,
    initialize,
    setActiveTab,
    closeTab,
    setActiveModal,
    setLeftPanelWidth,
    setRightPanelWidth,
    toggleTheme,
    newProject,
    importProjectFile,
    openProjectWithDialog,
    saveProjectQuick,
    undo,
    redo,
    exportProjectFile,
  } = useWorkspaceStore();

  const [newProjectName, setNewProjectName] = useState("Untitled Project");
  const openProjectInputRef = useRef<HTMLInputElement>(null);
  const [globalMenu, setGlobalMenu] = useState<{
    x: number;
    y: number;
    tabId?: string;
    tabTitle?: string;
  } | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Suppress default web browser right-click menu globally and show fallback desktop menu
  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.defaultPrevented) {
        // A specialized workspace component already handled this context menu
        setGlobalMenu(null);
        return;
      }
      e.preventDefault();
      setGlobalMenu({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("contextmenu", handleGlobalContextMenu);
    return () =>
      window.removeEventListener("contextmenu", handleGlobalContextMenu);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // Block web browser reload shortcuts
      if (
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")
      ) {
        e.preventDefault();
        return;
      }

      if (e.key === "F1") {
        e.preventDefault();
        setActiveModal("about");
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !isEditingInput && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !isEditingInput &&
        e.key.toLowerCase() === "y"
      ) {
        e.preventDefault();
        redo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "s"
      ) {
        e.preventDefault();
        exportProjectFile();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProjectQuick();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (tauriClient.isTauri()) {
          openProjectWithDialog();
        } else {
          openProjectInputRef.current?.click();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newProject("Untitled Project", false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setActiveModal("import_csv");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        // Prevent browser print dialog and open New Plot modal
        e.preventDefault();
        setActiveModal("new_plot");
      } else if (
        (e.ctrlKey || e.metaKey) &&
        !isEditingInput &&
        e.key.toLowerCase() === "f"
      ) {
        // Prevent browser find bar and open Curve Fit modal
        e.preventDefault();
        setActiveModal("curve_fit");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    redo,
    exportProjectFile,
    saveProjectQuick,
    openProjectWithDialog,
    newProject,
    setActiveModal,
  ]);

  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftPanelWidth;
    const onMove = (ev: MouseEvent) => {
      setLeftPanelWidth(startWidth + (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startResizeRight = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    const onMove = (ev: MouseEvent) => {
      setRightPanelWidth(startWidth - (ev.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleOpenExistingProject = () => {
    if (tauriClient.isTauri()) {
      openProjectWithDialog();
    } else {
      openProjectInputRef.current?.click();
    }
  };

  if (!snapshot) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 text-sm select-none">
        <img
          src="/icon.png"
          alt="Figrava"
          className="w-12 h-12 rounded-xl shadow-md object-contain"
        />
        <span>Initializing Figrava v1.0 (Scientific Figures &amp; Data Visualization)...</span>
      </div>
    );
  }

  const { project } = snapshot;
  const activeWorksheet = project.worksheets.find(
    (w) => w.id === activeTabId
  );
  const activeDataset = activeWorksheet
    ? project.datasets.find((d) => d.id === activeWorksheet.dataset_id)
    : undefined;
  const activePlot = project.plots.find((p) => p.id === activeTabId);
  const activeAnalysis = project.analyses.find((a) => a.id === activeTabId);

  const buildGlobalMenuItems = (): ContextMenuEntry[] => {
    if (!globalMenu) return [];

    if (globalMenu.tabId) {
      const targetTabId = globalMenu.tabId;
      return [
        {
          id: "hdr-tab",
          header: `Tab • ${globalMenu.tabTitle ?? "Document"}`,
        },
        {
          id: "activate-tab",
          label: "Focus Tab",
          action: () => setActiveTab(targetTabId),
        },
        {
          id: "close-tab",
          label: "Close Tab",
          icon: <X className="w-3.5 h-3.5 text-slate-500" />,
          action: () => closeTab(targetTabId),
        },
        {
          id: "close-other-tabs",
          label: "Close Other Tabs",
          disabled: openTabs.length <= 1,
          action: () => {
            for (const t of openTabs) {
              if (t.id !== targetTabId) {
                closeTab(t.id);
              }
            }
          },
        },
        { id: "div-tab", divider: true },
        {
          id: "new-plot-tab",
          label: "New Graph Tab...",
          shortcut: "Ctrl+P",
          icon: <Plus className="w-3.5 h-3.5 text-indigo-500" />,
          disabled: project.datasets.length === 0,
          action: () => setActiveModal("new_plot"),
        },
      ];
    }

    return [
      {
        id: "hdr-workspace",
        header: "Figrava v1.0 Desktop Workspace",
      },
      {
        id: "new-blank-proj",
        label: "New Blank Project (With Sheet)",
        shortcut: "Ctrl+N",
        icon: <FilePlus2 className="w-3.5 h-3.5 text-sky-500" />,
        action: () => newProject("Untitled Project", false),
      },
      {
        id: "open-proj",
        label: "Open Project (.spsproj)...",
        shortcut: "Ctrl+O",
        icon: <FolderOpen className="w-3.5 h-3.5 text-amber-500" />,
        action: handleOpenExistingProject,
      },
      {
        id: "save-proj",
        label: "Save Project...",
        shortcut: "Ctrl+S",
        icon: <Save className="w-3.5 h-3.5 text-emerald-500" />,
        action: () => saveProjectQuick(),
      },
      { id: "div-ws-1", divider: true },
      {
        id: "import-data",
        label: "Import Dataset (CSV / TSV / Excel)...",
        shortcut: "Ctrl+I",
        icon: <Upload className="w-3.5 h-3.5 text-sky-500" />,
        action: () => setActiveModal("import_csv"),
      },
      {
        id: "create-graph",
        label: "Create 2D / 3D Graph...",
        shortcut: "Ctrl+P",
        icon: <LineChart className="w-3.5 h-3.5 text-indigo-500" />,
        disabled: project.datasets.length === 0,
        action: () => setActiveModal("new_plot"),
      },
      { id: "div-ws-2", divider: true },
      {
        id: "toggle-theme",
        label:
          theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        icon:
          theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-slate-600" />
          ),
        action: toggleTheme,
      },
      {
        id: "shortcuts",
        label: "Keyboard Shortcuts & Guide...",
        icon: <Keyboard className="w-3.5 h-3.5 text-indigo-500" />,
        action: () => setActiveModal("shortcuts"),
      },
      {
        id: "about-figrava",
        label: "About Figrava",
        shortcut: "F1",
        icon: <Info className="w-3.5 h-3.5 text-sky-500" />,
        action: () => setActiveModal("about"),
      },
    ];
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden select-none">
      <TopMenuToolbar />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Resizable Project Explorer */}
        <div style={{ width: `${leftPanelWidth}px` }} className="shrink-0 h-full">
          <ProjectExplorer />
        </div>

        <div
          onMouseDown={startResizeLeft}
          className="w-1 cursor-col-resize bg-transparent hover:bg-sky-500/40 transition-colors shrink-0"
        />

        {/* Central Tabbed Document Workspace */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Document Tab Bar */}
          <div className="h-9 bg-slate-200/70 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center px-2 gap-1 overflow-x-auto">
            {openTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setGlobalMenu({
                      x: e.clientX,
                      y: e.clientY,
                      tabId: tab.id,
                      tabTitle: tab.title,
                    });
                  }}
                  className={`group h-7 px-2.5 rounded-t-md flex items-center gap-1.5 text-xs cursor-pointer transition-colors shrink-0 border-t border-x ${
                    isActive
                      ? "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-sky-700 dark:text-sky-300 font-semibold"
                      : "bg-slate-100/70 dark:bg-slate-800/50 border-transparent text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800"
                  }`}
                >
                  {tab.kind === "worksheet" && (
                    <Table2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  )}
                  {tab.kind === "plot" && (
                    <LineChart className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  )}
                  {tab.kind === "analysis" && (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="max-w-[160px] truncate">{tab.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            {project.datasets.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveModal("new_plot")}
                title="New Graph Tab"
                className="p-1 rounded hover:bg-slate-300/60 dark:hover:bg-slate-800 text-slate-500"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Active Document View */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeWorksheet && activeDataset ? (
              <SpreadsheetEditor
                worksheet={activeWorksheet}
                dataset={activeDataset}
              />
            ) : activePlot ? (
              <PlotWorkspace
                plot={activePlot}
                datasets={project.datasets}
                analyses={project.analyses}
              />
            ) : activeAnalysis ? (
              <AnalysisReportView
                analysis={activeAnalysis}
                plots={project.plots}
              />
            ) : (
              <div className="h-full flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
                <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg p-6 space-y-5">
                  <div className="flex flex-col items-center text-center space-y-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="px-4 py-2 rounded-xl bg-white dark:bg-slate-100 shadow-xs border border-slate-100 dark:border-slate-200">
                      <img
                        src="/Logo.png"
                        alt="Figrava Logo"
                        className="h-14 w-auto object-contain mx-auto"
                      />
                    </div>
                    <div>
                      <h1 className="text-sm font-bold text-sky-800 dark:text-sky-300">
                        Figrava v1.0 (Scientific Figures &amp; Data Visualization)
                      </h1>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                      Start a New Project
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Create a blank scientific project with an empty worksheet, or import an existing dataset to begin.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Project Name
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            newProject(
                              newProjectName.trim() || "Untitled Project",
                              false
                            );
                          }
                        }}
                        placeholder="Untitled Project"
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          newProject(
                            newProjectName.trim() || "Untitled Project",
                            false
                          )
                        }
                        className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow-sm"
                      >
                        <FilePlus2 className="w-3.5 h-3.5" />
                        Start New Project
                      </button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Or Quick Actions
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveModal("import_csv")}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-2 text-slate-700 dark:text-slate-200"
                      >
                        <Upload className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                        Import CSV / TSV / Excel Dataset...
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenExistingProject}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-2 text-slate-700 dark:text-slate-200"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        Open Existing Project (.spsproj)...
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          newProject(
                            "Optical Spectroscopy & Calibration Study",
                            true
                          )
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-2 text-slate-700 dark:text-slate-200"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Load Demo Spectroscopy Project
                      </button>
                    </div>
                    <input
                      ref={openProjectInputRef}
                      type="file"
                      accept=".spsproj,.json"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const buf = await file.arrayBuffer();
                        await importProjectFile(new Uint8Array(buf), file.name);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        <div
          onMouseDown={startResizeRight}
          className="w-1 cursor-col-resize bg-transparent hover:bg-sky-500/40 transition-colors shrink-0"
        />

        {/* Right Resizable Properties Inspector */}
        <div
          style={{ width: `${rightPanelWidth}px` }}
          className="shrink-0 h-full"
        >
          <PropertiesInspector />
        </div>
      </div>

      <StatusBar />
      <WorkspaceModals />

      {globalMenu && (
        <DesktopContextMenu
          x={globalMenu.x}
          y={globalMenu.y}
          items={buildGlobalMenuItems()}
          onClose={() => setGlobalMenu(null)}
        />
      )}
    </div>
  );
};

