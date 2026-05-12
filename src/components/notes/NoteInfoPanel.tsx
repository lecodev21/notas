"use client";

import type { Note, NoteTag, Tag } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/utils";

type NoteWithRelations = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

interface NoteInfoPanelProps {
  note: NoteWithRelations;
  /** Live body from the editor (may differ from note.body during auto-save) */
  body: string;
}

function parseTasks(body: string): { done: number; total: number } | null {
  const matches = body.match(/^[ \t]{0,3}[-*+] \[([ xX])\] /gm);
  if (!matches || matches.length === 0) return null;
  const total = matches.length;
  const done  = matches.filter((m) => /\[[xX]\]/.test(m)).length;
  return { done, total };
}

export function NoteInfoPanel({ note, body }: NoteInfoPanelProps) {
  const tasks = parseTasks(body);

  return (
    <div
      className="not-prose mx-6 mt-6 mb-2 rounded-lg flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 text-xs"
      style={{
        border:          "1px solid var(--app-border-strong)",
        backgroundColor: "var(--app-hover)",
      }}
    >
      {/* Created */}
      <span className="flex items-center gap-1.5">
        <span className="opacity-60">📅</span>
        <span style={{ color: "var(--app-text-muted)" }}>Creada</span>
        <span style={{ color: "var(--app-text-secondary)" }}>
          {formatDateTime(note.createdAt)}
        </span>
      </span>

      <span style={{ color: "var(--app-border-strong)" }}>·</span>

      {/* Modified */}
      <span className="flex items-center gap-1.5">
        <span className="opacity-60">✏️</span>
        <span style={{ color: "var(--app-text-muted)" }}>Modificada</span>
        <span style={{ color: "var(--app-text-secondary)" }}>
          {formatDateTime(note.updatedAt)}
        </span>
      </span>

      {/* Tasks — only when the note has checkboxes */}
      {tasks && (
        <>
          <span style={{ color: "var(--app-border-strong)" }}>·</span>
          <span className="flex items-center gap-1.5">
            <span className="opacity-60">☑️</span>
            <span style={{ color: "var(--app-text-muted)" }}>Tareas</span>
            <span style={{ color: "var(--app-text-secondary)" }}>
              {tasks.done}/{tasks.total}
            </span>
            {/* Mini progress bar */}
            <span
              className="rounded-full overflow-hidden inline-block align-middle"
              style={{
                width:           48,
                height:          4,
                backgroundColor: "var(--app-border-strong)",
              }}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width:           `${Math.round((tasks.done / tasks.total) * 100)}%`,
                  backgroundColor: tasks.done === tasks.total ? "#22c55e" : "#6366f1",
                  transition:      "width 300ms ease",
                }}
              />
            </span>
          </span>
        </>
      )}
    </div>
  );
}
