"use client";

import { useState, useEffect } from "react";

import { Sidebar } from "./Sidebar";
import { NoteList } from "./NoteList";
import { EditorPanel } from "./EditorPanel";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote, useStatusCounts } from "@/hooks/useNotes";
import { STATUS_META as STATUS_META_MAP, type NoteStatus } from "@/lib/noteStatus";
import { useNotebooks, useCreateNotebook, useUpdateNotebook, useDeleteNotebook } from "@/hooks/useNotebooks";
import { useTags, useCreateTag, useDeleteTag } from "@/hooks/useTags";
import { useSearch } from "@/hooks/useSearch";
import { parseFrontmatter } from "@/lib/parseFrontmatter";
import { extractObsidianTags } from "@/lib/extractObsidianTags";


type ViewType = "all" | "pinned" | "trash" | "notebook" | "tag" | "status";

export interface ImportResult {
  notes: number;
  notebooks: number;
  tags: number;
  notebookNames: string[];
}

interface AppShellProps {
  initialNoteId?: string;
}

export function AppShell({ initialNoteId }: AppShellProps) {
  // State
  const [view, setView] = useState<ViewType>("all");
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialNoteId ?? null
  );
  const [selectedStatus, setSelectedStatus] = useState<NoteStatus | null>(null);
  const [exitingNoteId, setExitingNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);


  // Data hooks
  const notesFilter = buildFilter(view, selectedNotebook, selectedTag, selectedStatus);
  const { notes, loading: notesLoading } = useNotes(notesFilter);
  const { counts: statusCounts } = useStatusCounts();
  const { notes: searchResults, loading: searchLoading } = useSearch(searchQuery);
  const { note: selectedNote, loading: noteLoading } = useNotes({ id: selectedNoteId });
  // All notes (all statuses, non-trashed) — used for wiki link autocomplete and navigation
  const { notes: allNotes } = useNotes({ allStatuses: true });
  const { notebooks } = useNotebooks();
  const { tags, mutateTags } = useTags();

  const { createNote } = useCreateNote();
  const { createNotebook } = useCreateNotebook();
  const { updateNotebook } = useUpdateNotebook();
  const { deleteNotebook } = useDeleteNotebook();
  const { createTag } = useCreateTag();
  const { deleteTag } = useDeleteTag();
  const { updateNote } = useUpdateNote();
  const { deleteNote } = useDeleteNote();

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Ctrl/Cmd+Shift+D = toggle focus (distraction-free) mode
      if (e.shiftKey && e.key === "D") {
        e.preventDefault();
        setFocusMode((v) => !v);
        return;
      }

      // Cmd/Ctrl+N = new note
      if (e.key === "n") {
        e.preventDefault();
        handleNewNote();
      }
      // Cmd/Ctrl+F = focus search (handled by NoteList's input)
      if (e.key === "f") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Buscar notas..."]'
        );
        searchInput?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNotebook]);

  // Build notebook tree
  const notebookTree = buildTree(notebooks);

  // Displayed notes (search overrides filter)
  const displayedNotes = searchQuery.trim() ? searchResults : notes;

  // Context label
  const contextLabel = getContextLabel(view, selectedNotebook, selectedTag, selectedStatus, notebooks);

  async function handleNewNote() {
    const note = await createNote({
      title: "Sin título",
      notebookId: selectedNotebook ?? undefined,
    });
    if (note) {
      setSelectedNoteId(note.id);
      window.history.replaceState(null, "", `/notes/${note.id}`);
    }
  }

  function handleMoveNote(noteId: string, notebookId: string) {
    // 1. Trigger exit animation on the card immediately
    setExitingNoteId(noteId);
    // 2. After animation completes, do the actual update (filters note from
    //    cache in-place — no list reload, no spinner)
    setTimeout(async () => {
      await updateNote(noteId, { notebookId });
      setExitingNoteId(null);
    }, 260); // matches NoteCard transition duration
  }

  async function handleUpdate(id: string, data: { title?: string; body?: string; tagIds?: string[]; status?: NoteStatus }) {
    // Before updating, figure out which tags are being removed from this note.
    // If a removed tag ends up with 0 notes after this update, delete it.
    let removedTagIds: string[] = [];
    if (data.tagIds !== undefined) {
      const currentTagIds = activeNote?.noteTags.map(({ tag }) => tag.id) ?? [];
      removedTagIds = currentTagIds.filter((id) => !data.tagIds!.includes(id));
    }

    await updateNote(id, data);

    // Auto-delete tags that are now orphaned (count was 1 → this was the only note)
    for (const tagId of removedTagIds) {
      const tag = tags.find((t) => t.id === tagId);
      if (tag && tag._count.noteTags <= 1) {
        await deleteTag(tagId);
        // If we were filtering by this tag, reset the view
        if (selectedTag === tag.name) {
          setView("all");
          setSelectedTag(null);
        }
      }
    }

    // Revalidate tag counts after any tag assignment/removal (and after
    // auto-deletes), so the sidebar always shows the correct number.
    if (data.tagIds !== undefined) {
      await mutateTags();
    }
  }

  function handleSelectNote(id: string) {
    setSelectedNoteId(id);
    window.history.replaceState(null, "", `/notes/${id}`);
  }

  function handleSelectView(v: "all" | "pinned" | "trash") {
    setView(v);
    setSelectedNotebook(null);
    setSelectedTag(null);
    setSelectedStatus(null);
    setSelectedNoteId(null);
    setSearchQuery("");
  }

  function handleSelectNotebook(id: string) {
    setView("notebook");
    setSelectedNotebook(id);
    setSelectedTag(null);
    setSelectedStatus(null);
    setSelectedNoteId(null);
    setSearchQuery("");
  }

  function handleSelectTag(name: string) {
    setView("tag");
    setSelectedTag(name);
    setSelectedNotebook(null);
    setSelectedStatus(null);
    setSelectedNoteId(null);
    setSearchQuery("");
  }

  function handleSelectStatus(status: NoteStatus) {
    setView("status");
    setSelectedStatus(status);
    setSelectedNotebook(null);
    setSelectedTag(null);
    setSelectedNoteId(null);
    setSearchQuery("");
  }

  async function handleTrash(id: string) {
    await updateNote(id, { isTrashed: true });
    if (selectedNoteId === id) setSelectedNoteId(null);
  }

  async function handleRestore(id: string) {
    await updateNote(id, { isTrashed: false });
  }

  async function handleDeletePermanent(id: string) {
    await deleteNote(id);
    if (selectedNoteId === id) setSelectedNoteId(null);
  }

  async function handleTogglePin(id: string, isPinned: boolean) {
    await updateNote(id, { isPinned: !isPinned });
  }

  async function handleImport(files: FileList | File[]): Promise<ImportResult | null> {
    const mdFiles = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".md") && !f.name.startsWith(".")
    );
    if (mdFiles.length === 0) return null;

    let notesCreated    = 0;
    let notebooksCreated = 0;
    let tagsCreated     = 0;
    const notebookNamesCreated: string[] = [];

    // Detect mode: folder import if any file has a path with "/"
    const isFolderImport = mdFiles.some((f) => f.webkitRelativePath?.includes("/"));

    const TAG_PALETTE = [
      "#6366f1","#8b5cf6","#ec4899","#ef4444",
      "#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#84cc16",
    ];

    // ── Shared helpers ──────────────────────────────────────────────────────

    // Cache keyed by lowercased path (e.g. "trabajo" or "trabajo/backend") → notebook id
    const notebookCache = new Map<string, string>();
    const tagCache      = new Map<string, string>(); // lowercaseName → id

    /** Find or create a notebook.  pathKey is the full lowercased path. */
    async function resolveNotebook(
      pathKey: string,
      name: string,
      parentId?: string,
    ): Promise<string | undefined> {
      const cached = notebookCache.get(pathKey);
      if (cached) return cached;

      // Search existing notebooks (match name + parentId)
      const existing = notebooks.find(
        (n) =>
          n.name.toLowerCase() === name.toLowerCase() &&
          (parentId ? n.parentId === parentId : !n.parentId),
      );
      if (existing) {
        notebookCache.set(pathKey, existing.id);
        return existing.id;
      }

      const newNb = await createNotebook({ name, parentId: parentId ?? null });
      if (newNb) {
        notebookCache.set(pathKey, newNb.id);
        notebooksCreated++;
        notebookNamesCreated.push(name);
        return newNb.id;
      }
      return undefined;
    }

    /** Find or create tags from an array of names. Returns resolved ids. */
    async function resolveTags(tagNames: string[]): Promise<string[]> {
      const ids: string[] = [];
      for (const rawName of tagNames) {
        const name = rawName.trim();
        if (!name) continue;
        const key = name.toLowerCase();

        const cached = tagCache.get(key);
        if (cached) { ids.push(cached); continue; }

        const existing = tags.find((t) => t.name.toLowerCase() === key);
        if (existing) { ids.push(existing.id); tagCache.set(key, existing.id); continue; }

        const color  = TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
        const newTag = await createTag({ name, color });
        if (newTag) { tagCache.set(key, newTag.id); ids.push(newTag.id); tagsCreated++; }
      }
      return ids;
    }

    // ── Folder import ────────────────────────────────────────────────────────
    // webkitRelativePath = "RootFolder/Notebook/SubNotebook/file.md"
    // Index 0 = root (vault name) — skip it.
    // Indexes 1..n-1 = notebook hierarchy.
    // Last index = filename.

    if (isFolderImport) {
      // Collect every unique folder path and its actual display name.
      // Rule:
      //   • File directly in root (parts.length === 2):  root folder itself = notebook
      //     key = parts[0].toLowerCase()
      //   • File inside subfolder (parts.length > 2):    subfolder hierarchy = notebooks
      //     keys = parts[1..n-2] (skip root, skip filename)
      const pathDisplayName = new Map<string, string>(); // lowercaseKey → displayName

      for (const file of mdFiles) {
        const parts = file.webkitRelativePath.split("/");
        if (parts.length === 2) {
          // e.g. "MyVault/note.md" → notebook "MyVault"
          const key = parts[0].toLowerCase();
          if (!pathDisplayName.has(key)) pathDisplayName.set(key, parts[0]);
        } else {
          // e.g. "MyVault/Trabajo/Backend/note.md" → creates "Trabajo" + "Trabajo/Backend"
          for (let depth = 1; depth < parts.length - 1; depth++) {
            const key = parts.slice(1, depth + 1).map((p) => p.toLowerCase()).join("/");
            if (!pathDisplayName.has(key)) pathDisplayName.set(key, parts[depth]);
          }
        }
      }

      // Sort paths shortest-first so parents are created before children
      const sortedPaths = Array.from(pathDisplayName.keys()).sort(
        (a, b) => a.split("/").length - b.split("/").length,
      );

      // Pre-create all notebooks in order
      for (const pathKey of sortedPaths) {
        const parts    = pathKey.split("/");
        const name     = pathDisplayName.get(pathKey)!;
        const parentKey = parts.length > 1 ? parts.slice(0, -1).join("/") : undefined;
        const parentId  = parentKey ? notebookCache.get(parentKey) : undefined;
        await resolveNotebook(pathKey, name, parentId);
      }

      // Import each file
      for (const file of mdFiles) {
        const parts = file.webkitRelativePath.split("/");
        const nbPathKey =
          parts.length === 2
            ? parts[0].toLowerCase()                                                    // root folder
            : parts.slice(1, parts.length - 1).map((p) => p.toLowerCase()).join("/"); // subfolder path
        const notebookId = notebookCache.get(nbPathKey);

        const content = await file.text();
        const { frontmatter, body: rawBody } = parseFrontmatter(content);

        // Extract Obsidian-style inline tags (#tag) and get cleaned body
        const { tags: inlineTags, cleanBody } = extractObsidianTags(rawBody);

        const title =
          frontmatter.title?.trim() ||
          file.name.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim() ||
          "Sin título";

        const note = await createNote({ title, body: cleanBody, notebookId });
        if (!note) continue;
        notesCreated++;

        // Merge frontmatter tags + inline Obsidian tags (deduplicated)
        const allTagNames = mergeTagNames(frontmatter.tags ?? [], inlineTags);
        if (allTagNames.length) {
          const tagIds = await resolveTags(allTagNames);
          if (tagIds.length) await updateNote(note.id, { tagIds });
        }
      }

    // ── File import (frontmatter mode) ────────────────────────────────────
    } else {
      for (const file of mdFiles) {
        const content = await file.text();
        const { frontmatter, body: rawBody } = parseFrontmatter(content);

        // Extract Obsidian-style inline tags (#tag) and get cleaned body
        const { tags: inlineTags, cleanBody } = extractObsidianTags(rawBody);

        const title =
          frontmatter.title?.trim() ||
          file.name.replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim() ||
          "Sin título";

        let notebookId: string | undefined;
        if (frontmatter.notebook) {
          const nbName = frontmatter.notebook.trim();
          notebookId   = await resolveNotebook(nbName.toLowerCase(), nbName, undefined);
        }

        const note = await createNote({ title, body: cleanBody, notebookId });
        if (!note) continue;
        notesCreated++;

        // Merge frontmatter tags + inline Obsidian tags (deduplicated)
        const allTagNames = mergeTagNames(frontmatter.tags ?? [], inlineTags);
        if (allTagNames.length) {
          const tagIds = await resolveTags(allTagNames);
          if (tagIds.length) await updateNote(note.id, { tagIds });
        }
      }
    }

    await mutateTags();
    return { notes: notesCreated, notebooks: notebooksCreated, tags: tagsCreated, notebookNames: notebookNamesCreated };
  }

  async function handleNewSubNotebook(parentId: string, name: string) {
    await createNotebook({ name, parentId });
  }

  async function handleRenameNotebook(id: string, name: string) {
    await updateNotebook(id, { name });
  }

  async function handleDeleteNotebook(id: string) {
    await deleteNotebook(id);
    if (selectedNotebook === id) {
      setView("all");
      setSelectedNotebook(null);
    }
  }

  // Find selected note from displayed list or fetch separately
  const activeNote =
    (displayedNotes.find((n) => n.id === selectedNoteId) as typeof selectedNote) ??
    selectedNote;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Panel 1: Sidebar — collapses to 0 in focus mode */}
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
        style={{ width: focusMode ? 0 : "13rem" /* w-52 = 208px */ }}
      >
        <div className="w-52 h-full">
          <Sidebar
            notebooks={notebookTree}
            tags={tags}
            selectedNotebook={selectedNotebook}
            selectedTag={selectedTag}
            selectedStatus={selectedStatus}
            statusCounts={statusCounts as Record<NoteStatus, number>}
            view={view}
            onSelectView={handleSelectView}
            onSelectNotebook={handleSelectNotebook}
            onSelectTag={handleSelectTag}
            onSelectStatus={handleSelectStatus}
            onNewNotebook={(name) => createNotebook({ name })}
            onNewSubNotebook={handleNewSubNotebook}
            onRenameNotebook={handleRenameNotebook}
            onDeleteNotebook={handleDeleteNotebook}
            onDropNote={handleMoveNote}
          />
        </div>
      </div>

      {/* Panel 2: Note List — collapses to 0 in focus mode */}
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
        style={{ width: focusMode ? 0 : "16rem" /* w-64 = 256px */ }}
      >
        <div className="w-64 h-full">
          <NoteList
            notes={displayedNotes as Parameters<typeof NoteList>[0]["notes"]}
            loading={notesLoading || searchLoading}
            selectedNoteId={selectedNoteId}
            exitingNoteId={exitingNoteId}
            contextLabel={searchQuery ? `Resultados: "${searchQuery}"` : contextLabel}
            isTrashView={view === "trash"}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onSearch={setSearchQuery}
            onImport={handleImport}
          />
        </div>
      </div>

      {/* Panel 3: Editor — always visible, expands to full width in focus mode */}
      <div className="flex-1 min-w-0">
        <EditorPanel
          note={activeNote ?? null}
          loading={noteLoading && !!selectedNoteId}
          availableTags={tags}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode((v) => !v)}
          onUpdate={handleUpdate}
          onCreateTag={async (name) => {
            const TAG_PALETTE = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f97316","#f59e0b","#10b981","#06b6d4","#3b82f6","#84cc16"];
            const color = TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];
            return createTag({ name, color });
          }}
          onTogglePin={handleTogglePin}
          onTrash={handleTrash}
          onRestore={handleRestore}
          onDeletePermanent={handleDeletePermanent}
          availableNotes={allNotes.map((n) => ({ id: n.id, title: n.title }))}
          onNavigateToNote={handleSelectNote}
          onCreateAndNavigate={async (title) => {
            const note = await createNote({ title, notebookId: selectedNotebook ?? undefined });
            if (note) handleSelectNote(note.id);
          }}
        />
      </div>

    </div>
  );
}

