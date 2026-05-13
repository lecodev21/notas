/**
 * slashCommandExtension
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects when the user types `/` at the start of an otherwise-empty line and
 * notifies the React layer via callbacks so it can render a command-picker
 * overlay.  Arrow keys, Enter and Escape are intercepted (at Prec.highest) so
 * the menu can be navigated without CodeMirror receiving those keys.
 */

import { keymap, ViewPlugin, ViewUpdate, EditorView } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";

// ── Command definitions ───────────────────────────────────────────────────────

export interface SlashCommand {
  id:           string;
  label:        string;
  icon:         string;
  insert:       string;
  /** Cursor offset from insertion start after applying. Default = insert.length. */
  cursorOffset?: number;
  /** Select this [from, to] range (relative to insertion start) after applying. */
  selectRange?: [number, number];
  keywords:     string[];
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "h1", label: "Título 1", icon: "H1",
    insert: "# ",
    keywords: ["heading", "titulo", "h1", "title"],
  },
  {
    id: "h2", label: "Título 2", icon: "H2",
    insert: "## ",
    keywords: ["heading", "titulo", "h2"],
  },
  {
    id: "h3", label: "Título 3", icon: "H3",
    insert: "### ",
    keywords: ["heading", "titulo", "h3"],
  },
  {
    id: "divider", label: "Divisor", icon: "—",
    insert: "---\n",
    keywords: ["divider", "divisor", "hr", "linea", "line", "separador"],
  },
  {
    id: "quote", label: "Cita", icon: "❝",
    insert: "> ",
    keywords: ["quote", "cita", "blockquote"],
  },
  {
    id: "code", label: "Bloque de código", icon: "</>",
    insert: "```\n\n```", cursorOffset: 4,
    keywords: ["code", "codigo", "fence", "bloque"],
  },
  {
    id: "table", label: "Tabla", icon: "⊞",
    insert: "| Columna 1 | Columna 2 |\n|-----------|----------|\n| ",
    keywords: ["table", "tabla"],
  },
  {
    id: "image", label: "Imagen", icon: "🖼",
    insert: "![](url)", selectRange: [4, 7],
    keywords: ["image", "imagen", "img", "photo", "foto"],
  },
  {
    id: "task", label: "Lista de tareas", icon: "☑",
    insert: "- [ ] ",
    keywords: ["task", "tarea", "todo", "checklist"],
  },
  {
    id: "list", label: "Lista", icon: "•",
    insert: "- ",
    keywords: ["list", "lista", "bullet"],
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS;
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords.some((k) => k.includes(q))
  );
}

// ── Apply ─────────────────────────────────────────────────────────────────────

export function applySlashCommand(
  view: EditorView,
  command: SlashCommand,
  from: number,
): void {
  const to = view.state.selection.main.head; // covers the /query text
  const { insert, cursorOffset, selectRange } = command;

  const selection = selectRange
    ? EditorSelection.range(from + selectRange[0], from + selectRange[1])
    : EditorSelection.cursor(
        from + (cursorOffset !== undefined ? cursorOffset : insert.length)
      );

  view.dispatch({ changes: { from, to, insert }, selection });
  view.focus();
}

// ── Extension factory ─────────────────────────────────────────────────────────

export interface SlashCommandCallbacks {
  open:      (query: string, coords: { top: number; left: number }, from: number) => void;
  update:    (query: string, coords: { top: number; left: number }) => void;
  close:     () => void;
  arrowUp:   () => void;
  arrowDown: () => void;
  enter:     () => void;
}

/**
 * Pass a stable ref whose `.current` holds the callback object.
 * This avoids recreating the extension on every render while always
 * calling the latest callbacks.
 */
export function createSlashCommandExtension(
  cbRef: { current: SlashCommandCallbacks }
) {
  let active    = false;
  let slashFrom = 0;

  function getCoords(view: EditorView): { top: number; left: number } | null {
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) return null;
    return { top: coords.bottom, left: coords.left };
  }

  function close(view: EditorView) {
    if (!active) return;
    active = false;
    cbRef.current.close();
  }

  const plugin = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        const { state, view } = update;
        const sel   = state.selection.main;

        // Cursor moved before the slash → close
        if (active && sel.head < slashFrom) {
          close(view);
          return;
        }

        const line       = state.doc.lineAt(sel.head);
        const textBefore = state.sliceDoc(line.from, sel.head);
        const textAfter  = state.sliceDoc(sel.head, line.to);
        const match      = textBefore.match(/^\/(\w*)$/);

        if (match && textAfter.length === 0) {
          const query = match[1];
          const isNew = !active;
          if (isNew) {
            active    = true;
            slashFrom = line.from;
          }
          // Only reschedule a DOM read when the document actually changed or the
          // menu just opened.  Arrow-key presses produce a ViewUpdate without a
          // doc change — scheduling here would call cbRef.current.update() which
          // resets slashSelectedIdx back to 0, breaking keyboard navigation.
          if (isNew || update.docChanged) {
            const capturedFrom = slashFrom;
            requestAnimationFrame(() => {
              const coords = getCoords(view);
              if (!coords) return;
              if (isNew) {
                cbRef.current.open(query, coords, capturedFrom);
              } else {
                cbRef.current.update(query, coords);
              }
            });
          }
        } else if (active) {
          close(view);
        }
      }
    }
  );

  const km = Prec.highest(
    keymap.of([
      { key: "ArrowDown", run(view) { if (!active) return false; cbRef.current.arrowDown(); return true; } },
      { key: "ArrowUp",   run(view) { if (!active) return false; cbRef.current.arrowUp();   return true; } },
      { key: "Enter",     run(view) { if (!active) return false; cbRef.current.enter();     return true; } },
      { key: "Escape",    run(view) { if (!active) return false; close(view);               return true; } },
    ])
  );

  return [plugin, km];
}
