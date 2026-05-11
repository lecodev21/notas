"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { Tag } from "@/generated/prisma/client";

type TagWithCount = Tag & { _count: { noteTags: number } };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error fetching");
    return r.json();
  });

export function useTags() {
  const { data, error, isLoading } = useSWR<{ tags: TagWithCount[] }>(
    "/api/tags",
    fetcher
  );
  return {
    tags: data?.tags ?? [],
    loading: isLoading,
    error,
  };
}

export function useCreateTag() {
  async function createTag(data: { name: string; color?: string }) {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const { tag } = await res.json();
    await globalMutate("/api/tags");
    return tag as Tag;
  }

  return { createTag };
}

export function useUpdateTag() {
  async function updateTag(id: string, data: { name?: string; color?: string }) {
    const res = await fetch(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const { tag } = await res.json();
    await globalMutate("/api/tags");
    return tag as Tag;
  }

  return { updateTag };
}

export function useDeleteTag() {
  async function deleteTag(id: string) {
    const res = await fetch(`/api/tags/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    await globalMutate("/api/tags");
    await globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/notes"));
    return true;
  }

  return { deleteTag };
}
