"use client";

import { MarkdownPreview } from "@/components/editor/MarkdownPreview";
import { useTheme } from "@/lib/theme";

interface ShareNoteViewProps {
  title: string;
  body: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export function ShareNoteView({ title, body, createdAt, updatedAt }: ShareNoteViewProps) {
  const { theme, toggleTheme } = useTheme();

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("es", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div
      className="min-h-screen theme-transition"
      style={{ backgroundColor: "var(--app-bg-editor)", color: "var(--app-text-primary)" }}
    >
      {/* Top bar */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 theme-transition"
        style={{
          backgroundColor: "var(--app-bg-sidebar)",
          borderBottom: "1px solid var(--app-border)",
        }}
      >
        <span className="text-sm font-semibold tracking-wide" style={{ color: "#6366f1" }}>
          ✏️ Inkdrop
        </span>

        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            Nota compartida · solo lectura
          </span>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--app-text-muted)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
            }
          >
            {theme === "dark" ? (
              /* Sun icon */
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto" style={{ maxWidth: 780 }}>
        {/* Title */}
        <div className="px-6 pt-8 pb-4">
          <h1
            className="text-2xl font-semibold leading-tight mb-4"
            style={{ color: "var(--app-text-primary)" }}
          >
            {title}
          </h1>

          {/* Dates info box */}
          <div
            className="rounded-lg px-4 py-3 flex flex-col gap-1.5 text-xs theme-transition"
            style={{
              backgroundColor: "var(--app-bg-input)",
              border: "1px solid var(--app-border)",
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--app-text-muted)" }}>📅 Creada el</span>
              <span style={{ color: "var(--app-text-secondary)" }}>{fmt(createdAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--app-text-muted)" }}>✏️ Modificada el</span>
              <span style={{ color: "var(--app-text-secondary)" }}>{fmt(updatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Markdown — same MarkdownPreview used in the editor */}
        <MarkdownPreview content={body} />
      </main>

      {/* Footer */}
      <footer
        className="text-center py-8 text-xs"
        style={{ color: "var(--app-text-faint)" }}
      >
        Creado con ✏️ Inkdrop
      </footer>
    </div>
  );
}
