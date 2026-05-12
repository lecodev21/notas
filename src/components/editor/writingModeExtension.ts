/**
 * writingModeExtension
 * ─────────────────────────────────────────────────────────────────────────────
 * Two distraction-free writing modes for the CodeMirror editor.
 *
 * Typewriter mode  — the active line is always kept vertically centred in the
 *                    editor.  Every cursor movement triggers a smooth scroll so
 *                    the line you are writing never drifts to the top/bottom.
 *
 * Paragraph focus  — every line outside the paragraph that contains the cursor
 *                    is dimmed.  A "paragraph" is a run of consecutive
 *                    non-empty lines.  The effect updates on every cursor move.
 */

import { ViewPlugin, ViewUpdate, EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// ── Typewriter mode ───────────────────────────────────────────────────────────

function centerCursor(view: EditorView) {
  const pos    = view.state.selection.main.head;
  const coords = view.coordsAtPos(pos);
  if (!coords) return;

  const scrollEl     = view.scrollDOM;
  const containerTop = scrollEl.getBoundingClientRect().top;
  const cursorMidY   = (coords.top + coords.bottom) / 2;
  const cursorInContainer = cursorMidY - containerTop;
  const target = scrollEl.scrollTop + cursorInContainer - scrollEl.clientHeight / 2;

  scrollEl.scrollTo({ top: target, behavior: "smooth" });
}

export const typewriterExtension = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate) {
      if (!update.selectionSet && !update.docChanged) return;
      if (!update.view.hasFocus) return;
      // Defer so the DOM has been updated before we read coordinates.
      requestAnimationFrame(() => centerCursor(update.view));
    }
  }
);

// ── Paragraph focus mode ──────────────────────────────────────────────────────

const dimDeco = Decoration.line({ class: "cm-para-dim" });

function buildDimDecorations(view: EditorView): DecorationSet {
  const { state }       = view;
  const cursorPos       = state.selection.main.head;
  const cursorLine      = state.doc.lineAt(cursorPos);
  const cursorLineNum   = cursorLine.number;

  // Expand the paragraph upward and downward from the cursor line.
  // An empty (whitespace-only) line terminates the paragraph.
  let paraStart = cursorLineNum;
  let paraEnd   = cursorLineNum;

  while (paraStart > 1 &&
         state.doc.line(paraStart - 1).text.trim() !== "") paraStart--;
  while (paraEnd < state.doc.lines &&
         state.doc.line(paraEnd + 1).text.trim() !== "") paraEnd++;

  // Apply dim decoration to every visible line outside the paragraph.
  const builder = new RangeSetBuilder<Decoration>();

  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = state.doc.lineAt(pos);
      if (line.number < paraStart || line.number > paraEnd) {
        builder.add(line.from, line.from, dimDeco);
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

const paragraphFocusTheme = EditorView.theme({
  ".cm-para-dim": {
    opacity:    "0.2",
    transition: "opacity 180ms ease",
  },
});

export const paragraphFocusExtension = [
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDimDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDimDecorations(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations }
  ),
  paragraphFocusTheme,
];
