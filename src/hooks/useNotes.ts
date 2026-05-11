"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { Note, NoteTag, Tag } from "@/generated/prisma/client";

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
  id?: string | null;
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

export function useUpdateNote() {
  async function updateNote(
    id: string,
    data: Partial<Pick<Note, "title" | "body" | "isPinned" | "isTrashed" | "notebookId">> & {
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
      // Trash/restore/pin changes the note's membership in filtered lists
      // (e.g. a trashed note must disappear from the normal list).
      // Revalidate so each list reflects the new state correctly.
      await globalMutate(
        (key: unknown) => typeof key === "string" && key.startsWith("/api/notes?"),
        undefined,
        { revalidate: true }
      );
    } else {
      // Title/body/tag changes — patch in-place so the list never flickers.
      await globalMutate(
        (key: unknown) => typeof key === "string" && key.startsWith("/api/notes?"),
        (current: { notes: NoteWithRelations[] } | undefined) => {
          if (!current) return current;
          return { notes: current.notes.map((n) => (n.id === id ? note : n)) };
        },
        { revalidate: false }
      );
    }

    return note as NoteWithRelations;
  }

  return { updateNote };
}

export function useDeleteNote() {
  async function deleteNote(id: string) {
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    await globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/notes"));
    return true;
  }

  return { deleteNote };
}
