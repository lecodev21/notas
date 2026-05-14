"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";
import type { NoteStatus } from "@/lib/noteStatus";

type NoteWithRelations = Note & {
  noteTags: (NoteTag & { tag: Tag })[];
  notebook?: { id: string; name: string } | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error fetching");
    return r.json();
  });

interface NotesFilter {
  notebookId?: string;
  tag?: string;
  pinned?: string;
  trashed?: string;
  status?: NoteStatus;
  id?: string | null;
  /** Skip the DEFAULT_VISIBLE_STATUSES filter — returns all non-trashed notes */
  allStatuses?: boolean;
}

export function useNotes(filter: NotesFilter = {}) {
  // If an id is provided, fetch single note
  if (filter.id) {
    const { data, error, isLoading } = useSWR<{ note: NoteWithRelations }>(
      `/api/notes/${filter.id}`,
      fetcher
    );
    return {
      notes: [] as NoteWithRelations[],
      note: data?.note ?? null,
      loading: isLoading,
      error,
    };
  }

  const params = new URLSearchParams();
  if (filter.notebookId) params.set("notebookId", filter.notebookId);
  if (filter.tag) params.set("tag", filter.tag);
  if (filter.pinned) params.set("pinned", filter.pinned);
  if (filter.trashed) params.set("trashed", filter.trashed);
  if (filter.status) params.set("status", filter.status);
  if (filter.allStatuses) params.set("allStatuses", "true");

  const key = `/api/notes?${params.toString()}`;
  const { data, error, isLoading } = useSWR<{ notes: NoteWithRelations[] }>(
    key,
    fetcher
  );

  return {
    notes: data?.notes ?? [],
    note: null as NoteWithRelations | null,
    loading: isLoading,
    error,
    mutate: () => globalMutate(key),
  };
}

export function useCreateNote() {
  async function createNote(data: {
    title?: string;
    body?: string;
    notebookId?: string;
    tagIds?: string[];
  }) {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const { note } = await res.json();
    // Revalidate all note lists
    await globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/notes"));
    return note as NoteWithRelations;
  }

  return { createNote };
}

export function useStatusCounts() {
  const { data, isLoading, mutate } = useSWR<{ counts: Record<string, number> }>(
    "/api/status-counts",
    fetcher
  );
  return {
    counts: data?.counts ?? { active: 0, on_hold: 0, completed: 0, dropped: 0 },
    loading: isLoading,
    mutate,
  };
}

export function useUpdateNote() {
  async function updateNote(
    id: string,
    data: Partial<Pick<Note, "title" | "body" | "isPinned" | "isTrashed" | "notebookId" | "status">> & {
      tagIds?: string[];
    }
  ) {
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const { note } = await res.json();

    // Update the single-note cache without re-fetching.
    await globalMutate(`/api/notes/${id}`, { note }, { revalidate: false });

    const isVisibilityChange = "isTrashed" in data || "isPinned" in data;

    if (isVisibilityChange) {
      // Trash/restore/pin changes affect which lists a note appears in.
      // Revalidate notes lists, notebooks (counts), and status counts sidebar.
      await Promise.all([
        globalMutate(
          (key: unknown) => typeof key === "string" && key.startsWith("/api/notes?"),
          undefined,
          { revalidate: true }
        ),
        globalMutate("/api/notebooks"),
        globalMutate("/api/status-counts"),
        globalMutate("/api/tags"),
      ]);
    } else {
      await globalMutate(
        (key: unknown) => typeof key === "string" && key.startsWith("/api/notes?"),
        (current: { notes: NoteWithRelations[] } | undefined) => {
          if (!current) return current;
          // notebookId change: remove from current list (note moved elsewhere)
          if ("notebookId" in data) {
            return { notes: current.notes.filter((n) => n.id !== id) };
          }
          // Title / body / tag / status: patch in-place, no flicker
          return { notes: current.notes.map((n) => (n.id === id ? note : n)) };
        },
        { revalidate: false }
      );
      if ("notebookId" in data) {
        // Notebook counts need to reflect the move immediately
        globalMutate("/api/notebooks");
      }
      if ("status" in data) {
        globalMutate("/api/status-counts");
      }
    }

    return note as NoteWithRelations;
  }

  return { updateNote };
}

export function useDeleteNote() {
  async function deleteNote(id: string) {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    await Promise.all([
      globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/notes")),
      globalMutate("/api/notebooks"),
      globalMutate("/api/status-counts"),
    ]);
    return true;
  }

  return { deleteNote };
}

type BulkAction =
  | { action: "trash" }
  | { action: "move";   notebookId: string | null }
  | { action: "tag";    tagId: string; mode: "add" | "remove" }
  | { action: "status"; status: NoteStatus };

export function useBulkNotes() {
  async function bulkUpdate(ids: string[], op: BulkAction): Promise<boolean> {
    const res = await fetch("/api/notes/bulk", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ids, ...op }),
    });
    if (!res.ok) return false;

    // Revalidate all note lists + sidebar counts
    await Promise.all([
      globalMutate(
        (key: unknown) => typeof key === "string" && key.startsWith("/api/notes?"),
        undefined,
        { revalidate: true },
      ),
      globalMutate("/api/notebooks"),
      globalMutate("/api/status-counts"),
      globalMutate("/api/tags"),
    ]);
    return true;
  }

  return { bulkUpdate };
}

export function useEmptyTrash() {
  async function emptyTrash() {
    const res = await fetch("/api/trash", { method: "DELETE" });
    if (!res.ok) return false;
    await Promise.all([
      globalMutate(
        (key: unknown) => typeof key === "string" && key.includes("trashed=true"),
        undefined,
        { revalidate: true },
      ),
      globalMutate("/api/notebooks"),
      globalMutate("/api/status-counts"),
      globalMutate("/api/tags"),
    ]);
    return true;
  }

  return { emptyTrash };
}
