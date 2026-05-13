"use client";

import useSWR from "swr";

export interface GraphNode {
  id: string;
  title: string;
  linkCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error fetching graph");
    return r.json();
  });

export function useGraph() {
  const { data, isLoading } = useSWR<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    "/api/graph",
    fetcher
  );

  return {
    nodes: data?.nodes ?? [],
    edges: data?.edges ?? [],
    loading: isLoading,
  };
}
