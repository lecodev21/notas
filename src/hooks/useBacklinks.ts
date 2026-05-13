"use client";

import useSWR from "swr";

export interface BacklinkNote {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error fetching backlinks");
    return r.json();
  });

export function useBacklinks(noteId: string | null, _noteTitle: string | null) {
  const { data, isLoading } = useSWR<{ backlinks: BacklinkNote[] }>(
    noteId ? `/api/notes/${noteId}/backlinks` : null,
    fetcher
  );

  return {
    backlinks: data?.backlinks ?? [],
    loading: isLoading,
  };
}
