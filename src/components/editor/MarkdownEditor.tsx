"use client";

import dynamic from "next/dynamic";
import { type MutableRefObject, useCallback } from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { EditorSelection, EditorState, Prec, RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { useTheme } from "@/lib/theme";
import { EMOJIS } from "./emojiData";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full flex items-center justify-center text-sm"
      style={{ color: "var(--app-text-faint)" }}
    >
      Cargando editor...
    </div>
  ),
});

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ref shared with a parent toolbar so buttons can dispatch transactions */
  editorViewRef?: MutableRefObject<EditorView | null>;
  /** When true, horizontal padding grows to center the text column at ≤ 680 px */
  readableWidth?: boolean;
}

// ── Heading size decorations ───────────────────────────────────────────────
// Walks the Lezer syntax tree inside the current viewport and attaches a
// Decoration.line (CSS class) to each ATXHeading1-6 line.  A separate
// Decoration.mark dims the `#` markers so the title text pops.

function atxLevel(nodeName: string): number {
  const m = nodeName.match(/^ATXHeading(\d)$/);
  return m ? parseInt(m[1], 10) : 0;
}

function buildHeadingDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from, to } = view.viewport;

  syntaxTree(view.state).iterate({
    from,
    to,
    enter(node) {
      const level = atxLevel(node.name);
      if (level > 0) {
        // Line-level decoration: changes font-size for the whole line
        const lineStart = view.state.doc.lineAt(node.from).from;
        builder.add(
          lineStart,
          lineStart,
          Decoration.line({ class: `cm-md-h cm-md-h${level}` })
        );
      }
      // Dim the leading # marks so the title text stands out
      if (node.name === "HeaderMark") {
        builder.add(
          node.from,
          node.to,
          Decoration.mark({ class: "cm-md-hmark" })
        );
      }
    },
  });

  return builder.finish();
}

const headingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildHeadingDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHeadingDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// CSS injected via the theme extension — font sizes are relative to the
// editor's base 13 px so they scale correctly.
const headingTheme = EditorView.theme({
  // Shared heading style
  ".cm-md-h": {
    fontWeight: "700",
    lineHeight: "1.5 !important",
    display: "block",
  },
  // Individual levels
  ".cm-md-h1": { fontSize: "1.85em" },
  ".cm-md-h2": { fontSize: "1.5em"  },
  ".cm-md-h3": { fontSize: "1.25em" },
  ".cm-md-h4": { fontSize: "1.1em"  },
  ".cm-md-h5": { fontSize: "1.0em"  },
  ".cm-md-h6": { fontSize: "1.0em", fontStyle: "italic" },
  // Dim the # markers so they feel like punctuation, not content
  ".cm-md-hmark": { opacity: "0.4" },
});

// ── Base layout theme ──────────────────────────────────────────────────────
const baseTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  },
  ".cm-scroller": { overflow: "auto", overflowX: "hidden", padding: "16px 24px" },
  ".cm-content": { padding: "0", wordBreak: "break-word" },
  ".cm-focused": { outline: "none !important" },
  ".cm-line": { padding: "0", whiteSpace: "pre-wrap", wordBreak: "break-word" },
});

// ── Light-mode colour overrides ────────────────────────────────────────────
const lightTheme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--app-bg-editor)", color: "#1c1917" },
    ".cm-gutters": {
      backgroundColor: "var(--app-bg-editor)",
      borderRight: "1px solid var(--app-border)",
    },
    ".cm-activeLineGutter": { backgroundColor: "var(--app-hover)" },
    ".cm-activeLine":       { backgroundColor: "var(--app-hover)" },
    ".cm-cursor":           { borderLeftColor: "#6366f1" },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(99,102,241,0.2) !important",
    },
  },
  { dark: false }
);

// ── Formatting keyboard shortcuts ─────────────────────────────────────────
// Each command returns true so CodeMirror marks the event as handled and the
// browser's default action (e.g. bold in some rich-text contexts) is suppressed.

/**
 * Resolve the effective [from, to) range for a formatting command:
 *  - If there is a real selection, use it as-is.
 *  - If the cursor sits inside a word, use the word boundaries.
 *  - If the cursor is in whitespace, return null (caller inserts a placeholder).
 */
