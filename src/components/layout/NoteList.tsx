"use client";

import { useRef, useState } from "react";
import { NoteCard } from "@/components/notes/NoteCard";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";

type NoteWithTags = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

interface NoteListProps {
  notes: NoteWithTags[];
  loading?: boolean;
  selectedNoteId?: string | null;
  contextLabel?: string;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onSearch: (q: string) => void;
}

export function NoteList({
  notes,
  loading,
  selectedNoteId,
  contextLabel = "Todas las notas",
  onSelectNote,
  onNewNote,
  onSearch,
}: NoteListProps) {
  const [searchValue, setSearchValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          <Button size="icon" variant="ghost" onClick={onNewNote} title="Nueva nota">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Button>
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
            <span className="text-2xl mb-2">📝</span>
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              No hay notas aquí
            </p>
            <button
              onClick={onNewNote}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition"
            >
              Crear primera nota →
            </button>
          </div>
        ) : (
          <div className="space-y-0.5">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                isActive={selectedNoteId === note.id}
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
    </div>
  );
}
