"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuArrowUpDown, LuCheck, LuFileText, LuFolderOpen,
  LuLoader, LuNotepadText, LuSearch, LuSquarePen, LuTrash2, LuUpload,
} from "react-icons/lu";
import { NoteCard, type BulkDragData } from "@/components/notes/NoteCard";
import { BulkActionBar } from "@/components/notes/BulkActionBar";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useEmptyTrash } from "@/hooks/useNotes";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";
import type { ImportResult } from "./AppShell";

// ── Sort order ─────────────────────────────────────────────────────────────

type SortKey = "updatedAt" | "createdAt" | "titleAsc" | "titleDesc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "updatedAt",  label: "Última modificación" },
  { key: "createdAt",  label: "Fecha de creación"   },
  { key: "titleAsc",   label: "Título A → Z"         },
  { key: "titleDesc",  label: "Título Z → A"         },
];

const LS_KEY = "inkdrop-sort";

function readSort(): SortKey {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v && SORT_OPTIONS.some((o) => o.key === v)) return v as SortKey;
  } catch {}
  return "updatedAt";
}

function sortNotes<T extends { title: string; updatedAt: Date | string; createdAt: Date | string }>(
  notes: T[],
  key: SortKey,
): T[] {
  const copy = [...notes];
  switch (key) {
    case "updatedAt":
      return copy.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    case "createdAt":
      return copy.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    case "titleAsc":
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, "es", { sensitivity: "base" })
      );
    case "titleDesc":
      return copy.sort((a, b) =>
        b.title.localeCompare(a.title, "es", { sensitivity: "base" })
      );
  }
}

type NoteWithTags = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

interface NoteListProps {
  notes: NoteWithTags[];
  loading?: boolean;
  selectedNoteId?: string | null;
  exitingNoteId?: string | null;
  contextLabel?: string;
  isTrashView?: boolean;
  notebooks?: { id: string; name: string; parentId: string | null }[];
  tags?: Tag[];
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onSearch: (q: string) => void;
  onImport?: (files: FileList | File[]) => Promise<ImportResult | null>;
}

// Reads a dropped FileSystemEntry recursively and returns File[] with webkitRelativePath set
async function collectFolderFiles(entry: FileSystemEntry, basePath = ""): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((r) => (entry as FileSystemFileEntry).file(r));
    const path = basePath ? `${basePath}/${entry.name}` : entry.name;
    Object.defineProperty(file, "webkitRelativePath", { value: path, configurable: true });
    return [file];
  }
  const dir = entry as FileSystemDirectoryEntry;
  const path = basePath ? `${basePath}/${entry.name}` : entry.name;
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((r) => reader.readEntries(r));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  const nested = await Promise.all(all.map((e) => collectFolderFiles(e, path)));
  return nested.flat();
}

