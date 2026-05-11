"use client";

import useSWR from "swr";

interface SearchResult {
  id: string;
  title: string;
  body: string;
  excerpt: string;
  updatedAt: string;
  notebookId: string | null;
  notebook?: { id: string; name: string } | null;
  noteTags?: never[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error searching");
    return r.json();
  });

export function useSearch(query: string) {
  const trimmed = query.trim();
  const key = trimmed ? `/api/search?q=${encodeURIComponent(trimmed)}` : null;

  const { data, isLoading, error } = useSWR<{ results: SearchResult[] }>(
    key,
    fetcher
  );

  // Map search results to match NoteWithRelations shape for NoteList
  const notes = (data?.results ?? []).map((r) => ({
    ...r,
    updatedAt: new Date(r.updatedAt),
    isPinned: false,
    isTrashed: false,
    userId: "",
    createdAt: new Date(r.updatedAt),
    noteTags: [],
  }));

  return { notes, loading: isLoading, error };
}
