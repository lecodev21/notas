"use client";

/**
 * FindReplaceBar
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating find-and-replace panel that appears over the CodeMirror editor.
 * It communicates with the editor exclusively through editorViewRef — no
 * CodeMirror state is kept in React; only display values (index / total).
 *
 * Keyboard shortcuts (when focus is anywhere inside the bar):
 *   Enter        → next match
 *   Shift+Enter  → previous match
 *   Escape       → close
 */

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { EditorView } from "@codemirror/view";
import { setFindTerm } from "./findReplaceExtension";

interface FindReplaceBarProps {
  viewRef: MutableRefObject<EditorView | null>;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns all [from, to) match positions in the current document. */
function getAllMatches(
  view: EditorView,
  term: string,
): Array<{ from: number; to: number }> {
  if (!term.trim()) return [];
  const text = view.state.doc.toString();
  const re   = new RegExp(escapeRegex(term), "gi");
  return [...text.matchAll(re)].map((m) => ({
    from: m.index!,
    to:   m.index! + m[0].length,
  }));
}

/** Selects a match and scrolls it into the center of the visible area. */
function selectMatch(view: EditorView, match: { from: number; to: number }) {
  view.dispatch({
    selection: { anchor: match.from, head: match.to },
    effects:   EditorView.scrollIntoView(match.from, { y: "center" }),
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FindReplaceBar({ viewRef, onClose }: FindReplaceBarProps) {
  const [searchTerm,  setSearchTermState]  = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  // 1-based current match index; 0 = no active match
  const [matchIdx, setMatchIdx] = useState(0);
  const [total,    setTotal]    = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search field on open; clear highlights + restore editor focus on close
  useEffect(() => {
    searchInputRef.current?.focus();
    return () => {
      const v = viewRef.current;
      if (!v) return;
      v.dispatch({ effects: setFindTerm.of("") });
      v.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core search logic ──────────────────────────────────────────────────────
  /** Update highlight decorations and jump to the first match. */
  function applySearch(term: string) {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({ effects: setFindTerm.of(term) });
    const matches = getAllMatches(v, term);
    setTotal(matches.length);
    if (matches.length > 0) {
      setMatchIdx(1);
      selectMatch(v, matches[0]);
    } else {
      setMatchIdx(0);
    }
  }

  /** Navigate ±1 through the match list (wraps around). */
  function navigate(dir: 1 | -1) {
    const v = viewRef.current;
    if (!v || total === 0) return;
    const matches = getAllMatches(v, searchTerm);
    if (!matches.length) return;
    const next = (matchIdx - 1 + dir + matches.length) % matches.length;
    setMatchIdx(next + 1);
    selectMatch(v, matches[next]);
  }

  /** Replace the currently selected match and advance to the next one. */
  function handleReplaceOne() {
    const v = viewRef.current;
    if (!v || !searchTerm || matchIdx === 0) return;
    const matches = getAllMatches(v, searchTerm);
    if (!matches.length) return;
    const target = matches[(matchIdx - 1 + matches.length) % matches.length];
    v.dispatch({ changes: { from: target.from, to: target.to, insert: replaceTerm } });
    // Recompute on the updated doc
    const newMatches = getAllMatches(v, searchTerm);
    setTotal(newMatches.length);
    if (newMatches.length > 0) {
      const nextIdx = Math.min(matchIdx - 1, newMatches.length - 1);
      setMatchIdx(nextIdx + 1);
      selectMatch(v, newMatches[nextIdx]);
    } else {
      setMatchIdx(0);
    }
  }

  /** Replace every match in a single transaction (in reverse order so positions
   *  don't shift for earlier occurrences while iterating). */
  function handleReplaceAll() {
    const v = viewRef.current;
    if (!v || !searchTerm) return;
    const matches = getAllMatches(v, searchTerm);
    if (!matches.length) return;
    // Reverse so we replace from end → start, keeping earlier offsets stable
    const changes = matches
      .slice()
      .reverse()
      .map((m) => ({ from: m.from, to: m.to, insert: replaceTerm }));
    v.dispatch({ changes });
    v.dispatch({ effects: setFindTerm.of(searchTerm) }); // keep highlights off (doc changed)
    setTotal(0);
    setMatchIdx(0);
  }

  // ── Keyboard handling ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape")              { e.preventDefault(); onClose(); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); navigate(1);  return; }
    if (e.key === "Enter" &&  e.shiftKey) { e.preventDefault(); navigate(-1); return; }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const noMatch   = searchTerm.length > 0 && total === 0;
  const countText = searchTerm ? (total === 0 ? "0/0" : `${matchIdx}/${total}`) : "";

  // ── Shared button style helpers ────────────────────────────────────────────
  const iconBtn = (disabled = false) => ({
    color: disabled ? "var(--app-text-faint)" : "var(--app-text-secondary)",
    cursor: disabled ? "default" : "pointer",
  } as React.CSSProperties);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="absolute top-2 right-2 z-20 rounded-lg shadow-2xl select-none"
      style={{
        width:           390,
        backgroundColor: "var(--app-bg-surface)",
        border:          "1px solid var(--app-border-strong)",
        boxShadow:       "0 8px 32px rgba(0,0,0,0.28)",
      }}
      // Prevent keystrokes inside the bar from reaching CodeMirror or AppShell
      onKeyDown={(e) => {
        e.stopPropagation();
        handleKeyDown(e);
      }}
    >
      {/* ── Row 1: Search ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
        {/* Search icon (decorative) */}
        <span className="shrink-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          🔍
        </span>

        {/* Search input */}
        <input
          ref={searchInputRef}
          value={searchTerm}
          onChange={(e) => {
            setSearchTermState(e.target.value);
            applySearch(e.target.value);
          }}
          placeholder="Buscar en nota..."
          spellCheck={false}
          className="flex-1 text-xs px-2 py-1 rounded outline-none min-w-0"
          style={{
            backgroundColor: "var(--app-bg-input)",
            color:  noMatch ? "#ef4444" : "var(--app-text-primary)",
            border: `1px solid ${noMatch ? "rgba(239,68,68,0.6)" : "var(--app-border)"}`,
            transition: "border-color 150ms",
          }}
        />

        {/* ↑ Prev */}
        <NavButton
          title="Anterior (Shift+Enter)"
          disabled={total === 0}
          onClick={() => navigate(-1)}
        >
          ↑
        </NavButton>

        {/* ↓ Next */}
        <NavButton
          title="Siguiente (Enter)"
          disabled={total === 0}
          onClick={() => navigate(1)}
        >
          ↓
        </NavButton>

        {/* Counter */}
        <span
          className="text-[10px] tabular-nums shrink-0 text-center"
          style={{ color: "var(--app-text-muted)", minWidth: "2.5rem" }}
        >
          {countText}
        </span>

        {/* ✕ Close */}
        <NavButton title="Cerrar (Esc)" onClick={onClose}>
          ✕
        </NavButton>
      </div>

      {/* ── Row 2: Replace ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-2.5 pb-2">
        {/* Invisible spacer to align with search icon */}
        <span className="shrink-0 text-xs" style={{ visibility: "hidden" }}>🔍</span>

        {/* Replace input */}
        <input
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          placeholder="Reemplazar con..."
          spellCheck={false}
          className="flex-1 text-xs px-2 py-1 rounded outline-none min-w-0"
          style={{
            backgroundColor: "var(--app-bg-input)",
            color:  "var(--app-text-primary)",
            border: "1px solid var(--app-border)",
          }}
        />

        {/* Replace current */}
        <ActionButton
          disabled={total === 0 || matchIdx === 0}
          onClick={handleReplaceOne}
          title="Reemplazar este"
        >
          Este
        </ActionButton>

        {/* Replace all */}
        <ActionButton
          disabled={total === 0}
          onClick={handleReplaceAll}
          title="Reemplazar todos"
        >
          Todos
        </ActionButton>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NavButton({
  children,
  title,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-6 h-6 flex items-center justify-center rounded text-xs transition-colors shrink-0"
      style={{ color: disabled ? "var(--app-text-faint)" : "var(--app-text-secondary)" }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
      }}
    >
      {children}
    </button>
  );
}

function ActionButton({
  children,
  title,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-[10px] px-2.5 py-1 rounded transition-colors disabled:opacity-35 shrink-0"
      style={{
        backgroundColor: "var(--app-hover)",
        color:  "var(--app-text-secondary)",
        border: "1px solid var(--app-border)",
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover-strong)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
      }}
    >
      {children}
    </button>
  );
}