// ── Import helpers ──────────────────────────────────────────────────────────

/**
 * Merges two lists of tag names, deduplicating case-insensitively.
 * The first occurrence (from `a` then `b`) wins for casing.
 */
function mergeTagNames(a: string[], b: string[]): string[] {
  const seen = new Map<string, string>(); // lowercase → original
  for (const name of [...a, ...b]) {
    const key = name.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, name.trim());
  }
  return Array.from(seen.values());
}

// Helpers
function buildFilter(
  view: ViewType,
  notebookId: string | null,
  tagName: string | null,
  status: NoteStatus | null,
) {
  if (view === "trash")  return { trashed: "true" };
  if (view === "pinned") return { pinned: "true" };
  if (view === "notebook" && notebookId) return { notebookId };
  if (view === "tag"    && tagName) return { tag: tagName };
  if (view === "status" && status)  return { status };
  return {};
}

function buildTree(notebooks: Parameters<typeof Sidebar>[0]["notebooks"]) {
  const map = new Map<string, (typeof notebooks)[number]>();
  const roots: (typeof notebooks)[number][] = [];

  notebooks.forEach((nb) => {
    map.set(nb.id, { ...nb, children: [] });
  });

  notebooks.forEach((nb) => {
    const node = map.get(nb.id)!;
    if (nb.parentId && map.has(nb.parentId)) {
      map.get(nb.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function getContextLabel(
  view: ViewType,
  notebookId: string | null,
  tagName: string | null,
  status: NoteStatus | null,
  notebooks: { id: string; name: string }[]
): string {
  if (view === "trash")  return "Papelera";
  if (view === "pinned") return "Notas fijadas";
  if (view === "notebook" && notebookId) {
    return notebooks.find((n) => n.id === notebookId)?.name ?? "Notebook";
  }
  if (view === "tag"    && tagName) return `#${tagName}`;
  if (view === "status" && status) {
    const meta = STATUS_META_MAP[status];
    return `${meta.icon}  ${meta.label}`;
  }
  return "Todas las notas";
}
