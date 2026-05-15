"use client";

import React, { type MutableRefObject, useRef, useState } from "react";
import { type EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  LuBold, LuBraces, LuCode, LuHeading1, LuHeading2, LuHeading3,
  LuImage, LuItalic, LuLink, LuList, LuListChecks, LuListOrdered,
  LuMinus, LuQuote, LuStrikethrough, LuTable,
} from "react-icons/lu";

// ── Editor commands ───────────────────────────────────────────────────────
// All commands use onMouseDown + e.preventDefault() so the editor never
// loses focus when a toolbar button is clicked.

/** Wrap the selection (or a placeholder) with before/after markers. */
function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string
) {
  view.dispatch(
    view.state.changeByRange((range) => {
      if (range.empty) {
        const insert = before + placeholder + after;
        return {
          changes: { from: range.from, insert },
          range: EditorSelection.range(
            range.from + before.length,
            range.from + before.length + placeholder.length
          ),
        };
      }
      const text = view.state.sliceDoc(range.from, range.to);
      return {
        changes: { from: range.from, to: range.to, insert: before + text + after },
        range: EditorSelection.range(
          range.from + before.length,
          range.from + before.length + text.length
        ),
      };
    })
  );
  view.focus();
}

/**
 * Add a prefix at the start of the current line.
 * If the line already starts with that exact prefix, remove it (toggle).
 * If it starts with a *different* heading prefix (# ## ###), replace it.
 */
function toggleLinePrefix(view: EditorView, prefix: string) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const line = view.state.doc.lineAt(range.from);

      // Same prefix → remove
      if (line.text.startsWith(prefix)) {
        return {
          changes: { from: line.from, to: line.from + prefix.length, insert: "" },
          range: EditorSelection.cursor(
            Math.max(line.from, range.from - prefix.length)
          ),
        };
      }

      // Different heading prefix → replace
      const headingMatch = line.text.match(/^(#{1,6} )/);
      if (headingMatch && prefix.match(/^#{1,6} $/)) {
        const old = headingMatch[1];
        return {
          changes: { from: line.from, to: line.from + old.length, insert: prefix },
          range: EditorSelection.cursor(
            range.from - old.length + prefix.length
          ),
        };
      }

      // No prefix → add
      return {
        changes: { from: line.from, insert: prefix },
        range: EditorSelection.cursor(range.from + prefix.length),
      };
    })
  );
  view.focus();
}

/**
 * Insert a block template after the current line (or on it if empty).
 * `cursorDelta` moves the cursor relative to the start of the inserted block.
 */
function insertBlock(
  view: EditorView,
  template: string,
  cursorDelta = template.length
) {
  const { state } = view;
  const { from } = state.selection.main;
  const line = state.doc.lineAt(from);
  const onEmpty = line.text.trim() === "";

  const insertPos = onEmpty ? line.from : line.to;
  const prefix    = onEmpty ? ""  : "\n";
  const insert    = prefix + template + "\n";

  view.dispatch({
    changes: { from: insertPos, insert },
    selection: EditorSelection.cursor(insertPos + prefix.length + cursorDelta),
  });
  view.focus();
}

/** Special-case link: if selection exists, use it as the label. */
function insertLink(view: EditorView) {
  const { state } = view;
  const { from, to, empty } = state.selection.main;
  if (empty) {
    view.dispatch({
      changes: { from, insert: "[texto](url)" },
      selection: EditorSelection.range(from + 1, from + 6), // select "texto"
    });
  } else {
    const txt = state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `[${txt}](url)` },
      selection: EditorSelection.range(
        from + txt.length + 3,
        from + txt.length + 6  // select "url"
      ),
    });
  }
  view.focus();
}

// ── Templates ─────────────────────────────────────────────────────────────

const TABLE = `| Columna 1 | Columna 2 | Columna 3 |
| --------- | --------- | --------- |
| Celda     | Celda     | Celda     |`;

// backtick-fenced code block; cursor lands inside the block (offset = 4)
const CODE_BLOCK = "```\ncódigo\n```";

