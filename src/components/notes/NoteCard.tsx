import { useState } from "react";
import { cn, formatDate, getExcerpt, truncate } from "@/lib/utils";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";
import { STATUS_META, type NoteStatus } from "@/lib/noteStatus";
import { CopyContextMenu } from "@/components/ui/CopyContextMenu";

const TRASH_TTL_DAYS = 30;

/** Returns days remaining before permanent deletion, or null if not in trash. */
function daysUntilPurge(note: Note): number | null {
  if (!note.isTrashed || !note.trashedAt) return null;
  const elapsed   = Date.now() - new Date(note.trashedAt).getTime();
  const remaining = TRASH_TTL_DAYS - Math.floor(elapsed / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

/** Parse `- [x]` / `- [ ]` task lines and return { done, total }. */
function parseTasks(body: string): { done: number; total: number } | null {
  const matches = body.match(/^- \[([ xX])\] /gm);
  if (!matches || matches.length === 0) return null;
  const total = matches.length;
  const done  = matches.filter((m) => m.includes("[x]") || m.includes("[X]")).length;
  return { done, total };
}

type NoteWithTags = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

interface NoteCardProps {
  note: NoteWithTags;
  isActive?: boolean;
  isExiting?: boolean;
  onClick?: () => void;
}

export function NoteCard({ note, isActive, isExiting, onClick }: NoteCardProps) {
  const excerpt    = getExcerpt(note.body);
  const tasks      = parseTasks(note.body);
  const [dragging, setDragging] = useState(false);
  const [ctxMenu, setCtxMenu]   = useState<{ x: number; y: number } | null>(null);

  return (
    <>
    <button
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); }}
      draggable
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", note.id);
        e.dataTransfer.effectAllowed = "move";
        // Small delay so the ghost image captures the card before opacity drops
        requestAnimationFrame(() => setDragging(true));
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "w-full text-left px-3 py-3 rounded-lg cursor-default group",
        isActive ? "border" : "border border-transparent",
        dragging  && "opacity-40 scale-95",
        isExiting && "opacity-0 translate-x-3 pointer-events-none",
      )}
      style={{
        backgroundColor: isActive ? "rgba(99,102,241,0.12)" : undefined,
        borderColor:     isActive ? "rgba(99,102,241,0.3)" : "transparent",
        transition: isExiting
          ? "opacity 240ms ease, transform 240ms ease"
          : "opacity 120ms, transform 120ms, background-color 150ms",
      }}
      onMouseEnter={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--app-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-sm font-medium leading-snug line-clamp-1 flex items-center gap-1"
          style={{ color: "var(--app-text-primary)" }}
        >
          {/* Status icon — always visible except in trash */}
          {!note.isTrashed && note.status && (
            <span
              className="text-[11px] leading-none shrink-0"
              title={STATUS_META[note.status as NoteStatus]?.label}
            >
              {STATUS_META[note.status as NoteStatus]?.icon}
            </span>
          )}
          {note.isPinned && (
            <span className="text-indigo-400 shrink-0" aria-label="Pinned">📌</span>
          )}
          {note.title || "Sin título"}
        </span>
        <span
          className="text-xs shrink-0 mt-0.5"
          style={{ color: "var(--app-text-muted)" }}
        >
          {formatDate(note.updatedAt)}
        </span>
      </div>

      {excerpt && (
        <p
          className="text-xs mt-1 line-clamp-1 leading-relaxed"
          style={{ color: "var(--app-text-muted)" }}
        >
          {truncate(excerpt, 100)}
        </p>
      )}

      {/* ── Task progress indicator ── */}
      {tasks && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            ☑ {tasks.done}/{tasks.total}
          </span>
          {/* Mini progress bar */}
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 3, backgroundColor: "var(--app-border-strong)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((tasks.done / tasks.total) * 100)}%`,
                backgroundColor:
                  tasks.done === tasks.total ? "#22c55e" : "#6366f1",
              }}
            />
          </div>
        </div>
      )}

      {/* ── Tags ── */}
      {note.noteTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {note.noteTags.slice(0, 3).map(({ tag }) => (
            <span
              key={tag.id}
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: tag.color + "22",
                color: tag.color ?? "#6366f1",
                border: `1px solid ${tag.color ?? "#6366f1"}33`,
              }}
            >
              {tag.name}
            </span>
          ))}
          {note.noteTags.length > 3 && (
            <span
              className="text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              +{note.noteTags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* ── Trash countdown badge ── */}
      {(() => {
        const days = daysUntilPurge(note);
        if (days === null) return null;
        const urgent = days <= 5;
        const label  = days === 0
          ? "Se elimina hoy"
          : days === 1
          ? "Se elimina mañana"
          : `Se elimina en ${days} días`;
        return (
          <div className="flex items-center gap-1 mt-2">
            <span style={{ fontSize: "0.65rem" }}>🗑</span>
            <span
              className="text-[10px] font-medium"
              style={{ color: urgent ? "#f87171" : "var(--app-text-muted)" }}
            >
              {label}
            </span>
          </div>
        );
      })()}
    </button>

    {ctxMenu && (
      <CopyContextMenu
        body={note.body}
        coords={ctxMenu}
        onClose={() => setCtxMenu(null)}
      />
    )}
    </>
  );
}
