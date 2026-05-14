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
  onDropNote?: (noteId: string, notebookId: string) => void;
  onDropNotes?: (noteIds: string[], notebookId: string) => void;
  depth?: number;
}

export function NotebookTree({
  notebooks,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onNewChild,
  onDropNote,
  onDropNotes,
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
          onDropNote={onDropNote}
          onDropNotes={onDropNotes}
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
  onDropNote,
  onDropNotes,
  depth,
}: {
  notebook: NotebookWithChildren;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onNewChild?: (parentId: string, name: string) => void;
  onDropNote?: (noteId: string, notebookId: string) => void;
  onDropNotes?: (noteIds: string[], notebookId: string) => void;
  depth: number;
}) {
  const hasChildren = (notebook.children?.length ?? 0) > 0;
  const [expanded, setExpanded] = useState(true);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(notebook.name);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState("");
  const isSelected = selectedId === notebook.id;
  const menuRef = useRef<HTMLDivElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuPos) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuPos(null);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuPos]);

  function handleRenameSubmit() {
    if (renameValue.trim() && renameValue !== notebook.name) {
      onRename?.(notebook.id, renameValue.trim());
    }
    setRenaming(false);
  }

  function handleAddChild() {
    setAddingChild(true);
    setExpanded(true);
    setMenuPos(null);
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
          backgroundColor: isDragOver
            ? "rgba(99,102,241,0.2)"
            : isSelected
            ? "rgba(99,102,241,0.15)"
            : undefined,
          outline: isDragOver ? "1px solid rgba(99,102,241,0.5)" : undefined,
          outlineOffset: "-1px",
        }}
        onMouseEnter={(e) => {
          if (!isSelected && !isDragOver)
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--app-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected && !isDragOver)
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "";
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          // Only clear when leaving the row itself, not a child element
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData("text/plain");
          if (data.startsWith("bulk:")) {
            const ids = data.slice(5).split(",").filter(Boolean);
            if (ids.length > 0) onDropNotes?.(ids, notebook.id);
          } else if (data) {
            onDropNote?.(data, notebook.id);
          }
          setIsDragOver(false);
        }}
        onContextMenu={(e) => {
          if (!(onRename || onDelete)) return;
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
          setConfirmDelete(false);
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
                style={{ color: "var(--app-text-muted)", fontSize: "0.65rem" }}
              >
                {notebook._count!.notes}
              </span>
            )}
          </button>
        )}

        {/* Add sub-notebook button — replaces the old ··· menu trigger */}
        {onNewChild && !renaming && (
          <button
            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded transition-opacity"
            style={{ color: "var(--app-text-muted)" }}
            title="Nuevo sub-notebook"
            onClick={(e) => { e.stopPropagation(); handleAddChild(); }}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {/* Right-click context menu — rendered fixed at cursor position */}
        {menuPos && (
          <div
            ref={menuRef}
            className="fixed z-50 rounded-lg shadow-xl w-44 py-1"
            style={{
              top:             menuPos.y,
              left:            menuPos.x,
              backgroundColor: "var(--app-bg-menu)",
              border:          "1px solid var(--app-border-strong)",
            }}
          >
            {confirmDelete ? (
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
                    style={{ backgroundColor: "var(--app-hover)", color: "var(--app-text-secondary)" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                    }
                    onClick={() => { setConfirmDelete(false); setMenuPos(null); }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="flex-1 text-xs px-2 py-1 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                    onClick={() => { onDelete?.(notebook.id); setConfirmDelete(false); setMenuPos(null); }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                    onClick={() => { setRenaming(true); setMenuPos(null); }}
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
              </>
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
          onDropNote={onDropNote}
          onDropNotes={onDropNotes}
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
