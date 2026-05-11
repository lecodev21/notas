/**
 * findReplaceExtension
 * ─────────────────────────────────────────────────────────────────────────────
 * A self-contained CodeMirror 6 extension that drives in-editor find/replace
 * without depending on @codemirror/search.
 *
 * Public API:
 *   setFindTerm(term: string) — dispatch this effect to update highlights.
 *   findReplaceExtension      — add this to CodeMirror extensions.
 *
 * Highlight classes:
 *   .cm-fr-match          — every match (yellow tint)
 *   .cm-fr-match-current  — the match whose range === current selection (orange)
 */
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

// ── Public effect ─────────────────────────────────────────────────────────────
/** Dispatch this effect to set (or clear) the active search term. */
export const setFindTerm = StateEffect.define<string>();

// ── State field ───────────────────────────────────────────────────────────────
const findTermField = StateField.define<string>({
  create: () => "",
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setFindTerm)) return e.value;
    }
    return value;
  },
});

// ── Decorations ───────────────────────────────────────────────────────────────
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const matchMark   = Decoration.mark({ class: "cm-fr-match" });
const currentMark = Decoration.mark({ class: "cm-fr-match cm-fr-match-current" });

function buildDecos(view: EditorView, term: string): DecorationSet {
  if (!term) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  const text    = view.state.doc.toString();
  const re      = new RegExp(escapeRegex(term), "gi");
  const { from: selFrom, to: selTo } = view.state.selection.main;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const from = m.index;
    const to   = from + m[0].length;
    builder.add(from, to, selFrom === from && selTo === to ? currentMark : matchMark);
  }
  return builder.finish();
}

const findPlugin = ViewPlugin.fromClass(
  class {
    decs: DecorationSet;
    constructor(v: EditorView) {
      this.decs = buildDecos(v, v.state.field(findTermField));
    }
    update(u: ViewUpdate) {
      const term = u.state.field(findTermField);
      if (
        u.docChanged ||
        u.selectionSet ||
        term !== u.startState.field(findTermField)
      ) {
        this.decs = buildDecos(u.view, term);
      }
    }
  },
  { decorations: (v) => v.decs },
);

// ── Theme ─────────────────────────────────────────────────────────────────────
const findTheme = EditorView.theme({
  ".cm-fr-match": {
    backgroundColor: "rgba(250, 204, 21, 0.22)",
    borderRadius:    "2px",
  },
  ".cm-fr-match-current": {
    backgroundColor: "rgba(234, 179, 8, 0.55)",
    outline:         "1px solid rgba(234, 179, 8, 0.85)",
    borderRadius:    "2px",
  },
});

// ── Bundle ────────────────────────────────────────────────────────────────────
export const findReplaceExtension = [findTermField, findPlugin, findTheme];
