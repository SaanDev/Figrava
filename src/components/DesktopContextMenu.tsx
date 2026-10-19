import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ContextMenuEntry {
  id: string;
  label?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  header?: string;
  action?: () => void;
}

interface DesktopContextMenuProps {
  x: number;
  y: number;
  title?: string;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export const DesktopContextMenu: React.FC<DesktopContextMenuProps> = ({
  x,
  y,
  title,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampedLeft = Math.max(8, Math.min(x, vw - rect.width - 8));
    const clampedTop = Math.max(8, Math.min(y, vh - rect.height - 8));
    setPos({ left: clampedLeft, top: clampedTop });
  }, [x, y, items]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed z-[100] min-w-[235px] max-w-[300px] py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/98 dark:bg-slate-900/98 backdrop-blur-md shadow-2xl text-xs select-none"
    >
      {title && (
        <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 truncate bg-slate-50/70 dark:bg-slate-800/50">
          {title}
        </div>
      )}

      {items.map((item) => {
        if (item.divider) {
          return (
            <div
              key={item.id}
              className="my-1 border-t border-slate-200/80 dark:border-slate-800"
            />
          );
        }
        if (item.header) {
          return (
            <div
              key={item.id}
              className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              {item.header}
            </div>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              onClose();
              item.action?.();
            }}
            className={`w-full px-3 py-1.5 text-left flex items-center justify-between gap-3 transition-colors ${
              item.disabled
                ? "opacity-40 cursor-not-allowed text-slate-400"
                : item.danger
                ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                : "text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {item.icon && (
                <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                  {item.icon}
                </span>
              )}
              <span className="truncate font-medium">{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
