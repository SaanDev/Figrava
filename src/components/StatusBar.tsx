import React from "react";
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  Database,
  LineChart,
  Sigma,
} from "lucide-react";
import { useWorkspaceStore } from "../stores/useWorkspaceStore";

export const StatusBar: React.FC = () => {
  const { snapshot, statusMessage, statusLevel, setActiveModal } =
    useWorkspaceStore();

  const levelBadge = () => {
    switch (statusLevel) {
      case "success":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case "warning":
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
      case "error":
        return <XCircle className="w-3.5 h-3.5 text-red-500" />;
      case "info":
      default:
        return <Info className="w-3.5 h-3.5 text-sky-500" />;
    }
  };

  return (
    <footer className="h-7 px-3 border-t border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 select-none">
      <div className="flex items-center gap-2 truncate">
        {levelBadge()}
        <span className="truncate">{statusMessage}</span>
      </div>

      {snapshot && (
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3 text-sky-600 dark:text-sky-400" />
            <span>{snapshot.project.datasets.length} Datasets</span>
          </div>
          <div className="flex items-center gap-1">
            <LineChart className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
            <span>{snapshot.project.plots.length} Figures</span>
          </div>
          <div className="flex items-center gap-1">
            <Sigma className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>{snapshot.project.analyses.length} Fits</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal("about")}
            title="About Figrava"
            className="flex items-center gap-1.5 pl-3 border-l border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
          >
            <img
              src="/icon.png"
              alt="Figrava"
              className="w-3.5 h-3.5 rounded-xs object-contain"
            />
            <span>Figrava v1.0</span>
          </button>
        </div>
      )}
    </footer>
  );
};

