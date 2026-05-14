"use client";

import { type MutableRefObject, useRef } from "react";
import { type EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

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

// ── Toolbar definition ────────────────────────────────────────────────────

interface Btn {
  id:     string;
  label:  string;
  title:  string;
  cls?:   string;
  action: (view: EditorView) => void;
}

const GROUPS: Btn[][] = [
  // ── Inline formatting
  [
    { id: "bold",   label: "B",   title: "Negrita",        cls: "font-bold",    action: v => wrapSelection(v, "**", "**", "texto")  },
    { id: "italic", label: "I",   title: "Cursiva",        cls: "italic",       action: v => wrapSelection(v, "*",  "*",  "texto")  },
    { id: "strike", label: "S",   title: "Tachado",        cls: "line-through", action: v => wrapSelection(v, "~~", "~~", "texto")  },
    { id: "icode",  label: "`·`", title: "Código inline",  cls: "font-mono tracking-widest text-[9px]",
                                                                                 action: v => wrapSelection(v, "`",  "`",  "código") },
  ],
  // ── Headings
  [
    { id: "h1", label: "H1", title: "Encabezado 1", action: v => toggleLinePrefix(v, "# ")   },
    { id: "h2", label: "H2", title: "Encabezado 2", action: v => toggleLinePrefix(v, "## ")  },
    { id: "h3", label: "H3", title: "Encabezado 3", action: v => toggleLinePrefix(v, "### ") },
  ],
  // ── Block elements
  [
    { id: "quote", label: "❝",   title: "Cita",             action: v => toggleLinePrefix(v, "> ")     },
    { id: "ul",    label: "≡",   title: "Lista",            action: v => toggleLinePrefix(v, "- ")     },
    { id: "ol",    label: "1.",   title: "Lista numerada",   cls: "font-mono text-[10px]",
                                                             action: v => toggleLinePrefix(v, "1. ")    },
    { id: "task",  label: "☑",   title: "Lista de tareas",  action: v => toggleLinePrefix(v, "- [ ] ") },
    { id: "hr",    label: "—",   title: "Línea divisora",   action: v => insertBlock(v, "---", 3)      },
    { id: "cbk",   label: "{ }", title: "Bloque de código", cls: "font-mono text-[10px]",
                                                             action: v => insertBlock(v, CODE_BLOCK, 4) },
  ],
  // ── Insert
  [
    { id: "link",  label: "🔗", title: "Enlace",  action: insertLink                               },
    { id: "img",   label: "🖼", title: "Imagen",  action: v => insertBlock(v, "![alt](url)", 2)   },
    { id: "table", label: "⊞", title: "Tabla",   action: v => insertBlock(v, TABLE, 2)            },
  ],
];

// ── Component ─────────────────────────────────────────────────────────────

interface MarkdownToolbarProps {
  editorViewRef: MutableRefObject<EditorView | null>;
  /**
   * When provided, clicking the 🖼 button opens a file-picker and calls this
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

  function handleImageBtnMouseDown(e: React.MouseEvent) {
    e.preventDefault(); // keep editor focused
    if (onImageFileRef) {
      fileInputRef.current?.click();
    } else {
      // Fallback: insert placeholder text
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
            <button
              key={btn.id}
              onMouseDown={
                btn.id === "img"
                  ? handleImageBtnMouseDown
                  : (e) => {
                      e.preventDefault(); // keep editor focused
                      run(btn.action);
                    }
              }
              title={btn.title}
              className={[
                "px-2 py-0.5 rounded text-xs transition-colors select-none",
                "min-w-[1.6rem] text-center leading-5",
                btn.cls ?? "",
              ].join(" ")}
              style={{ color: "var(--app-text-muted)" }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.backgroundColor = "var(--app-hover-strong)";
                el.style.color           = "var(--app-text-primary)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.backgroundColor = "";
                el.style.color           = "var(--app-text-muted)";
              }}
            >
              {btn.label}
            </button>
          ))}
        </span>
      ))}
    </div>
  );
}
