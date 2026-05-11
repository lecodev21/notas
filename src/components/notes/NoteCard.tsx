import { cn, formatDate, getExcerpt, truncate } from "@/lib/utils";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";

type NoteWithTags = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

interface NoteCardProps {
  note: NoteWithTags;
  isActive?: boolean;
  onClick?: () => void;
}

export function NoteCard({ note, isActive, onClick }: NoteCardProps) {
  const excerpt = getExcerpt(note.body);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 rounded-lg transition-colors cursor-pointer group",
        isActive ? "border" : "border border-transparent"
      )}
      style={{
        backgroundColor: isActive ? "rgba(99,102,241,0.12)" : undefined,
        borderColor: isActive ? "rgba(99,102,241,0.3)" : "transparent",
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
          className="text-sm font-medium leading-snug line-clamp-1"
          style={{ color: "var(--app-text-primary)" }}
        >
          {note.isPinned && (
            <span className="mr-1 text-indigo-400" aria-label="Pinned">📌</span>
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
          className="text-xs mt-1 line-clamp-2 leading-relaxed"
          style={{ color: "var(--app-text-muted)" }}
        >
          {truncate(excerpt, 100)}
        </p>
      )}

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
    </button>
  );
}
