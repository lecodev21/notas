"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useGraph } from "@/hooks/useGraph";
import { Spinner } from "@/components/ui/Spinner";

const NoteGraph = dynamic(
  () => import("@/components/graph/NoteGraph").then((m) => ({ default: m.NoteGraph })),
  { ssr: false }
);

export default function GraphPage() {
  const router = useRouter();
  const { nodes, edges, loading } = useGraph();

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "var(--app-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--app-border)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.push("/notes")}
          style={{
            color: "var(--app-text-secondary)",
            fontSize: "0.75rem",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Volver
        </button>
        <span
          style={{
            color: "var(--app-text-primary)",
            fontWeight: 600,
            fontSize: "0.875rem",
          }}
        >
          🕸 Grafo de notas
        </span>
        <span style={{ color: "var(--app-text-muted)", fontSize: "0.75rem" }}>
          {nodes.length} {nodes.length === 1 ? "nota" : "notas"} · {edges.length}{" "}
          {edges.length === 1 ? "conexión" : "conexiones"}
        </span>
      </div>

      {/* Graph area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <Spinner />
          </div>
        ) : (
          <NoteGraph
            nodes={nodes}
            edges={edges}
            onSelectNote={(id) => router.push(`/notes/${id}`)}
          />
        )}
      </div>
    </div>
  );
}