function resolveRange(
  view: EditorView,
  range: import("@codemirror/state").SelectionRange,
): { from: number; to: number } | null {
  if (!range.empty) return { from: range.from, to: range.to };
  const word = view.state.wordAt(range.from);
  return word ? { from: word.from, to: word.to } : null;
}

/**
 * Check whether `before`/`after` markers sit immediately outside [from, to)
 * in the document — used when the cursor is on a bare word and the markers
 * are not part of the selected text.
 *
 * For single-character markers (e.g. `*`) we also verify that the character
 * just outside the marker is NOT the same character, which prevents treating
 * a word inside `**bold**` as italic-wrapped when before = `*`.
 */
function markersOutside(
  view: EditorView,
  from: number,
  to: number,
  before: string,
  after: string,
): boolean {
  const { state } = view;
  const docLen = state.doc.length;
  const preStart = from - before.length;
  const postEnd  = to   + after.length;

  if (preStart < 0 || postEnd > docLen) return false;
  if (state.sliceDoc(preStart, from) !== before) return false;
  if (state.sliceDoc(to, postEnd)    !== after)  return false;

  // For single-char markers, confirm the character just outside is different,
  // so `*` doesn't accidentally match the inner `*` of `**bold**`.
  if (before.length === 1) {
    const outerBefore = preStart > 0           ? state.sliceDoc(preStart - 1, preStart) : "";
    const outerAfter  = postEnd  < docLen      ? state.sliceDoc(postEnd,  postEnd  + 1) : "";
    if (outerBefore === before[0] || outerAfter === after[0]) return false;
  }

  return true;
}

/**
 * Wrap or unwrap the active selection / word under cursor with `before`/`after`.
 * Falls back to inserting a placeholder when the cursor is in whitespace.
 * `isWrapped` is an optional predicate for cases where startsWith/endsWith is
 * not precise enough (e.g. single `*` italic vs `**` bold).
 */
function toggleWrap(
  view: EditorView,
  before: string,
  after: string,
  placeholder = "texto",
  isWrapped?: (text: string) => boolean,
): boolean {
  view.dispatch(
    view.state.changeByRange((range) => {
      const effective = resolveRange(view, range);

      // ── Cursor in whitespace → insert placeholder ────────────────────────
      if (!effective) {
        const insert = before + placeholder + after;
        return {
          changes: { from: range.from, insert },
          range: EditorSelection.range(
            range.from + before.length,
            range.from + before.length + placeholder.length,
          ),
        };
      }

      const { from, to } = effective;
      const text = view.state.sliceDoc(from, to);

      // ── Check 1: the selected/word text itself includes the markers ───────
      // (e.g. user manually selected "**hola**" then pressed Ctrl+B)
      const textIsWrapped = isWrapped
        ? isWrapped(text)
        : text.startsWith(before) &&
          text.endsWith(after) &&
          text.length > before.length + after.length;

      if (textIsWrapped) {
        const inner = text.slice(before.length, text.length - after.length);
        return {
          changes: { from, to, insert: inner },
          range: EditorSelection.range(from, from + inner.length),
        };
      }

      // ── Check 2 (cursor-on-word only): markers are outside the word range ─
      // (e.g. cursor sits on "hola" inside "**hola**")
      if (range.empty && markersOutside(view, from, to, before, after)) {
        const preStart = from - before.length;
        const postEnd  = to   + after.length;
        return {
          // Two deletions: remove the marker before and the marker after
          changes: [
            { from: preStart, to: from, insert: "" },
            { from: to,       to: postEnd, insert: "" },
          ],
          range: EditorSelection.cursor(preStart + text.length),
        };
      }

      // ── Not wrapped → apply format ────────────────────────────────────────
      return {
        changes: { from, to, insert: before + text + after },
        range: EditorSelection.range(
          from + before.length,
          from + before.length + text.length,
        ),
      };
    }),
  );
  view.focus();
  return true;
}

