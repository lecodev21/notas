"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { Notebook } from "@/generated/prisma/client";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error fetching");
    return r.json();
  });

export function useNotebooks() {
  const { data, error, isLoading } = useSWR<{ notebooks: Notebook[] }>(
    "/api/notebooks",
    fetcher
  );
  return {
    notebooks: data?.notebooks ?? [],
    loading: isLoading,
    error,
  };
}

export function useCreateNotebook() {
  async function createNotebook(data: { name: string; parentId?: string | null }) {
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const { notebook } = await res.json();
    await globalMutate("/api/notebooks");
    return notebook as Notebook;
  }

  return { createNotebook };
}

export function useUpdateNotebook() {
  async function updateNotebook(id: string, data: { name?: string; parentId?: string | null }) {
    const res = await fetch(`/api/notebooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const { notebook } = await res.json();
    await globalMutate("/api/notebooks");
    return notebook as Notebook;
  }

  return { updateNotebook };
}

export function useDeleteNotebook() {
  async function deleteNotebook(id: string) {
    const res = await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    await globalMutate("/api/notebooks");
    // Also revalidate notes since some may have lost their notebook
    await globalMutate((key: string) => typeof key === "string" && key.startsWith("/api/notes"));
    return true;
  }

  return { deleteNotebook };
}
