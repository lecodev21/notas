"use client";

import { useState, useRef, useEffect } from "react";
import type { Notebook } from "@/generated/prisma/client";

type NotebookWithChildren = Notebook & {
  children?: NotebookWithChildren[];
  _count?: { notes: number };
};

interface NotebookTreeProps {
  notebooks: NotebookWithChildren[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onNewChild?: (parentId: string, name: string) => void;
  depth?: number;
}

export function NotebookTree({
  notebooks,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onNewChild,
  depth = 0,
}: NotebookTreeProps) {
  return (
    <ul className="space-y-0.5">
      {notebooks.map((nb) => (
        <NotebookItem
          key={nb.id}
          notebook={nb}
          selectedId={selectedId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onNewChild={onNewChild}
          depth={depth}
        />
      ))}
    </ul>
  );
}

function NotebookItem({
  notebook,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onNewChild,
  depth,
}: {
  notebook: NotebookWithChildren;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onNewChild?: (parentId: string, name: string) => void;
  depth: number;
}) {
  const hasChildren = (notebook.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(notebook.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const isSelected = selectedId === notebook.id;
  const menuRef = useRef<HTMLDivElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function handleRenameSubmit() {
    if (renameValue.trim() && renameValue !== notebook.name) {
      onRename?.(notebook.id, renameValue.trim());
    }
    setRenaming(false);
  }

  function handleAddChild() {
    setAddingChild(true);
    setExpanded(true);
    setMenuOpen(false);
    // Focus the input after it mounts
    setTimeout(() => childInputRef.current?.focus(), 0);
  }

  function handleChildSubmit() {
    if (childName.trim()) {
      onNewChild?.(notebook.id, childName.trim());
    }
    setAddingChild(false);
    setChildName("");
  }

  return (
    <li>
      <div
        className="group flex items-center rounded-md transition-colors"
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          paddingRight: "4px",
          backgroundColor: isSelected ? "rgba(99,102,241,0.15)" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--app-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "";
        }}
      >
        {/* Expand toggle */}
        <button
          className="w-3 h-3 flex items-center justify-center shrink-0 mr-0.5 text-[10px]"
          style={{ color: "var(--app-text-faint)" }}
          onClick={() => setExpanded((v) => !v)}
        >
          {hasChildren ? (expanded ? "▾" : "▸") : ""}
        </button>

        {/* Notebook name / rename input */}
        {renaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 text-xs rounded px-1 py-0.5 outline-none border border-indigo-500 min-w-0 mr-1"
            style={{
              backgroundColor: "var(--app-bg-input)",
              color: "var(--app-text-primary)",
            }}
          />
        ) : (
          <button
            onClick={() => onSelect(notebook.id)}
            className="flex-1 flex items-center gap-1.5 py-1.5 text-xs text-left min-w-0"
            style={{ color: isSelected ? "#818cf8" : "var(--app-text-secondary)" }}
          >
            <span className="shrink-0" style={{ color: "var(--app-text-muted)" }}>
              📓
            </span>
            <span className="truncate flex-1">{notebook.name}</span>
            {(notebook._count?.notes ?? 0) > 0 && (
              <span
                className="ml-auto shrink-0 tabular-nums"
                style={{ color: "var(--app-text-faint)", fontSize: "0.65rem" }}
              >
                {notebook._count!.notes}
              </span>
            )}
          </button>
        )}

        {/* Context menu trigger */}
        {(onRename || onDelete) && !renaming && (
          <div className="relative" ref={menuRef}>
            <button
              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-opacity text-xs"
              style={{ color: "var(--app-text-muted)" }}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ···
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-6 z-10 rounded-lg shadow-xl w-48"
                style={{
                  backgroundColor: "var(--app-bg-menu)",
                  border: "1px solid var(--app-border-strong)",
                }}
              >
                {confirmDelete ? (
                  /* ── Confirmation prompt ── */
                  <div className="px-3 py-2.5 space-y-2">
                    <p className="text-xs font-medium" style={{ color: "var(--app-text-primary)" }}>
                      ¿Eliminar &ldquo;{notebook.name}&rdquo;?
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                      Las notas dentro se moverán a la papelera. Los sub-notebooks también serán eliminados.
                    </p>
                    <div className="flex gap-1.5 pt-0.5">
                      <button
                        className="flex-1 text-xs px-2 py-1 rounded transition-colors"
                        style={{
                          backgroundColor: "var(--app-hover)",
                          color: "var(--app-text-secondary)",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                        }
                        onClick={() => { setConfirmDelete(false); setMenuOpen(false); }}
                      >
                        Cancelar
                      </button>
                      <button
                        className="flex-1 text-xs px-2 py-1 rounded transition-colors bg-red-500/15 text-red-400 hover:bg-red-500/25"
                        onClick={() => {
                          onDelete?.(notebook.id);
                          setConfirmDelete(false);
                          setMenuOpen(false);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal menu ── */
                  <div className="py-1">
                    {onNewChild && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                        style={{ color: "var(--app-text-secondary)" }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
                        }
                        onClick={handleAddChild}
                      >
                        Nuevo sub-notebook
                      </button>
                    )}
                    {onRename && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs transition-colors"
                        style={{ color: "var(--app-text-secondary)" }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
                        }
                        onClick={() => { setRenaming(true); setMenuOpen(false); }}
                      >
                        Renombrar
                      </button>
                    )}
                    {onDelete && (
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                        onClick={() => setConfirmDelete(true)}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children tree */}
      {(hasChildren || addingChild) && expanded && (
        <NotebookTree
          notebooks={notebook.children ?? []}
          selectedId={selectedId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
          onNewChild={onNewChild}
          depth={depth + 1}
        />
      )}

      {/* Inline new-child input — must be inside a <ul> to keep valid HTML */}
      {addingChild && (
        <ul className="space-y-0.5">
          <li style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}>
            <div className="flex items-center gap-1 py-1 pr-1">
              <span className="text-xs shrink-0" style={{ color: "var(--app-text-muted)" }}>📓</span>
              <input
                ref={childInputRef}
                autoFocus
                value={childName}
                onChange={(e) => setChildName(e.target.value)}
                onBlur={handleChildSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleChildSubmit();
                  if (e.key === "Escape") { setAddingChild(false); setChildName(""); }
                }}
                placeholder="Nombre del notebook"
                className="flex-1 text-xs rounded px-1 py-0.5 outline-none border border-indigo-500 min-w-0"
                style={{
                  backgroundColor: "var(--app-bg-input)",
                  color: "var(--app-text-primary)",
                }}
              />
            </div>
          </li>
        </ul>
      )}
    </li>
  );
}