/** Italic uses single `*` — must not match `**bold**` selections. */
function isItalicWrapped(text: string): boolean {
  return (
    text.length >= 3 &&
    text[0] === "*" && text[1] !== "*" &&
    text[text.length - 1] === "*" && text[text.length - 2] !== "*"
  );
}

/** Ctrl+K — wrap word/selection as `[label](url)`, or unwrap an existing link. */
function toggleLink(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const effective = resolveRange(view, sel);

  // Cursor in whitespace → insert placeholder, position on "texto"
  if (!effective) {
    view.dispatch({
      changes: { from: sel.from, insert: "[texto](url)" },
      selection: EditorSelection.range(sel.from + 1, sel.from + 6),
    });
    view.focus();
    return true;
  }

  const { from, to } = effective;
  const text = state.sliceDoc(from, to);
  const linkMatch = text.match(/^\[(.+)\]\((.+)\)$/s);

  if (linkMatch) {
    // Already a link → keep only the visible label
    const label = linkMatch[1];
    view.dispatch({
      changes: { from, to, insert: label },
      selection: EditorSelection.range(from, from + label.length),
    });
  } else {
    // Wrap as link label, auto-select "url" so the user can type it right away
    view.dispatch({
      changes: { from, to, insert: `[${text}](url)` },
      selection: EditorSelection.range(
        from + text.length + 3,
        from + text.length + 6,
      ),
    });
  }
  view.focus();
  return true;
}

// Prec.high ensures these bindings fire before any lower-priority keymap
// (e.g. the default CodeMirror history/indent bindings).
const formattingKeymap = Prec.high(
  keymap.of([
    { key: "Mod-b",       run: (v) => toggleWrap(v, "**", "**", "texto") },
    { key: "Mod-i",       run: (v) => toggleWrap(v, "*",  "*",  "texto", isItalicWrapped) },
    { key: "Mod-k",       run: toggleLink },
    { key: "Mod-Shift-c", run: (v) => toggleWrap(v, "```", "```", "código") },
  ]),
);

// ── Emoji autocompletion ───────────────────────────────────────────────────
// Triggered by `:xx` (colon + ≥2 chars).  Results are filtered by substring
// match and capped at 8 items so the dropdown stays compact.

function emojiSource(context: CompletionContext): CompletionResult | null {
  // Match ":" optionally followed by letters — triggers on the colon itself
  const match = context.matchBefore(/:[a-z0-9_+\-]*/);
  if (!match) return null;

  const query = match.text.slice(1).toLowerCase();

  // No query → show every emoji; with query → substring filter, cap at 8
  const options = (
    query === ""
      ? EMOJIS
      : EMOJIS.filter(([name]) => name.includes(query)).slice(0, 8)
  ).map(([name, emoji]) => ({
    label:  `${emoji}  ${name}`,
    apply:  emoji,          // insert the emoji character, not the shortcode
    type:   "text" as const,
  }));

  if (options.length === 0) return null;

  return {
    from:     match.from,           // replace from the ":" onwards
    options,
    filter:   false,                // we handle filtering ourselves
    validFor: /^:[a-z0-9_+\-]*$/,  // keep dropdown open while still typing
  };
}

// Style overrides so the dropdown respects the app's CSS variables in both themes
const completionTheme = EditorView.theme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    border:          "1px solid var(--app-border-strong)",
    borderRadius:    "8px",
    overflow:        "hidden",
    backgroundColor: "var(--app-bg-menu)",
    boxShadow:       "0 8px 24px rgba(0,0,0,0.25)",
    minWidth:        "180px",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "inherit",
    maxHeight:  "220px",
    padding:    "4px",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding:      "5px 10px",
    fontSize:     "13px",
    borderRadius: "5px",
    color:        "var(--app-text-secondary)",
    cursor:       "pointer",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected='true']": {
    backgroundColor: "var(--app-hover-strong)",
    color:           "var(--app-text-primary)",
  },
  ".cm-completionIcon": { display: "none" }, // hide the generic type icon
});

const emojiCompletion = autocompletion({
  override:         [emojiSource],
  closeOnBlur:      true,
  activateOnTyping: true,
});