export function NoteList({
  notes,
  loading,
  selectedNoteId,
  exitingNoteId,
  contextLabel = "Todas las notas",
  isTrashView = false,
  notebooks = [],
  tags = [],
  onSelectNote,
  onNewNote,
  onSearch,
  onImport,
}: NoteListProps) {
  const { emptyTrash } = useEmptyTrash();
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);

  // ── Import state ─────────────────────────────────────────────────────────
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const importMenuRef  = useRef<HTMLDivElement>(null);
  const [importing,        setImporting]        = useState(false);
  const [importTotal,      setImportTotal]      = useState(0);
  const [importMenuOpen,   setImportMenuOpen]   = useState(false);
  const [importResult,     setImportResult]     = useState<ImportResult | null>(null);
  const [folderModalOpen,  setFolderModalOpen]  = useState(false);
  const [isDragOver,       setIsDragOver]       = useState(false);

  // Close import menu on outside click
  useEffect(() => {
    if (!importMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!importMenuRef.current?.contains(e.target as Node)) setImportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [importMenuOpen]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !onImport) return;
    const mdCount = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".md") && !f.name.startsWith(".")
    ).length;
    setImportTotal(mdCount);
    setImporting(true);
    try {
      const result = await onImport(files);
      if (result) setImportResult(result);
    } finally {
      setImporting(false);
      setImportTotal(0);
      e.target.value = "";
    }
  }

  async function handleFolderDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (!onImport) return;
    const items = Array.from(e.dataTransfer.items);
    const entries = items
      .map((item) => item.webkitGetAsEntry())
      .filter(Boolean) as FileSystemEntry[];
    const files = (await Promise.all(entries.map((en) => collectFolderFiles(en)))).flat();
    if (files.length === 0) return;
    const mdCount = files.filter(
      (f) => f.name.toLowerCase().endsWith(".md") && !f.name.startsWith(".")
    ).length;
    setImportTotal(mdCount);
    setImporting(true);
    setFolderModalOpen(false);
    try {
      const result = await onImport(files);
      if (result) setImportResult(result);
    } finally {
      setImporting(false);
      setImportTotal(0);
    }
  }

  async function handleEmptyTrashConfirmed() {
    setEmptyingTrash(true);
    await emptyTrash();
    setEmptyingTrash(false);
    setConfirmOpen(false);
  }
  // ── Multi-select state ───────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastClickedIdxRef = useRef<number | null>(null);

  // Clear selection whenever the notes list changes context
  useEffect(() => { setSelectedIds(new Set()); lastClickedIdxRef.current = null; }, [contextLabel]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIdxRef.current = null;
  }, []);

  const [searchValue, setSearchValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sort state (persisted) ───────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");

  // Read from localStorage after mount (avoids SSR mismatch)
  useEffect(() => { setSortKey(readSort()); }, []);

  function handleSortChange(key: SortKey) {
    setSortKey(key);
    try { localStorage.setItem(LS_KEY, key); } catch {}
  }

  const sortedNotes = useMemo(() => sortNotes(notes, sortKey), [notes, sortKey]);

  function handleSearchChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(value), 300);
  }

  // ── Bulk drag data — shared by every selected NoteCard ──────────────────
  const bulkDragData = useMemo<BulkDragData | undefined>(() => {
    if (selectedIds.size < 2) return undefined;
    const selected = sortedNotes.filter((n) => selectedIds.has(n.id));
    return {
      ids:    selected.map((n) => n.id),
      titles: selected.map((n) => n.title),
    };
  }, [selectedIds, sortedNotes]);

  // ── Selection click handling ─────────────────────────────────────────────

  function handleCardClick(noteId: string, idx: number, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedIds((prev) => {
        const next = new Set(prev);

        // First Ctrl+click: seed the set with the currently open note so the
        // user immediately has 2 notes selected and the action bar appears.
        if (next.size === 0 && selectedNoteId && selectedNoteId !== noteId) {
          next.add(selectedNoteId);
        }

        // Toggle the clicked note
        if (next.has(noteId)) {
          next.delete(noteId);
          // If we're back to just the active note, collapse to empty
          if (next.size === 1 && next.has(selectedNoteId ?? "")) next.clear();
        } else {
          next.add(noteId);
        }

        return next;
      });
      lastClickedIdxRef.current = idx;
    } else if (e.shiftKey && lastClickedIdxRef.current !== null) {
      // Shift: range select — also seed with active note on first use
      e.preventDefault();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.size === 0 && selectedNoteId) next.add(selectedNoteId);
        const start = Math.min(lastClickedIdxRef.current!, idx);
        const end   = Math.max(lastClickedIdxRef.current!, idx);
        for (let i = start; i <= end; i++) next.add(sortedNotes[i].id);
        return next;
      });
    } else {
      // Normal click: navigate and clear any active selection
      if (selectedIds.size > 0) clearSelection();
      onSelectNote(noteId);
      lastClickedIdxRef.current = idx;
    }
  }

  return (
    <div
      className="flex flex-col h-full border-r theme-transition"
      style={{
        backgroundColor: "var(--app-bg-list)",
        borderColor: "var(--app-border)",
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-3"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: "var(--app-text-secondary)" }}
          >
            {contextLabel}
          </span>
          <div className="flex items-center gap-0.5">
            <SortMenu sortKey={sortKey} onChange={handleSortChange} />
            {isTrashView ? (
              /* Vaciar papelera — only shown when there are notes to delete */
              notes.length > 0 && (
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={emptyingTrash}
                  title="Vaciar papelera"
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                  style={{
                    color: "#f87171",
                    border: "1px solid rgba(248,113,113,0.35)",
                    backgroundColor: "rgba(248,113,113,0.08)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(248,113,113,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(248,113,113,0.08)";
                  }}
                >
                  <LuTrash2 className="w-3 h-3" /> Vaciar
                </button>
              )
            ) : (
              <>
                {/* Hidden input for individual .md files */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,text/markdown"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Import dropdown */}
                {onImport && (
                  <div ref={importMenuRef} className="relative">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => !importing && setImportMenuOpen((v) => !v)}
                      title="Importar notas"
                      disabled={importing}
                      className={importMenuOpen ? "text-indigo-400" : ""}
                    >
                      {importing ? (
                        <span className="relative flex items-center justify-center">
                          <LuLoader className="w-3.5 h-3.5 animate-spin" />
                          {importTotal > 1 && (
                            <span
                              className="absolute -top-1 -right-1 text-[8px] font-bold leading-none rounded-full w-3 h-3 flex items-center justify-center"
                              style={{ backgroundColor: "#6366f1", color: "#fff" }}
                            >
                              {importTotal}
                            </span>
                          )}
                        </span>
                      ) : (
                        <LuUpload className="w-3.5 h-3.5" />
                      )}
                    </Button>

                    {importMenuOpen && (
                      <div
                        className="absolute right-0 top-7 z-30 rounded-lg shadow-xl py-1 w-44"
                        style={{
                          backgroundColor: "var(--app-bg-menu)",
                          border: "1px solid var(--app-border-strong)",
                        }}
                      >
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors"
                          style={{ color: "var(--app-text-secondary)" }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
                          }
                          onClick={() => { fileInputRef.current?.click(); setImportMenuOpen(false); }}
                        >
                          <LuFileText className="w-3.5 h-3.5" /><span>Importar archivos .md</span>
                        </button>
                        <button
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors"
                          style={{ color: "var(--app-text-secondary)" }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
                          }
                          onClick={() => { setFolderModalOpen(true); setImportMenuOpen(false); }}
                        >
                          <LuFolderOpen className="w-3.5 h-3.5" /><span>Importar notebook</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* New note button */}
                <Button size="icon" variant="ghost" onClick={onNewNote} title="Nueva nota (Ctrl+N)">
                  <LuSquarePen className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <LuSearch
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
            style={{ color: "var(--app-text-muted)" }}
          />
          <input
            type="text"
            placeholder="Buscar notas..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full text-xs rounded-lg pl-7 pr-3 py-1.5 outline-none transition"
            style={{
              backgroundColor: "var(--app-bg-input)",
              color: "var(--app-text-primary)",
              border: "1px solid var(--app-border-strong)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-accent)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--app-border-strong)")
            }
          />
        </div>
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="text-gray-500" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {isTrashView
            ? <LuTrash2    className="w-8 h-8 mb-2" style={{ color: "var(--app-text-muted)" }} />
            : <LuNotepadText className="w-8 h-8 mb-2" style={{ color: "var(--app-text-muted)" }} />
          }
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              {isTrashView ? "Papelera vacía" : "No hay notas aquí"}
            </p>
            {!isTrashView && (
              <button
                onClick={onNewNote}
                className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                Crear primera nota →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedNotes.map((note, idx) => (
              <NoteCard
                key={note.id}
                note={note}
                isActive={selectedNoteId === note.id}
                isExiting={exitingNoteId === note.id}
                isSelected={selectedIds.has(note.id)}
                bulkDragData={selectedIds.has(note.id) ? bulkDragData : undefined}
                onClick={(e) => handleCardClick(note.id, idx, e)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedIds.size >= 2 ? (
        <BulkActionBar
          selectedIds={selectedIds}
          notebooks={notebooks}
          tags={tags}
          onClear={clearSelection}
          onDone={clearSelection}
        />
      ) : (
        <div
          className="px-3 py-2"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>
            {notes.length} nota{notes.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* ── Import folder modal ── */}
      <Modal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        title="Importar notebook"
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleFolderDrop}
          className="rounded-xl flex flex-col items-center justify-center gap-3 py-10 px-6 transition-colors cursor-default"
          style={{
            border: `2px dashed ${isDragOver ? "var(--color-accent)" : "var(--app-border-strong)"}`,
            backgroundColor: isDragOver ? "rgba(99,102,241,0.06)" : "transparent",
          }}
        >
          <span className="text-4xl select-none">📁</span>
          <p className="text-sm font-medium text-center" style={{ color: "var(--app-text-primary)" }}>
            Arrastra tu carpeta aquí
          </p>
          <p className="text-xs text-center" style={{ color: "var(--app-text-muted)" }}>
            Suelta una carpeta para importar todos sus archivos .md
          </p>
        </div>
        <p className="text-[11px] mt-3 text-center" style={{ color: "var(--app-text-faint)" }}>
          Compatible con vaults de Obsidian y carpetas con archivos .md
        </p>
      </Modal>

      {/* ── Import result modal ── */}
      <Modal
        open={importResult !== null}
        onClose={() => setImportResult(null)}
        title="Importación completada"
      >
        {importResult && (
          <>
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                style={{ backgroundColor: "rgba(99,102,241,0.12)" }}
              >
                ✅
              </div>
            </div>

            {/* Stats */}
            <div
              className="rounded-lg divide-y mb-5"
              style={{ border: "1px solid var(--app-border)" }}
            >
              {[
                { icon: "📝", label: "Notas importadas",    value: importResult.notes    },
                { icon: "📓", label: "Notebooks creados",   value: importResult.notebooks },
                { icon: "🏷️", label: "Tags creados",        value: importResult.tags      },
              ].map(({ icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                  style={{ borderBottom: "1px solid var(--app-border)" }}
                >
                  <span className="flex items-center gap-2" style={{ color: "var(--app-text-secondary)" }}>
                    <span>{icon}</span>
                    <span>{label}</span>
                  </span>
                  <span className="font-semibold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Notebook names list */}
            {importResult.notebookNames.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-medium mb-2" style={{ color: "var(--app-text-muted)" }}>
                  Notebooks creados
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {importResult.notebookNames.map((name) => (
                    <span
                      key={name}
                      className="px-2 py-0.5 rounded-full text-xs"
                      style={{
                        backgroundColor: "rgba(99,102,241,0.12)",
                        color: "#818cf8",
                        border: "1px solid rgba(99,102,241,0.25)",
                      }}
                    >
                      📓 {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setImportResult(null)}
                className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ backgroundColor: "#6366f1", color: "#fff" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#4f46e5";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#6366f1";
                }}
              >
                Listo
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Empty-trash confirmation modal ── */}
      <Modal
        open={confirmOpen}
        onClose={() => !emptyingTrash && setConfirmOpen(false)}
        title="¿Vaciar papelera?"
      >
        {/* Trash icon */}
        <div className="flex justify-center mb-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
            style={{ backgroundColor: "rgba(248,113,113,0.12)" }}
          >
            🗑
          </div>
        </div>

        <p className="text-sm text-center mb-1" style={{ color: "var(--app-text-primary)" }}>
          Se eliminarán permanentemente{" "}
          <span className="font-semibold">
            {notes.length} nota{notes.length !== 1 ? "s" : ""}
          </span>.
        </p>
        <p className="text-xs text-center mb-6" style={{ color: "var(--app-text-muted)" }}>
          Esta acción no se puede deshacer.
        </p>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setConfirmOpen(false)}
            disabled={emptyingTrash}
            className="px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--app-hover)",
              color: "var(--app-text-secondary)",
              border: "1px solid var(--app-border)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEmptyTrashConfirmed}
            disabled={emptyingTrash}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            style={{
              backgroundColor: emptyingTrash ? "rgba(248,113,113,0.5)" : "#ef4444",
              color: "#fff",
            }}
            onMouseEnter={(e) => {
              if (!emptyingTrash)
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#dc2626";
            }}
            onMouseLeave={(e) => {
              if (!emptyingTrash)
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ef4444";
            }}
          >
            {emptyingTrash ? "Eliminando…" : "Vaciar papelera"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ── SortMenu ───────────────────────────────────────────────────────────────

function SortMenu({
  sortKey,
  onChange,
}: {
  sortKey: SortKey;
  onChange: (key: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropW = 208; // w-52
      const left = Math.min(r.left, window.innerWidth - dropW - 8);
      setPos({ top: r.bottom + 4, left });
    }
    setOpen((v) => !v);
  }

  return (
    <div>
      <button
        ref={btnRef}
        onClick={handleToggle}
        title="Ordenar notas"
        className="flex items-center gap-1 px-1.5 py-1 rounded text-xs transition-colors"
        style={{ color: open ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--app-text-primary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
          (e.currentTarget as HTMLButtonElement).style.color = open
            ? "var(--app-text-primary)"
            : "var(--app-text-muted)";
        }}
      >
        <LuArrowUpDown className="w-3 h-3" />
      </button>

      {open && (
        <div
          ref={dropRef}
          className="fixed z-50 rounded-lg shadow-xl py-1 w-52"
          style={{
            top: pos.top,
            left: pos.left,
            backgroundColor: "var(--app-bg-menu)",
            border: "1px solid var(--app-border-strong)",
          }}
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortKey === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => { onChange(opt.key); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors"
                style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-secondary)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
                }}
              >
                <span>{opt.label}</span>
                {active && (
                  <LuCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
