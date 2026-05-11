"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";

type NoteWithRelations = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

interface EditorPanelProps {
  note: NoteWithRelations | null;
  loading?: boolean;
  availableTags?: Tag[];
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  onUpdate: (id: string, data: { title?: string; body?: string; tagIds?: string[] }) => Promise<void>;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string, isPinned: boolean) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
}

type ViewMode = "edit" | "split" | "preview";

export function EditorPanel({
  note,
  loading,
  availableTags = [],
  focusMode = false,
  onToggleFocusMode,
  onUpdate,
  onDelete,
  onTogglePin,
  onTrash,
  onRestore,
  onDeletePermanent,
}: EditorPanelProps) {
  const [mode, setMode] = useState<ViewMode>("split");
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Local state ──────────────────────────────────────────────────────────
  const [localBody, setLocalBody] = useState(note?.body ?? "");
  const [localTitle, setLocalTitle] = useState(note?.title ?? "");
  const prevNoteIdRef = useRef<string | null>(note?.id ?? null);

  useEffect(() => {
    if (!note) return;
    if (note.id !== prevNoteIdRef.current) {
      setLocalBody(note.body);
      setLocalTitle(note.title);
      prevNoteIdRef.current = note.id;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [note]);

  // ── Scroll sync ──────────────────────────────────────────────────────────
  // The editor's scrollable node is .cm-scroller (CodeMirror internal).
  // The preview's scrollable node is previewPanelRef itself (overflow-y-auto).
  // MarkdownPreview must NOT have its own overflow so the outer div scrolls.
  const editorPanelRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "split") return;

    // "source" tracks which panel is currently driving the sync so we never
    // create a feedback loop even when scroll events fire asynchronously.
    let source: "editor" | "preview" | null = null;
    let rafId = 0;

    function syncEditorToPreview(scroller: HTMLElement, preview: HTMLElement) {
      if (source === "preview") return;
      const editorMax = scroller.scrollHeight - scroller.clientHeight;
      if (editorMax <= 0) return;
      const ratio = scroller.scrollTop / editorMax;
      const previewMax = preview.scrollHeight - preview.clientHeight;
      if (previewMax <= 0) return;
      source = "editor";
      preview.scrollTop = ratio * previewMax;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { source = null; });
    }

    function syncPreviewToEditor(scroller: HTMLElement, preview: HTMLElement) {
      if (source === "editor") return;
      const previewMax = preview.scrollHeight - preview.clientHeight;
      if (previewMax <= 0) return;
      const ratio = preview.scrollTop / previewMax;
      const editorMax = scroller.scrollHeight - scroller.clientHeight;
      if (editorMax <= 0) return;
      source = "preview";
      scroller.scrollTop = ratio * editorMax;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { source = null; });
    }

    let cleanup: (() => void) | null = null;

    function wire(scroller: HTMLElement, preview: HTMLElement) {
      if (cleanup) return; // already wired

      const onEditorScroll = () => syncEditorToPreview(scroller, preview);
      const onPreviewScroll = () => syncPreviewToEditor(scroller, preview);

      scroller.addEventListener("scroll", onEditorScroll, { passive: true });
      preview.addEventListener("scroll", onPreviewScroll, { passive: true });

      // Re-sync whenever the preview content changes size (e.g. images load,
      // dynamic import finishes), so the ratio stays accurate after resize.
      const ro = new ResizeObserver(() => {
        // Only nudge if the editor has already scrolled away from the top.
        if (scroller.scrollTop > 0) syncEditorToPreview(scroller, preview);
      });
      ro.observe(preview);

      cleanup = () => {
        scroller.removeEventListener("scroll", onEditorScroll);
        preview.removeEventListener("scroll", onPreviewScroll);
        ro.disconnect();
        cancelAnimationFrame(rafId);
      };
    }

    // Poll until CodeMirror's .cm-scroller appears (async dynamic import).
    const poll = setInterval(() => {
      if (cleanup) return;
      const ep = editorPanelRef.current;
      const pp = previewPanelRef.current;
      if (!ep || !pp) return;
      const scroller = ep.querySelector<HTMLElement>(".cm-scroller");
      if (!scroller) return;
      clearInterval(poll);
      wire(scroller, pp);
    }, 50);

    return () => {
      clearInterval(poll);
      cleanup?.();
      cleanup = null;
    };
  }, [mode, note?.id]);
  // ────────────────────────────────────────────────────────────────────────

  const debouncedSave = useCallback(
    (field: "title" | "body", value: string) => {
      if (!note) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaving(true);
        await onUpdate(note.id, { [field]: value });
        setSaving(false);
      }, 500);
    },
    [note, onUpdate]
  );

  if (loading) {
    return (
      <div
        className="flex-1 flex items-center justify-center theme-transition"
        style={{ backgroundColor: "var(--app-bg-editor)" }}
      >
        <Spinner className="text-gray-500" />
      </div>
    );
  }

  if (!note) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center text-center theme-transition"
        style={{ backgroundColor: "var(--app-bg-editor)" }}
      >
        <span className="text-4xl mb-3">✏️</span>
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Selecciona una nota para editarla
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--app-text-faint)" }}>
          o crea una nueva desde el panel izquierdo
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden theme-transition"
      style={{ backgroundColor: "var(--app-bg-editor)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <div className="flex items-center gap-1">
          {/* Focus mode toggle */}
          {onToggleFocusMode && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onToggleFocusMode}
              title={focusMode ? "Salir del modo enfoque (Ctrl+Shift+D)" : "Modo enfoque (Ctrl+Shift+D)"}
              className={focusMode ? "text-indigo-400" : ""}
            >
              {focusMode ? (
                /* Compress / exit-focus icon */
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 9L4 4m0 0h5m-5 0v5M15 9l5-5m0 0h-5m5 0v5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" />
                </svg>
              ) : (
                /* Expand / enter-focus icon */
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </Button>
          )}

          <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--app-border)" }} />

          {(["edit", "split", "preview"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                backgroundColor: mode === m ? "rgba(99,102,241,0.15)" : undefined,
                color: mode === m ? "#818cf8" : "var(--app-text-muted)",
              }}
            >
              {m === "edit" ? "Editar" : m === "split" ? "Dividir" : "Vista previa"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {saving && <Spinner className="text-gray-500 w-3 h-3" />}

          {/* Trash-mode actions */}
          {note.isTrashed ? (
            <>
              {onRestore && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRestore(note.id)}
                  title="Restaurar nota"
                  className="text-xs text-green-400 hover:text-green-300 px-2"
                >
                  ↩ Restaurar
                </Button>
              )}
              {onDeletePermanent && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm("¿Eliminar permanentemente esta nota? No hay vuelta atrás.")) {
                      onDeletePermanent(note.id);
                    }
                  }}
                  title="Eliminar permanentemente"
                  className="text-xs text-red-400 hover:text-red-300 px-2"
                >
                  🗑 Eliminar
                </Button>
              )}
            </>
          ) : (
            <>
              {onTogglePin && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onTogglePin(note.id, note.isPinned)}
                  title={note.isPinned ? "Desfijar" : "Fijar nota"}
                  className={note.isPinned ? "text-indigo-400" : ""}
                >
                  📌
                </Button>
              )}

              {onTrash && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onTrash(note.id)}
                  title="Mover a papelera"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-4 pb-2 shrink-0">
        <input
          key={note.id}
          value={localTitle}
          onChange={(e) => {
            setLocalTitle(e.target.value);
            debouncedSave("title", e.target.value);
          }}
          placeholder="Sin título"
          className="w-full bg-transparent text-xl font-semibold outline-none"
          style={{ color: "var(--app-text-primary)" }}
        />
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {note.notebook && (
            <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              📓 {note.notebook.name}
            </span>
          )}
          {note.noteTags.map(({ tag }) => (
            <span
              key={tag.id}
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: tag.color + "22",
                color: tag.color ?? "#6366f1",
                border: `1px solid ${tag.color ?? "#6366f1"}33`,
              }}
            >
              {tag.name}
            </span>
          ))}
          {!note.isTrashed && availableTags.length > 0 && (
            <TagPicker
              note={note}
              availableTags={availableTags}
              onUpdateTags={(tagIds) => onUpdate(note.id, { tagIds })}
            />
          )}
        </div>
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--app-border)" }} />

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden flex">
        {(mode === "edit" || mode === "split") && (
          <div
            ref={editorPanelRef}
            className={cn("overflow-hidden", mode === "split" ? "w-1/2" : "w-full")}
            style={mode === "split" ? { borderRight: "1px solid var(--app-border)" } : undefined}
          >
            <MarkdownEditor
              key={note.id}
              value={localBody}
              onChange={(v) => {
                setLocalBody(v);
                debouncedSave("body", v);
              }}
            />
          </div>
        )}

        {(mode === "preview" || mode === "split") && (
          <div
            ref={previewPanelRef}
            className={cn(
              "overflow-y-auto",
              mode === "split" ? "w-1/2" : "w-full"
            )}
          >
            <MarkdownPreviewWrapper body={localBody} />
          </div>
        )}
      </div>
    </div>
  );
}