// ── Interactive task checkboxes in the editor ─────────────────────────────
// Detects lines matching `- [ ]` or `- [x]` and:
//  1. Decorates the `[ ]`/`[x]` span with a CSS class so the cursor turns into
//     a pointer when hovering over it.
//  2. Handles `mousedown` on that span: toggles the check character and
//     returns `true` so CodeMirror doesn't move the cursor there.

/** Returns the document position of the `[ ]`/`[x]` span if `pos` falls on it,
 *  or null if the line at `pos` isn't a task list item. */
function taskCheckboxRange(
  state: EditorState,
  pos: number,
): { from: number; to: number; checked: boolean } | null {
  const line = state.doc.lineAt(pos);
  // Must start with `- [ ] ` or `- [x] ` (or `* [ ] ` etc.)
  const m = line.text.match(/^[-*+] \[([ xX])\] /);
  if (!m) return null;
  // The bracket span is always at line.from + 2 … line.from + 5  ( `[`, ` `/`x`, `]` )
  const from    = line.from + 2;   // position of `[`
  const to      = line.from + 5;   // position just after `]`
  const checked = m[1] !== " ";
  // Only react when the click landed on/near the checkbox glyph
  if (pos < from || pos > to) return null;
  return { from, to, checked };
}

/** ViewPlugin: decorates the `[ ]`/`[x]` span on every visible task line. */
function buildTaskDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from, to } = view.viewport;
  for (let pos = from; pos <= to; ) {
    const line = view.state.doc.lineAt(pos);
    if (/^[-*+] \[([ xX])\] /.test(line.text)) {
      // Mark the `[ ]`/`[x]` characters (positions +2 to +5 on the line)
      builder.add(
        line.from + 2,
        line.from + 5,
        Decoration.mark({ class: "cm-task-checkbox" }),
      );
    }
    pos = line.to + 1;
  }
  return builder.finish();
}

const taskPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildTaskDecorations(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildTaskDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

/** mousedown handler — fires before CodeMirror moves the cursor. */
const taskClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const coords = { x: event.clientX, y: event.clientY };
    const pos    = view.posAtCoords(coords);
    if (pos === null) return false;

    const cb = taskCheckboxRange(view.state, pos);
    if (!cb) return false;

    // Toggle: space ↔ x
    const newChar = cb.checked ? " " : "x";
    view.dispatch({
      changes: { from: cb.from + 1, to: cb.from + 2, insert: newChar },
    });
    event.preventDefault();   // don't move the cursor
    return true;
  },
});

const taskTheme = EditorView.theme({
  ".cm-task-checkbox": { cursor: "pointer" },
});

// ── Extension bundles ──────────────────────────────────────────────────────
const sharedExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  baseTheme,
  headingTheme,
  headingPlugin,
  formattingKeymap,
  emojiCompletion,
  completionTheme,
  taskPlugin,
  taskClickHandler,
  taskTheme,
];

// ── Component ──────────────────────────────────────────────────────────────
export function MarkdownEditor({ value, onChange, editorViewRef, readableWidth }: MarkdownEditorProps) {
  const { theme } = useTheme();
  const handleChange = useCallback((val: string) => onChange(val), [onChange]);

  const extensions = [
    ...sharedExtensions,
    ...(theme !== "dark" ? [lightTheme] : []),
  ];

  return (
    // Outer div scrolls and fills the panel; inner div constrains/centers
    // the editor column when readableWidth is on.
    <div className="h-full overflow-hidden">
      <div
        style={{
          height:      "100%",
          maxWidth:    readableWidth ? 680 : undefined,
          marginLeft:  readableWidth ? "auto" : undefined,
          marginRight: readableWidth ? "auto" : undefined,
        }}
      >
        <CodeMirror
          value={value}
          onChange={handleChange}
          onCreateEditor={(view) => {
            if (editorViewRef) editorViewRef.current = view;
          }}
          extensions={extensions}
          theme={theme === "dark" ? oneDark : "light"}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: true,
            autocompletion: false,
            syntaxHighlighting: true,
          }}
          className="h-full"
        />
      </div>
    </div>
  );
}