// ── Shortcut display ──────────────────────────────────────────────────────
//
// Shortcuts are stored as "Ctrl+B" strings.
// On macOS, "Ctrl" → "⌘" and "Shift" → "⇧" for a native feel.

function useShortcutKeys(shortcut: string): string[] {
  const isMac =
    typeof navigator !== "undefined" &&
    /mac/i.test(navigator.userAgent) &&
    !/windows|win32/i.test(navigator.userAgent);
  const display = isMac
    ? shortcut.replace("Ctrl", "⌘").replace("Shift", "⇧").replace("Alt", "⌥")
    : shortcut;
  return display.split("+");
}

// ── Toolbar definition ────────────────────────────────────────────────────

interface Btn {
  id:        string;
  label:     React.ReactNode;
  title:     string;
  /** Keyboard shortcut shown in the tooltip, e.g. "Ctrl+B". */
  shortcut?: string;
  cls?:      string;
  action:    (view: EditorView) => void;
}

const ICN = "w-3.5 h-3.5";

const GROUPS: Btn[][] = [
  // ── Inline formatting
  [
    { id: "bold",   label: <LuBold          className={ICN} />, title: "Negrita",        shortcut: "Ctrl+B",       action: v => wrapSelection(v, "**", "**", "texto")  },
    { id: "italic", label: <LuItalic        className={ICN} />, title: "Cursiva",        shortcut: "Ctrl+I",       action: v => wrapSelection(v, "*",  "*",  "texto")  },
    { id: "strike", label: <LuStrikethrough className={ICN} />, title: "Tachado",        shortcut: "Ctrl+Shift+S", action: v => wrapSelection(v, "~~", "~~", "texto")  },
    { id: "icode",  label: <LuCode          className={ICN} />, title: "Código inline",  shortcut: "Ctrl+E",       action: v => wrapSelection(v, "`",  "`",  "código") },
  ],
  // ── Headings
  [
    { id: "h1", label: <LuHeading1 className={ICN} />, title: "Encabezado 1", action: v => toggleLinePrefix(v, "# ")   },
    { id: "h2", label: <LuHeading2 className={ICN} />, title: "Encabezado 2", action: v => toggleLinePrefix(v, "## ")  },
    { id: "h3", label: <LuHeading3 className={ICN} />, title: "Encabezado 3", action: v => toggleLinePrefix(v, "### ") },
  ],
  // ── Block elements
  [
    { id: "quote", label: <LuQuote       className={ICN} />, title: "Cita",             action: v => toggleLinePrefix(v, "> ")     },
    { id: "ul",    label: <LuList        className={ICN} />, title: "Lista",            action: v => toggleLinePrefix(v, "- ")     },
    { id: "ol",    label: <LuListOrdered className={ICN} />, title: "Lista numerada",   action: v => toggleLinePrefix(v, "1. ")    },
    { id: "task",  label: <LuListChecks  className={ICN} />, title: "Lista de tareas",  action: v => toggleLinePrefix(v, "- [ ] ") },
    { id: "hr",    label: <LuMinus       className={ICN} />, title: "Línea divisora",   action: v => insertBlock(v, "---", 3)      },
    { id: "cbk",   label: <LuBraces      className={ICN} />, title: "Bloque de código", shortcut: "Ctrl+Shift+C", action: v => insertBlock(v, CODE_BLOCK, 4) },
  ],
  // ── Insert
  [
    { id: "link",  label: <LuLink  className={ICN} />, title: "Enlace",  shortcut: "Ctrl+K", action: insertLink                             },
    { id: "img",   label: <LuImage className={ICN} />, title: "Imagen",                      action: v => insertBlock(v, "![alt](url)", 2) },
    { id: "table", label: <LuTable className={ICN} />, title: "Tabla",                       action: v => insertBlock(v, TABLE, 2)         },
  ],
];

// ── Tooltip ───────────────────────────────────────────────────────────────
// Uses `position: fixed` so it escapes the toolbar's `overflow-x-auto` clip.

interface TooltipState {
  title:     string;
  shortcut?: string;
  x:         number;   // centre of the button (fixed coords)
  y:         number;   // bottom of the button
}

