"use client";

import { useState, useRef } from "react";
import type { OutlineItem } from "@/lib/outline";

interface OutlineViewProps {
  headings: OutlineItem[];
  activeId: string | null;
  onClickHeading: (item: OutlineItem) => void;
  onWheel?: (e: React.WheelEvent) => void;
}

// Bar width in px per heading level (deeper = wider, reads as visual indentation)
const BAR_W: Record<number, number> = { 1: 6, 2: 12, 3: 18, 4: 22, 5: 24, 6: 24 };

export function OutlineView({ headings, activeId, onClickHeading, onWheel }: OutlineViewProps) {
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHovered(true);
  }
  function handleMouseLeave() {
    hideTimer.current = setTimeout(() => setHovered(false), 120);
  }

  if (headings.length === 0) return null;

  return (
    // Outer shell — full height, pointer-events none; only used for positioning
    <div
      className="absolute top-0 h-full z-20"
      style={{ right: 16, width: 28, pointerEvents: "none" }}
    >
      {/*
       * Inner shell — sized exactly to the bars content, centered vertically.
       * pointer-events are enabled here so the hover zone matches exactly
       * the visible bars (no invisible dead zones above/below).
       */}
      <div
        className="absolute left-0 right-0"
        style={{ top: "50%", transform: "translateY(-50%)", pointerEvents: "auto" }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onWheel={onWheel}
      >
        {/* ── Hover panel — sibling of bars, positioned to the left ─────────── */}
        {hovered && (
          <div
            className="absolute rounded-lg py-1.5 shadow-2xl"
            style={{
              right: "calc(100% + 6px)",
              top: "50%",
              transform: "translateY(-50%)",
              backgroundColor: "var(--app-bg-surface)",
              border: "1px solid var(--app-border-strong)",
              minWidth: 200,
              maxWidth: 260,
            }}
          >
            {headings.map((h) => {
              const isActive = h.id === activeId;
              return (
                <button
                  key={h.id + h.lineIndex}
                  onClick={() => onClickHeading(h)}
                  className="w-full flex items-center gap-1.5 text-left text-xs transition-colors"
                  style={{
                    paddingTop: 4,
                    paddingBottom: 4,
                    paddingLeft: 10 + (h.level - 1) * 10,
                    paddingRight: 12,
                    color: isActive ? "#818cf8" : "var(--app-text-secondary)",
                    backgroundColor: isActive ? "rgba(99,102,241,0.1)" : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        "var(--app-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      isActive ? "rgba(99,102,241,0.1)" : "";
                  }}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 5,
                      height: 5,
                      backgroundColor: isActive ? "#818cf8" : "transparent",
                    }}
                  />
                  <span className="truncate">{h.text}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Bars ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-1.5 px-1">
          {headings.map((h) => {
            const isActive = h.id === activeId;
            return (
              <div
                key={h.id + h.lineIndex}
                onClick={() => onClickHeading(h)}
                title={h.text}
                style={{
                  width: BAR_W[h.level] ?? 6,
                  height: 4,
                  borderRadius: 2,
                  flexShrink: 0,
                  cursor: "pointer",
                  transition: "background-color 0.15s",
                  backgroundColor: isActive
                    ? "#6366f1"
                    : hovered
                    ? "var(--app-text-primary)"
                    : "var(--app-text-secondary)",
                  opacity: isActive ? 1 : hovered ? 0.7 : 0.45,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
