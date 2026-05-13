/**
 * wikiLinkExtension
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects when the user types `[[query` on the current line and notifies the
 * React layer via callbacks so it can render a note-picker overlay.
 * Architecture mirrors slashCommandExtension.ts exactly.
 */

import { keymap, ViewPlugin, ViewUpdate, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

// ── Callbacks interface ───────────────────────────────────────────────────────

export interface WikiLinkCallbacks {
  open:      (query: string, coords: { top: number; left: number }, from: number) => void;
  update:    (query: string, coords: { top: number; left: number }) => void;
  close:     () => void;
  arrowUp:   () => void;
  arrowDown: () => void;
  enter:     () => void;
}

// ── Extension factory ─────────────────────────────────────────────────────────

/**
 * Pass a stable ref whose `.current` holds the callback object.
 * This avoids recreating the extension on every render while always
 * calling the latest callbacks.
 */
export function createWikiLinkExtension(
  cbRef: { current: WikiLinkCallbacks }
) {
  let active    = false;
  let wikiFrom  = 0;

  function getCoords(view: EditorView): { top: number; left: number } | null {
    const coords = view.coordsAtPos(view.state.selection.main.head);
    if (!coords) return null;
    return { top: coords.bottom, left: coords.left };
  }

  function close(view: EditorView) {
    if (!active) return;
    active = false;
    cbRef.current.close();
    // suppress unused param warning
    void view;
  }

  const plugin = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        const { state, view } = update;
        const sel = state.selection.main;

        // Cursor moved before the opening [[ → close
        if (active && sel.head < wikiFrom) {
          close(view);
          return;
        }

        const line             = state.doc.lineAt(sel.head);
        const lineTextUpToCursor = state.sliceDoc(line.from, sel.head);

        // Detect [[query pattern at any position on the line
        const match = lineTextUpToCursor.match(/\[\[([^\]\n]*)$/);

        if (match) {
          const query = match[1];
          const isNew = !active;

          if (isNew) {
            active   = true;
            // from = position of the opening [[
            wikiFrom = line.from + lineTextUpToCursor.lastIndexOf("[[");
          }

          // Only reschedule a DOM read when the document actually changed or
          // the menu just opened — same guard as slashCommandExtension.
          if (isNew || update.docChanged) {
            const capturedFrom = wikiFrom;
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