function TooltipPopup({ tip }: { tip: TooltipState }) {
  const keys = tip.shortcut ? useShortcutKeys(tip.shortcut) : []; // eslint-disable-line react-hooks/rules-of-hooks
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md whitespace-nowrap pointer-events-none"
      style={{
        position:        "fixed",
        top:             tip.y + 6,
        left:            tip.x,
        transform:       "translateX(-50%)",
        zIndex:          9999,
        backgroundColor: "var(--app-bg-menu)",
        border:          "1px solid var(--app-border-strong)",
        boxShadow:       "0 4px 12px rgba(0,0,0,0.25)",
      }}
    >
      <span className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
        {tip.title}
      </span>
      {keys.length > 0 && (
        <span className="flex items-center gap-0.5">
          {keys.map((k, i) => (
            <kbd
              key={i}
              className="text-[10px] px-1 py-px rounded leading-none font-mono"
              style={{
                backgroundColor: "var(--app-hover-strong)",
                color:           "var(--app-text-muted)",
                border:          "1px solid var(--app-border-strong)",
              }}
            >
              {k}
            </kbd>
          ))}
        </span>
      )}
    </div>
  );
}

// ── ToolbarButton ─────────────────────────────────────────────────────────

function ToolbarButton({
  btn,
  onMouseDown,
}: {
  btn:         Btn;
  onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef        = useRef<HTMLButtonElement>(null);

  function show() {
    timerRef.current = setTimeout(() => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTip({
        title:    btn.title,
        shortcut: btn.shortcut,
        x:        rect.left + rect.width / 2,
        y:        rect.bottom,
      });
    }, 350);
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTip(null);
  }

  return (
    <>
      <button
        ref={btnRef}
        onMouseDown={onMouseDown}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.backgroundColor = "var(--app-hover-strong)";
          el.style.color           = "var(--app-text-primary)";
          show();
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement;
          el.style.backgroundColor = "";
          el.style.color           = "var(--app-text-muted)";
          hide();
        }}
        className={[
          "px-2 py-0.5 rounded text-xs transition-colors select-none",
          "min-w-[1.6rem] text-center leading-5",
          btn.cls ?? "",
        ].join(" ")}
        style={{ color: "var(--app-text-muted)" }}
      >
        {btn.label}
      </button>

      {tip && <TooltipPopup tip={tip} />}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

interface MarkdownToolbarProps {
  editorViewRef: MutableRefObject<EditorView | null>;
  /**
   * When provided, clicking the image button opens a file-picker and calls this
   * ref's current function with the selected File so the editor can upload it.
   */
  onImageFileRef?: MutableRefObject<((file: File) => void) | null>;
}

export function MarkdownToolbar({ editorViewRef, onImageFileRef }: MarkdownToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function run(action: (v: EditorView) => void) {
    const view = editorViewRef.current;
    if (view) action(view);
  }

  function handleImageBtnMouseDown(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault(); // keep editor focused
    if (onImageFileRef) {
      fileInputRef.current?.click();
    } else {
      const view = editorViewRef.current;
      if (view) insertBlock(view, "![alt](url)", 2);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImageFileRef?.current) return;
    onImageFileRef.current(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <div
      className="flex items-center gap-px px-2 py-1 shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--app-bg-editor)",
        borderBottom: "1px solid var(--app-border)",
      }}
    >
      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {GROUPS.map((group, gi) => (
        <span key={gi} className="flex items-center gap-px">
          {/* Group separator */}
          {gi > 0 && (
            <span
              className="w-px h-3.5 mx-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: "var(--app-border-strong)" }}
            />
          )}

          {group.map((btn) => (
            <ToolbarButton
              key={btn.id}
              btn={btn}
              onMouseDown={
                btn.id === "img"
                  ? handleImageBtnMouseDown
                  : (e) => {
                      e.preventDefault(); // keep editor focused
                      run(btn.action);
                    }
              }
            />
          ))}
        </span>
      ))}
    </div>
  );
}
