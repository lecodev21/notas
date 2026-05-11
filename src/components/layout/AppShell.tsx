"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { NoteList } from "./NoteList";
import { EditorPanel } from "./EditorPanel";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/hooks/useNotes";
import { useNotebooks, useCreateNotebook, useUpdateNotebook, useDeleteNotebook } from "@/hooks/useNotebooks";
import { useTags, useCreateTag, useDeleteTag } from "@/hooks/useTags";
import { useSearch } from "@/hooks/useSearch";

type ViewType = "all" | "pinned" | "trash" | "notebook" | "tag";

interface AppShellProps {
  initialNoteId?: string;
}

export function AppShell({ initialNoteId }: AppShellProps) {
  const router = useRouter();

  // State
  const [view, setView] = useState<ViewType>("all");
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialNoteId ?? null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [focusMode, setFocusMode] = useState(false);

  // Modals
  const [notebookModalOpen, setNotebookModalOpen] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");

  // Data hooks
  const notesFilter = buildFilter(view, selectedNotebook, selectedTag);
  const { notes, loading: notesLoading } = useNotes(notesFilter);
  const { notes: searchResults, loading: searchLoading } = useSearch(searchQuery);
  const { note: selectedNote, loading: noteLoading } = useNotes({ id: selectedNoteId });
  const { notebooks } = useNotebooks();
  const { tags } = useTags();

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
      router.push(`/notes/${note.id}`);
    }
  }

  async function handleUpdate(id: string, data: { title?: string; body?: string; tagIds?: string[] }) {
    await updateNote(id, data);
  }

  function handleSelectNote(id: string) {
    setSelectedNoteId(id);
    router.push(`/notes/${id}`);
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

  async function handleCreateNotebook() {
    if (!newNotebookName.trim()) return;
    await createNotebook({ name: newNotebookName.trim() });
    setNewNotebookName("");
    setNotebookModalOpen(false);
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    await createTag({ name: newTagName.trim(), color: newTagColor });
    setNewTagName("");
    setTagModalOpen(false);
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

  async function handleDeleteTag(id: string) {
    await deleteTag(id);
    const tag = tags.find((t) => t.id === id);
    if (tag && selectedTag === tag.name) {
      setView("all");
      setSelectedTag(null);
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
            onNewNotebook={() => setNotebookModalOpen(true)}
            onNewTag={() => setTagModalOpen(true)}
            onRenameNotebook={handleRenameNotebook}
            onDeleteNotebook={handleDeleteNotebook}
            onDeleteTag={handleDeleteTag}
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
          onTogglePin={handleTogglePin}
          onTrash={handleTrash}
          onRestore={handleRestore}
          onDeletePermanent={handleDeletePermanent}
        />
      </div>

      {/* New Notebook Modal */}
      <Modal
        open={notebookModalOpen}
        onClose={() => setNotebookModalOpen(false)}
        title="Nuevo notebook"
      >
        <div className="space-y-3">
          <Input
            placeholder="Nombre del notebook"
            value={newNotebookName}
            onChange={(e) => setNewNotebookName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreateNotebook()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNotebookModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCreateNotebook}>
              Crear
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Tag Modal */}
      <Modal
        open={tagModalOpen}
        onClose={() => setTagModalOpen(false)}
        title="Nuevo tag"
      >
        <div className="space-y-3">
          <Input
            placeholder="Nombre del tag"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Color:</label>
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTagModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCreateTag}>
              Crear
            </Button>
          </div>
        </div>
      </Modal>
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
