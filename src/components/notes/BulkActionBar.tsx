"use client";

import { useRef, useState, useEffect } from "react";
import { useBulkNotes } from "@/hooks/useNotes";
import { STATUS_META, STATUS_ORDER, type NoteStatus } from "@/lib/noteStatus";
import type { Tag } from "@/generated/prisma/client";
import { LuCheck, LuChevronDown, LuFolder, LuFolderOpen, LuNotebook, LuTag, LuTrash2, LuX } from "react-icons/lu";

interface Notebook { id: string; name: string; parentId: string | null; }

interface BulkActionBarProps {
  selectedIds: Set<string>;
  notebooks:   Notebook[];
  tags:        Tag[];
  onClear:     () => void;
  onDone:      () => void; // called after successful action (also clears selection)
}

// ── Tiny dropdown primitive ────────────────────────────────────────────────

function Dropdown({
  label,
  icon,
  children,
}: {
  label:    string;
  icon:     React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
        style={{
          backgroundColor: open ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)",
          color: "#a5b4fc",
          border: "1px solid rgba(99,102,241,0.25)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(99,102,241,0.2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = open
            ? "rgba(99,102,241,0.2)"
            : "rgba(99,102,241,0.1)";
        }}
      >
        {icon}
        <span>{label}</span>
        <LuChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div
          ref={dropRef}
          className="absolute bottom-full mb-1.5 left-0 z-50 rounded-lg shadow-xl py-1 min-w-[180px] max-h-64 overflow-y-auto"
          style={{
            backgroundColor: "var(--app-bg-menu)",
            border: "1px solid var(--app-border-strong)",
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function DropItem({
  icon,
  iconColor,
  label,
  active,
  onClick,
}: {
  icon?:      React.ReactNode;
  iconColor?: string;
  label:      string;
  active?:    boolean;
  onClick:    () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
      style={{ color: active ? "#818cf8" : "var(--app-text-secondary)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
      }}
      onClick={onClick}
    >
      {icon && (
        <span className="font-bold text-[10px] flex items-center" style={{ color: iconColor ?? "inherit" }}>{icon}</span>
      )}
      <span className="truncate">{label}</span>
      {active && (
        <LuCheck className="w-3 h-3 shrink-0 ml-auto text-indigo-400" />
      )}
    </button>
  );
}

// ── BulkActionBar ──────────────────────────────────────────────────────────

export function BulkActionBar({ selectedIds, notebooks, tags, onClear, onDone }: BulkActionBarProps) {
  const { bulkUpdate } = useBulkNotes();
  const [busy, setBusy] = useState(false);

  const ids = Array.from(selectedIds);
  const count = ids.length;

  async function run(op: Parameters<typeof bulkUpdate>[1]) {
    setBusy(true);
    await bulkUpdate(ids, op);
    setBusy(false);
    onDone();
  }

  return (
    <div
      className="shrink-0 px-2 py-2 flex flex-col gap-2"
      style={{
        borderTop: "1px solid rgba(99,102,241,0.3)",
        backgroundColor: "rgba(99,102,241,0.06)",
      }}
    >
      {/* Count row + clear */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "#a5b4fc" }}>
          {count} nota{count !== 1 ? "s" : ""} seleccionada{count !== 1 ? "s" : ""}
        </span>
        <button
          onClick={onClear}
          title="Cancelar selección"
          className="w-5 h-5 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--app-text-muted)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--app-text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--app-text-muted)";
          }}
        >
          <LuX className="w-3 h-3" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5" style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}>

        {/* ── Mover ── */}
        <Dropdown label="Mover" icon={<LuFolder className="w-3.5 h-3.5" />}>
          {(close) => (
            <>
              <DropItem
                icon={<LuFolderOpen className="w-3.5 h-3.5" />}
                label="Sin notebook"
                onClick={() => { close(); run({ action: "move", notebookId: null }); }}
              />
              {notebooks.length > 0 && (
                <div className="h-px mx-2 my-1" style={{ backgroundColor: "var(--app-border)" }} />
              )}
              {notebooks.map((nb) => (
                <DropItem
                  key={nb.id}
                  icon={<LuNotebook className="w-3.5 h-3.5" />}
                  label={nb.name}
                  onClick={() => { close(); run({ action: "move", notebookId: nb.id }); }}
                />
              ))}
            </>
          )}
        </Dropdown>

        {/* ── Etiquetar ── */}
        {tags.length > 0 && (
          <Dropdown label="Etiquetar" icon={<LuTag className="w-3.5 h-3.5" />}>
            {(close) => (
              <>
                {tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-1 px-2">
                    <button
                      title="Añadir tag"
                      className="flex-1 flex items-center gap-2 py-1.5 text-xs text-left transition-colors rounded"
                      style={{ color: "var(--app-text-secondary)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
                      }}
                      onClick={() => {
                        close();
                        run({ action: "tag", tagId: tag.id, mode: "add" });
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color ?? "#6366f1" }}
                      />
                      <span className="truncate">{tag.name}</span>
                    </button>
                    {/* Remove button */}
                    <button
                      title="Quitar tag"
                      className="px-1 py-1 rounded text-xs transition-colors"
                      style={{ color: "var(--app-text-muted)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(248,113,113,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--app-text-muted)";
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
                      }}
                      onClick={() => {
                        close();
                        run({ action: "tag", tagId: tag.id, mode: "remove" });
                      }}
                    >
                      −
                    </button>
                  </div>
                ))}
              </>
            )}
          </Dropdown>
        )}

        {/* ── Status ── */}
        <Dropdown label="Status" icon="●">
          {(close) => (
            <>
              {STATUS_ORDER.map((s) => {
                const meta = STATUS_META[s];
                return (
                  <DropItem
                    key={s}
                    icon={meta.icon}
                    iconColor={meta.color}
                    label={meta.label}
                    onClick={() => {
                      close();
                      run({ action: "status", status: s as NoteStatus });
                    }}
                  />
                );
              })}
            </>
          )}
        </Dropdown>

        {/* ── Papelera ── */}
        <button
          onClick={() => run({ action: "trash" })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
          style={{
            backgroundColor: "rgba(248,113,113,0.1)",
            color: "#fca5a5",
            border: "1px solid rgba(248,113,113,0.25)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(248,113,113,0.2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(248,113,113,0.1)";
          }}
        >
          <LuTrash2 className="w-3.5 h-3.5" />
          <span>Papelera</span>
        </button>
      </div>
    </div>
  );
}
