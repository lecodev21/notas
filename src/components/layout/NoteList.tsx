"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NoteCard } from "@/components/notes/NoteCard";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useEmptyTrash } from "@/hooks/useNotes";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";

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
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onSearch: (q: string) => void;
}

export function NoteList({
  notes,
  loading,
  selectedNoteId,
  exitingNoteId,
  contextLabel = "Todas las notas",
  isTrashView = false,
  onSelectNote,
  onNewNote,
  onSearch,
}: NoteListProps) {
  const { emptyTrash } = useEmptyTrash();
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);

  async function handleEmptyTrashConfirmed() {
    setEmptyingTrash(true);
    await emptyTrash();
    setEmptyingTrash(false);
    setConfirmOpen(false);
  }
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
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
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
                  🗑 Vaciar
                </button>
              )
            ) : (
              <Button size="icon" variant="ghost" onClick={onNewNote} title="Nueva nota">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
            style={{ color: "var(--app-text-muted)" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
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
            <span className="text-2xl mb-2">{isTrashView ? "🗑️" : "📝"}</span>
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
            {sortedNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isActive={selectedNoteId === note.id}
                isExiting={exitingNoteId === note.id}
                onClick={() => onSelectNote(note.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div
        className="px-3 py-2"
        style={{ borderTop: "1px solid var(--app-border)" }}
      >
        <p className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>
          {notes.length} nota{notes.length !== 1 ? "s" : ""}
        </p>
      </div>

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
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
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
        {/* Sort icon */}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-7 z-30 rounded-lg shadow-xl py-1 w-52"
          style={{
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
                  <svg className="w-3 h-3 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
