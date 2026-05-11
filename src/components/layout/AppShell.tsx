"use client";

import { useState, useEffect } from "react";

import { Sidebar } from "./Sidebar";
import { NoteList } from "./NoteList";
import { EditorPanel } from "./EditorPanel";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/hooks/useNotes";
import { useNotebooks, useCreateNotebook, useUpdateNotebook, useDeleteNotebook } from "@/hooks/useNotebooks";
import { useTags, useCreateTag, useDeleteTag } from "@/hooks/useTags";
import { useSearch } from "@/hooks/useSearch";


type ViewType = "all" | "pinned" | "trash" | "notebook" | "tag";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);


  // Data hooks
  const notesFilter = buildFilter(view, selectedNotebook, selectedTag);
  const { notes, loading: notesLoading } = useNotes(notesFilter);
  const { notes: searchResults, loading: searchLoading } = useSearch(searchQuery);
  const { note: selectedNote, loading: noteLoading } = useNotes({ id: selectedNoteId });
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
  const contextLabel = getContextLabel(view, selectedNotebook, selectedTag, notebooks);

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

  async function handleUpdate(id: string, data: { title?: string; body?: string; tagIds?: string[] }) {
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
    setSelectedNoteId(null);
    setSearchQuery("");
  }

  function handleSelectNotebook(id: string) {
    setView("notebook");
    setSelectedNotebook(id);
    setSelectedTag(null);
    setSelectedNoteId(null);
    setSearchQuery("");
  }

  function handleSelectTag(name: string) {
    setView("tag");
    setSelectedTag(name);
    setSelectedNotebook(null);
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
            view={view}
            onSelectView={handleSelectView}
            onSelectNotebook={handleSelectNotebook}
            onSelectTag={handleSelectTag}
            onNewNotebook={(name) => createNotebook({ name })}
            onNewSubNotebook={handleNewSubNotebook}
            onRenameNotebook={handleRenameNotebook}
            onDeleteNotebook={handleDeleteNotebook}
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
            contextLabel={searchQuery ? `Resultados: "${searchQuery}"` : contextLabel}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onSearch={setSearchQuery}
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
        />
      </div>

    </div>
  );
}

// Helpers
function buildFilter(
  view: ViewType,
  notebookId: string | null,
  tagName: string | null
) {
  if (view === "trash") return { trashed: "true" };
  if (view === "pinned") return { pinned: "true" };
  if (view === "notebook" && notebookId) return { notebookId };
  if (view === "tag" && tagName) return { tag: tagName };
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
  notebooks: { id: string; name: string }[]
): string {
  if (view === "trash") return "Papelera";
  if (view === "pinned") return "Notas fijadas";
  if (view === "notebook" && notebookId) {
    return notebooks.find((n) => n.id === notebookId)?.name ?? "Notebook";
  }
  if (view === "tag" && tagName) return `#${tagName}`;
  return "Todas las notas";
}
