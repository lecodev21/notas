"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LuAlignLeft, LuCheck, LuChevronDown, LuDownload, LuFileDown,
  LuFileText, LuFocus, LuGlobe, LuLink2, LuLoader, LuMaximize2,
  LuMinimize2, LuNotebook, LuPencilLine, LuPin, LuPinOff, LuShare2, LuTrash2,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";
import type { EditorView } from "@codemirror/view";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import type { WritingMode } from "@/components/editor/MarkdownEditor";
import { STATUS_META, STATUS_ORDER, type NoteStatus } from "@/lib/noteStatus";
import { MarkdownToolbar } from "@/components/editor/MarkdownToolbar";
import { FindReplaceBar } from "@/components/editor/FindReplaceBar";
import { NoteInfoPanel } from "@/components/notes/NoteInfoPanel";
import { Modal } from "@/components/ui/Modal";
import { CopyContextMenu } from "@/components/ui/CopyContextMenu";
import { exportAsMarkdown, exportAsHtml, exportAsPdf } from "@/lib/exportNote";
import { useBacklinks } from "@/hooks/useBacklinks";
import { ShareModal } from "@/components/share/ShareModal";
import { OutlineView } from "@/components/editor/OutlineView";
import { parseHeadings, type OutlineItem } from "@/lib/outline";
import { EditorView as CMEditorView } from "@codemirror/view";

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
  onUpdate: (id: string, data: { title?: string; body?: string; tagIds?: string[]; status?: NoteStatus }) => Promise<void>;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string, isPinned: boolean) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
  /** Create a brand-new tag and return it (called when the user types a name that doesn't exist yet) */
  onCreateTag?: (name: string) => Promise<Tag | null>;
  /** Notes for [[wiki link]] completion and backlink navigation */
  availableNotes?: { id: string; title: string }[];
  /** Called when clicking a [[wiki link]] to navigate to the linked note */
  onNavigateToNote?: (noteId: string) => void;
  /** Called when clicking a [[wiki link]] whose note doesn't exist yet — creates it */
  onCreateAndNavigate?: (title: string) => Promise<void>;
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
  onCreateTag,
  availableNotes = [],
  onNavigateToNote,
  onCreateAndNavigate,
}: EditorPanelProps) {
  const [mode, setMode] = useState<ViewMode>("edit");
  const [saving, setSaving] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [writingMode, setWritingMode] = useState<WritingMode>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmTrashOpen,  setConfirmTrashOpen]  = useState(false);
  const [shareModalOpen,    setShareModalOpen]    = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; selectedText: string;
  } | null>(null);

  function handleContentContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const selectedText = window.getSelection()?.toString() ?? "";
    setCtxMenu({ x: e.clientX, y: e.clientY, selectedText });
  }

  function toggleWritingMode() {
    setWritingMode((prev) => (prev === "focus" ? null : "focus"));
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared with MarkdownToolbar so toolbar buttons can dispatch transactions
  const editorViewRef = useRef<EditorView | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Ref that the toolbar uses to trigger image uploads (set by MarkdownEditor)
  const onImageFileRef = useRef<((file: File) => void) | null>(null);

  // Auto-focus the title input whenever a brand-new (empty) note is loaded.
  // We detect "new note" by its default title and empty body so we never need
  // an external prop — the check is local and fires once per note id.
  useEffect(() => {
    if (!note) return;
    if (note.title !== "Sin título" || note.body !== "") return;
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // ── Readable line-length toggle ───────────────────────────────────────────
  const [readableWidth, setReadableWidth] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("inkdrop-readable-width") === "true";
  });
  const toggleReadableWidth = () =>
    setReadableWidth((v) => {
      const next = !v;
      localStorage.setItem("inkdrop-readable-width", String(next));
      return next;
    });

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
      setFindReplaceOpen(false);   // close stale search when switching notes
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

  // ── Wiki link navigation ─────────────────────────────────────────────────
  function handleWikiLinkClick(title: string) {
    const found = availableNotes.find(
      (n) => n.title.toLowerCase() === title.toLowerCase()
    );
    if (found && onNavigateToNote) {
      onNavigateToNote(found.id);
    } else if (!found && onCreateAndNavigate) {
      // Note doesn't exist — create it and navigate to it
      onCreateAndNavigate(title);
    }
  }

  // ── Backlinks ────────────────────────────────────────────────────────────
  const { backlinks } = useBacklinks(note?.id ?? null, note?.title ?? null);
  const [backlinksOpen, setBacklinksOpen] = useState(true);

  // ── Outline headings ─────────────────────────────────────────────────────
  const headings = useMemo(() => parseHeadings(localBody), [localBody]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

  // Track active heading from preview-panel scroll position (preview / split)
  useEffect(() => {
    const panel = previewPanelRef.current;
    if (!panel || (mode !== "preview" && mode !== "split")) return;

    function updateActive() {
      if (!panel) return;
      const panelTop = panel.getBoundingClientRect().top;
      const els = Array.from(
        panel.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")
      );
      if (els.length === 0) { setActiveHeadingId(null); return; }
      const threshold = panelTop + panel.clientHeight * 0.4;
      let active: HTMLElement | null = null;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= threshold) active = el;
        else break;
      }
      setActiveHeadingId((active ?? els[0]).id ?? null);
    }

    panel.addEventListener("scroll", updateActive, { passive: true });
    updateActive();
    return () => panel.removeEventListener("scroll", updateActive);
  }, [mode, note?.id, headings]);

  // Track active heading from CodeMirror scroll position (edit mode)
  useEffect(() => {
    if (mode !== "edit" || headings.length === 0) return;

    // Poll until .cm-scroller appears (CodeMirror is dynamically imported)
    let scroller: HTMLElement | null = null;

    function updateActiveFromEditor() {
      if (!scroller) return;
      const view = editorViewRef.current;
      if (!view) return;
      // Which document position is at the top of the visible area?
      const scrollTop = scroller.scrollTop;
      const block = view.lineBlockAtHeight(scrollTop + 40);
      // Find the last heading whose line starts at or before this position
      let activeItem = headings[0];
      for (const h of headings) {
        const lineStart = view.state.doc.line(h.lineIndex + 1).from;
        if (lineStart <= block.from) activeItem = h;
        else break;
      }
      setActiveHeadingId(activeItem.id);
    }

    const poll = setInterval(() => {
      const ep = editorPanelRef.current;
      if (!ep) return;
      const s = ep.querySelector<HTMLElement>(".cm-scroller");
      if (!s) return;
      clearInterval(poll);
      scroller = s;
      s.addEventListener("scroll", updateActiveFromEditor, { passive: true });
      updateActiveFromEditor();
    }, 50);

    return () => {
      clearInterval(poll);
      if (scroller) scroller.removeEventListener("scroll", updateActiveFromEditor);
    };
  }, [mode, note?.id, headings]);

  // Forward wheel events from OutlineView to the underlying scrollable panel
  const handleOutlineWheel = useCallback((e: React.WheelEvent) => {
    if (mode === "edit") {
      const scroller = editorPanelRef.current?.querySelector<HTMLElement>(".cm-scroller");
      scroller?.scrollBy({ top: e.deltaY, left: e.deltaX });
    } else {
      previewPanelRef.current?.scrollBy({ top: e.deltaY, left: e.deltaX });
    }
  }, [mode]);

  // Scroll handler called when user clicks a heading in OutlineView
  const handleScrollToHeading = useCallback((item: OutlineItem) => {
    if (mode === "preview" || mode === "split") {
      const panel = previewPanelRef.current;
      if (!panel) return;
      const el = panel.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`);
      if (el) {
        panel.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
        setActiveHeadingId(item.id);
      }
    } else {
      // Edit mode: scroll CodeMirror to the heading line and update active
      const view = editorViewRef.current;
      if (!view) return;
      const lines = localBody.split("\n");
      let pos = 0;
      for (let i = 0; i < item.lineIndex && i < lines.length; i++) {
        pos += lines[i].length + 1;
      }
      view.dispatch({
        effects: CMEditorView.scrollIntoView(pos, { y: "start", yMargin: 16 }),
      });
      setActiveHeadingId(item.id);
    }
  }, [mode, localBody]);

  // ── Word-count stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const words = localBody.trim() === "" ? 0 : localBody.trim().split(/\s+/).length;
    const chars = localBody.length;
    const mins  = Math.ceil(words / 200);
    return { words, chars, mins };
  }, [localBody]);

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
        <LuPencilLine className="w-10 h-10 mb-3" style={{ color: "var(--app-text-faint)" }} />
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
                <LuMinimize2 className="w-3.5 h-3.5" />
              ) : (
                <LuMaximize2 className="w-3.5 h-3.5" />
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

          <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--app-border)" }} />

          {/* Readable line-length toggle */}
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleReadableWidth}
            title={readableWidth ? "Ancho completo" : "Ancho de lectura (≈680 px)"}
            className={readableWidth ? "text-indigo-400" : ""}
          >
            <LuAlignLeft className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--app-border)" }} />

          {/* Focus writing mode toggle (typewriter + paragraph dim combined) */}
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleWritingMode}
            title={writingMode === "focus" ? "Desactivar modo de escritura enfocada" : "Modo de escritura enfocada — centra la línea activa y atenúa el resto"}
            className={writingMode === "focus" ? "text-indigo-400" : ""}
          >
            <LuFocus className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--app-border)" }} />

          {/* Export dropdown */}
          <ExportMenu title={localTitle} body={localBody} />
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
                  onClick={() => setConfirmDeleteOpen(true)}
                  title="Eliminar permanentemente"
                  className="text-xs text-red-400 hover:text-red-300 px-2 gap-1"
                >
                  <LuTrash2 className="w-3.5 h-3.5" /> Eliminar
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Share button */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShareModalOpen(true)}
                title="Compartir nota"
                className="text-xs gap-1 px-2"
                style={{ color: note.shareToken ? "#818cf8" : undefined }}
              >
                <LuShare2 className="w-3 h-3" />
                {note.shareToken ? "Compartida" : "Compartir"}
              </Button>

              {onTogglePin && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onTogglePin(note.id, note.isPinned)}
                  title={note.isPinned ? "Desfijar" : "Fijar nota"}
                  className={note.isPinned ? "text-indigo-400" : ""}
                >
                  {note.isPinned ? <LuPinOff className="w-3.5 h-3.5" /> : <LuPin className="w-3.5 h-3.5" />}
                </Button>
              )}

              {onTrash && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setConfirmTrashOpen(true)}
                  title="Mover a papelera"
                >
                  <LuTrash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pt-4 pb-2 shrink-0">
        <input
          ref={titleInputRef}
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
          {/* Status selector */}
          {!note.isTrashed && (
            <StatusSelector
              status={(note.status as NoteStatus) ?? "active"}
              onChange={(s) => onUpdate(note.id, { status: s })}
            />
          )}

          {(note.notebook || !note.isTrashed) && (
            <span style={{ color: "var(--app-border-strong)" }}>·</span>
          )}

          {note.notebook && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--app-text-muted)" }}>
              <LuNotebook className="w-3 h-3 shrink-0" />
              {note.notebook.name}
            </span>
          )}
          {note.notebook && (
            <span style={{ color: "var(--app-border-strong)" }}>·</span>
          )}
          <TagInput
            currentTags={note.noteTags.map(({ tag }) => tag)}
            availableTags={availableTags}
            disabled={note.isTrashed}
            onUpdateTags={(tagIds) => onUpdate(note.id, { tagIds })}
            onCreateTag={onCreateTag}
          />
        </div>
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--app-border)" }} />

      {/* Markdown formatting toolbar — only in edit/split, not preview */}
      {mode !== "preview" && <MarkdownToolbar editorViewRef={editorViewRef} onImageFileRef={onImageFileRef} />}

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        {(mode === "edit" || mode === "split") && (
          <div
            ref={editorPanelRef}
            className={cn(
              "overflow-hidden relative",
              mode === "split" ? "md:w-1/2 h-1/2 md:h-auto" : "w-full",
            )}
            style={mode === "split" ? { borderRight: "1px solid var(--app-border)" } : undefined}
            onContextMenu={handleContentContextMenu}
            onKeyDown={(e) => {
              // Ctrl/Cmd+F opens in-editor find-replace and prevents the global
              // note-list search from activating (stopPropagation via nativeEvent
              // stops bubbling past React's root to the document listener).
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "f") {
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
                setFindReplaceOpen(true);
              }
            }}
          >
            {findReplaceOpen && (
              <FindReplaceBar
                viewRef={editorViewRef}
                onClose={() => setFindReplaceOpen(false)}
              />
            )}
            <MarkdownEditor
              key={note.id}
              value={localBody}
              editorViewRef={editorViewRef}
              readableWidth={readableWidth}
              writingMode={writingMode}
              availableNotes={availableNotes}
              onImageFileRef={onImageFileRef}
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
              mode === "split" ? "md:w-1/2 h-1/2 md:h-auto" : "w-full",
            )}
            onContextMenu={handleContentContextMenu}
          >
            <div style={readableWidth ? { maxWidth: 680, margin: "0 auto" } : undefined}>
              <NoteInfoPanel note={note} body={localBody} />
              <MarkdownPreviewWrapper
                body={localBody}
                availableNotes={availableNotes}
                onWikiLinkClick={handleWikiLinkClick}
                onToggleTask={note.isTrashed ? undefined : (idx) => {
                  const next = toggleTaskAtIndex(localBody, idx);
                  // Dispatch a targeted change to CodeMirror so it doesn't do
                  // a full doc replacement (which would reset scroll to top).
                  // @uiw/react-codemirror skips re-dispatching when value ===
                  // doc.toString(), so setting localBody afterwards is safe.
                  const view = editorViewRef.current;
                  if (view && !(view as EditorView & { isDestroyed?: boolean }).isDestroyed) {
                    const old = view.state.doc.toString();
                    if (old !== next) {
                      // Find the minimal changed range so CodeMirror treats it
                      // as a small edit instead of a full replacement.
                      let from = 0;
                      while (from < old.length && from < next.length && old[from] === next[from]) from++;
                      let oldTo = old.length;
                      let newTo = next.length;
                      while (oldTo > from && newTo > from && old[oldTo - 1] === next[newTo - 1]) {
                        oldTo--;
                        newTo--;
                      }
                      view.dispatch({ changes: { from, to: oldTo, insert: next.slice(from, newTo) } });
                    }
                  }
                  setLocalBody(next);
                  debouncedSave("body", next);
                }}
              />
            </div>
          </div>
        )}

        {/* Outline — absolutely positioned on the right edge of the content area */}
        <OutlineView
          headings={headings}
          activeId={activeHeadingId}
          onClickHeading={handleScrollToHeading}
          onWheel={handleOutlineWheel}
        />
      </div>

      {/* Backlinks panel — shown below editor/preview when there are backlinks */}
      {backlinks.length > 0 && (
        <div
          className="shrink-0"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-left transition-colors"
            style={{ color: "var(--app-text-muted)" }}
            onClick={() => setBacklinksOpen((v) => !v)}
          >
            <LuLink2 className="w-3 h-3" />
            <span style={{ color: "var(--app-text-secondary)", fontWeight: 600 }}>
              Backlinks ({backlinks.length})
            </span>
            <LuChevronDown
              className="w-3 h-3 ml-auto transition-transform"
              style={{ transform: backlinksOpen ? "rotate(180deg)" : undefined }}
            />
          </button>
          {backlinksOpen && (
            <div
              className="px-4 pb-3 space-y-2 max-h-40 overflow-y-auto"
            >
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  className="w-full text-left rounded-lg px-3 py-2 transition-colors"
                  style={{ backgroundColor: "var(--app-hover)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
                  }
                  onClick={() => onNavigateToNote?.(bl.id)}
                >
                  <p className="text-xs font-medium" style={{ color: "var(--app-text-primary)" }}>
                    {bl.title}
                  </p>
                  {bl.snippet && (
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--app-text-muted)" }}>
                      {bl.snippet}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Copy context menu — editor & preview areas */}
      {ctxMenu && (
        <CopyContextMenu
          body={localBody}
          selectedText={ctxMenu.selectedText}
          coords={{ x: ctxMenu.x, y: ctxMenu.y }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Move to trash confirmation modal */}
      <Modal open={confirmTrashOpen} onClose={() => setConfirmTrashOpen(false)}>
        <div className="flex flex-col items-center gap-3 px-2 py-1">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(99,102,241,0.12)" }}
          >
            <LuTrash2 className="w-5 h-5" style={{ color: "#818cf8" }} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--app-text-primary)" }}>
              ¿Mover a la papelera?
            </p>
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              La nota se eliminará en 30 días si no la restauras.
            </p>
          </div>
          <div className="flex gap-2 w-full mt-1">
            <button
              className="flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--app-hover)",
                color:           "var(--app-text-secondary)",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
              }
              onClick={() => setConfirmTrashOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ backgroundColor: "rgba(99,102,241,0.15)", color: "#818cf8" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(99,102,241,0.25)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(99,102,241,0.15)")
              }
              onClick={() => {
                onTrash?.(note.id);
                setConfirmTrashOpen(false);
              }}
            >
              Mover a papelera
            </button>
          </div>
        </div>
      </Modal>

      {/* Permanent delete confirmation modal */}
      <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <div className="flex flex-col items-center gap-3 px-2 py-1">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(239,68,68,0.15)" }}
          >
            <LuTrash2 className="w-5 h-5 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--app-text-primary)" }}>
              ¿Eliminar esta nota?
            </p>
            <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              Esta acción es permanente y no se puede deshacer.
            </p>
          </div>
          <div className="flex gap-2 w-full mt-1">
            <button
              className="flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--app-hover)",
                color:           "var(--app-text-secondary)",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
              }
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors bg-red-500/15 text-red-400 hover:bg-red-500/25"
              onClick={() => {
                onDeletePermanent?.(note.id);
                setConfirmDeleteOpen(false);
              }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </Modal>

      {/* Share modal */}
      {shareModalOpen && (
        <ShareModal
          noteId={note.id}
          noteTitle={localTitle}
          initialToken={note.shareToken ?? null}
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* Word-count status bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-4 py-1 text-xs select-none theme-transition"
        style={{
          borderTop: "1px solid var(--app-border)",
          color: "var(--app-text-faint)",
        }}
      >
        <span>{stats.words.toLocaleString("es-MX")} {stats.words === 1 ? "palabra" : "palabras"}</span>
        <span style={{ color: "var(--app-border-strong)" }}>·</span>
        <span>{stats.chars.toLocaleString("es-MX")} {stats.chars === 1 ? "carácter" : "caracteres"}</span>
        <span style={{ color: "var(--app-border-strong)" }}>·</span>
        <span>{stats.mins} {stats.mins === 1 ? "min" : "mins"} de lectura</span>
      </div>
    </div>
  );
}

// ── Export menu ───────────────────────────────────────────────────────────────

function ExportMenu({ title, body }: { title: string; body: string }) {
  const [open, setOpen]       = useState(false);
  const [busy, setBusy]       = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handle(format: "md" | "html" | "pdf") {
    setBusy(format);
    setOpen(false);
    try {
      if (format === "md")   exportAsMarkdown(title, body);
      if (format === "html") await exportAsHtml(title, body);
      if (format === "pdf")  await exportAsPdf(title, body);
    } finally {
      setBusy(null);
    }
  }

  const ITEMS: { format: "md" | "html" | "pdf"; icon: React.ReactNode; label: string }[] = [
    { format: "md",   icon: <LuFileDown className="w-3.5 h-3.5" />, label: "Exportar como Markdown" },
    { format: "html", icon: <LuGlobe    className="w-3.5 h-3.5" />, label: "Exportar como HTML"     },
    { format: "pdf",  icon: <LuFileText className="w-3.5 h-3.5" />, label: "Exportar como PDF"      },
  ];

  return (
    <div ref={ref} className="relative">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        title="Exportar nota"
        className={open ? "text-indigo-400" : ""}
      >
        {busy ? (
          <LuLoader className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <LuDownload className="w-3.5 h-3.5" />
        )}
      </Button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-40 rounded-lg shadow-xl py-1"
          style={{
            backgroundColor: "var(--app-bg-menu)",
            border:          "1px solid var(--app-border-strong)",
            minWidth:        210,
          }}
        >
          <p
            className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--app-text-muted)" }}
          >
            Exportar nota
          </p>
          <div style={{ borderTop: "1px solid var(--app-border)" }} className="mt-0.5 pt-0.5" />
          {ITEMS.map(({ format, icon, label }) => (
            <button
              key={format}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left transition-colors"
              style={{ color: "var(--app-text-secondary)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
              }
              onClick={() => handle(format)}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status selector ────────────────────────────────────────────────────────

function StatusSelector({
  status,
  onChange,
}: {
  status: NoteStatus;
  onChange: (s: NoteStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = STATUS_META[status];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors"
        style={{
          backgroundColor: "var(--app-hover)",
          color: "var(--app-text-secondary)",
          border: "1px solid var(--app-border-strong)",
        }}
        title="Cambiar estado"
      >
        <span className="text-[10px] leading-none font-bold" style={{ color: meta.color }}>{meta.icon}</span>
        <span>{meta.label}</span>
        <LuChevronDown className="w-2.5 h-2.5 opacity-50" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-30 rounded-lg shadow-xl py-1 w-36"
          style={{
            backgroundColor: "var(--app-bg-menu)",
            border: "1px solid var(--app-border-strong)",
          }}
        >
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            const isActive = s === status;
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
                style={{
                  color: isActive ? "#818cf8" : "var(--app-text-secondary)",
                  backgroundColor: isActive ? "rgba(99,102,241,0.12)" : undefined,
                  fontWeight: isActive ? 600 : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
                }}
              >
                <span className="text-[11px] leading-none font-bold" style={{ color: m.color }}>{m.icon}</span>
                {m.label}
                {isActive && (
                  <LuCheck className="w-3 h-3 ml-auto shrink-0 text-indigo-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagInput({
  currentTags,
  availableTags,
  disabled = false,
  onUpdateTags,
  onCreateTag,
}: {
  currentTags: Tag[];
  availableTags: Tag[];
  disabled?: boolean;
  onUpdateTags: (tagIds: string[]) => Promise<void>;
  onCreateTag?: (name: string) => Promise<Tag | null>;
}) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setInputValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentIds = currentTags.map((t) => t.id);

  // Available tags not yet assigned, filtered by what the user is typing
  const suggestions = availableTags.filter(
    (t) =>
      !currentIds.includes(t.id) &&
      t.name.toLowerCase().includes(inputValue.toLowerCase())
  );

  const query = inputValue.trim();
  const exactMatch = availableTags.find(
    (t) => t.name.toLowerCase() === query.toLowerCase()
  );
  const canCreate = !!onCreateTag && query.length > 0 && !exactMatch;

  async function addTag(tag: Tag) {
    setBusy(true);
    await onUpdateTags([...currentIds, tag.id]);
    setBusy(false);
    setInputValue("");
    setOpen(false);
    inputRef.current?.focus();
  }

  async function removeTag(tagId: string) {
    setBusy(true);
    await onUpdateTags(currentIds.filter((id) => id !== tagId));
    setBusy(false);
  }

  async function handleCommit() {
    if (!query) return;
    if (exactMatch && !currentIds.includes(exactMatch.id)) {
      await addTag(exactMatch);
      return;
    }
    if (canCreate) {
      setBusy(true);
      const newTag = await onCreateTag!(query);
      if (newTag) await onUpdateTags([...currentIds, newTag.id]);
      setBusy(false);
      setInputValue("");
      setOpen(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1.5">
      {/* Assigned tag chips */}
      {currentTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: (tag.color ?? "#6366f1") + "22",
            color: tag.color ?? "#6366f1",
            border: `1px solid ${tag.color ?? "#6366f1"}33`,
          }}
        >
          {tag.name}
          {!disabled && (
            <button
              onClick={() => removeTag(tag.id)}
              className="leading-none opacity-60 hover:opacity-100 transition-opacity"
              title={`Quitar tag "${tag.name}"`}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {/* Inline input (hidden when note is trashed) */}
      {!disabled && (
        <div className="flex items-center gap-1">
          {busy && <Spinner className="w-3 h-3" />}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleCommit(); }
              if (e.key === "Escape") { setInputValue(""); setOpen(false); }
              if (e.key === "Backspace" && !inputValue && currentTags.length > 0) {
                removeTag(currentTags[currentTags.length - 1].id);
              }
            }}
            placeholder={currentTags.length === 0 ? "Agregar tag..." : "＋ tag"}
            className="bg-transparent text-xs outline-none"
            style={{
              color: "var(--app-text-muted)",
              minWidth: currentTags.length === 0 ? "90px" : "52px",
              width: `${Math.max(inputValue.length + 1, currentTags.length === 0 ? 10 : 5)}ch`,
            }}
          />
        </div>
      )}

      {/* Suggestions dropdown */}
      {open && (suggestions.length > 0 || canCreate) && (
        <div
          className="absolute left-0 top-full mt-1 z-20 rounded-lg shadow-xl py-1 w-48 max-h-52 overflow-y-auto"
          style={{
            backgroundColor: "var(--app-bg-menu)",
            border: "1px solid var(--app-border-strong)",
          }}
        >
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              onClick={() => addTag(tag)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
              style={{ color: "var(--app-text-secondary)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
              }
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: tag.color ?? "#6366f1" }}
              />
              {tag.name}
            </button>
          ))}

          {canCreate && (
            <button
              onClick={handleCommit}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
              style={{ color: "var(--app-text-muted)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
              }
            >
              <span className="text-indigo-400 font-bold">+</span>
              Crear &ldquo;{query}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Toggle the nth task checkbox (0-based) in a markdown body string. */
function toggleTaskAtIndex(body: string, idx: number): string {
  // Only count checkboxes that will actually render as DOM <input>s:
  //   • GFM task list items  →  lines like "- [ ] text" or "  * [x] text"
  //   • Table rows           →  lines that contain a pipe character
  // Plain paragraph text that happens to contain [x] is intentionally ignored
  // so the index matches the DOM order produced by MarkdownPreview.
  let count = 0;
  const lines = body.split("\n");
  return lines.map((line) => {
    // GFM task list item: optional indent, list marker, space, checkbox
    if (/^[ \t]{0,3}[-*+] \[[ xX]\] /.test(line)) {
      return line.replace(
        /^([ \t]{0,3}[-*+] \[)([ xX])(\] )/,
        (m, open, check, close) => {
          if (count++ === idx) return `${open}${check !== " " ? " " : "x"}${close}`;
          return m;
        }
      );
    }
    // Table row: any line containing |
    if (line.includes("|")) {
      return line.replace(/(\[)([ xX])(\])(?!\()/g, (m, open, check, close) => {
        if (count++ === idx) return `${open}${check !== " " ? " " : "x"}${close}`;
        return m;
      });
    }
    return line;
  }).join("\n");
}

type PreviewComponent = React.ComponentType<{
  content: string;
  onToggleTask?: (taskIndex: number) => void;
  availableNotes?: { id: string; title: string }[];
  onWikiLinkClick?: (title: string) => void;
}>;

function MarkdownPreviewWrapper({
  body,
  onToggleTask,
  availableNotes,
  onWikiLinkClick,
}: {
  body: string;
  onToggleTask?: (taskIndex: number) => void;
  availableNotes?: { id: string; title: string }[];
  onWikiLinkClick?: (title: string) => void;
}) {
  const [Preview, setPreview] = useState<PreviewComponent | null>(null);

  useEffect(() => {
    import("@/components/editor/MarkdownPreview").then((mod) => {
      setPreview(() => mod.MarkdownPreview as PreviewComponent);
    });
  }, []);

  if (!Preview)
    return <div className="px-6 py-4"><Spinner className="text-gray-500" /></div>;
  return (
    <Preview
      content={body}
      onToggleTask={onToggleTask}
      availableNotes={availableNotes}
      onWikiLinkClick={onWikiLinkClick}
    />
  );
}
