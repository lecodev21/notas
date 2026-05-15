"use client";

import { useEffect, useRef, useState } from "react";
import { markdownToPlainText } from "@/lib/markdownToPlainText";
import { LuCheck, LuClipboard, LuFileText } from "react-icons/lu";

interface CopyContextMenuProps {
  /** Full Markdown body — used when there is no active selection */
  body: string;
  /** Text already selected by the user; if non-empty, copies only this fragment */
  selectedText?: string;
  coords: { x: number; y: number };
  onClose: () => void;
}

export function CopyContextMenu({
  body,
  selectedText,
  coords,
  onClose,
}: CopyContextMenuProps) {
  const ref   = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  // Close on any click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const textToCopy = selectedText?.trim() || body;

  async function copyAs(format: "markdown" | "plain") {
    const content =
      format === "plain" ? markdownToPlainText(textToCopy) : textToCopy;
    try {
      await navigator.clipboard.writeText(content);
      setDone(true);
      setTimeout(onClose, 900);
    } catch {
      // Fallback for browsers that block clipboard API without user gesture
      const ta = document.createElement("textarea");
      ta.value = content;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setDone(true);
      setTimeout(onClose, 900);
    }
  }

  // Nudge the menu so it never overflows the viewport
  const menuW = 204;
  const menuH = done ? 38 : 84;
  const left  = Math.min(coords.x, window.innerWidth  - menuW - 8);
  const top   = coords.y + menuH > window.innerHeight
    ? coords.y - menuH
    : coords.y;

  const baseStyle: React.CSSProperties = {
    position:        "fixed",
    zIndex:          9999,
    top,
    left,
    borderRadius:    "10px",
    boxShadow:       "0 8px 28px rgba(0,0,0,0.3)",
    backgroundColor: "var(--app-bg-menu)",
    border:          "1px solid var(--app-border-strong)",
  };

  if (done) {
    return (
      <div ref={ref} style={{ ...baseStyle, padding: "8px 14px" }}>
        <span className="flex items-center gap-2 text-xs">
          <LuCheck className="w-3.5 h-3.5 text-green-400" />
          <span style={{ color: "var(--app-text-secondary)" }}>Copiado</span>
        </span>
      </div>
    );
  }

  const ITEMS = [
    { label: "Copiar como Markdown", icon: <LuClipboard className="w-3.5 h-3.5" />, format: "markdown" as const },
    { label: "Copiar como texto",    icon: <LuFileText  className="w-3.5 h-3.5" />, format: "plain"    as const },
  ];

  return (
    <div ref={ref} style={{ ...baseStyle, padding: "4px", minWidth: menuW }}>
      {ITEMS.map(({ label, icon, format }) => (
        <button
          key={format}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-xs transition-colors"
          style={{ color: "var(--app-text-secondary)" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "")
          }
          onClick={() => copyAs(format)}
        >
          <span>{icon}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