function TagPicker({
  note,
  availableTags,
  onUpdateTags,
}: {
  note: NoteWithRelations;
  availableTags: Tag[];
  onUpdateTags: (tagIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentTagIds = note.noteTags.map(({ tag }) => tag.id);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function toggle(tagId: string) {
    const next = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];
    setSaving(true);
    await onUpdateTags(next);
    setSaving(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs transition-colors px-1.5 py-0.5 rounded"
        style={{
          color: "var(--app-text-muted)",
          border: "1px solid var(--app-border-strong)",
        }}
        title="Asignar tags"
      >
        {saving ? (
          <Spinner className="w-3 h-3" />
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
            </svg>
            <span>Tags</span>
          </>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-7 z-20 rounded-lg shadow-xl py-1 w-44 max-h-56 overflow-y-auto"
          style={{
            backgroundColor: "var(--app-bg-menu)",
            border: "1px solid var(--app-border-strong)",
          }}
        >
          {availableTags.map((tag) => {
            const active = currentTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggle(tag.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-secondary)" }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color ?? "#6366f1" }}
                />
                <span className="flex-1 text-left truncate">{tag.name}</span>
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

function MarkdownPreviewWrapper({ body }: { body: string }) {
  const [Preview, setPreview] = useState<React.ComponentType<{ content: string }> | null>(null);

  useEffect(() => {
    import("@/components/editor/MarkdownPreview").then((mod) => {
      setPreview(() => mod.MarkdownPreview);
    });
  }, []);

  if (!Preview)
    return <div className="px-6 py-4"><Spinner className="text-gray-500" /></div>;
  return <Preview content={body} />;
}
