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
import { syntaxTree, LanguageDescription, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { useTheme } from "@/lib/theme";
import { EMOJIS } from "./emojiData";
import { findReplaceExtension } from "./findReplaceExtension";
import { tableEditingExtension } from "./tableEditingExtension";
import { typewriterExtension, paragraphFocusExtension } from "./writingModeExtension";

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

/** "focus" activates typewriter-scroll + paragraph-dim simultaneously. */
export type WritingMode = "focus" | null;

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ref shared with a parent toolbar so buttons can dispatch transactions */
  editorViewRef?: MutableRefObject<EditorView | null>;
  /** When true, horizontal padding grows to center the text column at ≤ 680 px */
  readableWidth?: boolean;
  /** Distraction-free writing mode: typewriter (auto-centre) or paragraph (dim rest) */
  writingMode?: WritingMode;
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

// ── Fenced code block language resolver ───────────────────────────────────
// Maps common shorthands to the name registered in @codemirror/language-data.
// Without this, ```py wouldn't activate Python syntax highlighting in the
// editor because CodeMirror looks up the info string by exact/prefix match.
const CODE_LANG_ALIASES: Record<string, string> = {
  py:       "python",
  python3:  "python",
  js:       "javascript",
  jsx:      "javascript",
  ts:       "typescript",
  tsx:      "typescript",
  rb:       "ruby",
  sh:       "bash",
  shell:    "bash",
  zsh:      "bash",
  rs:       "rust",
  kt:       "kotlin",
  kts:      "kotlin",
  cs:       "csharp",
  "c#":     "csharp",
  "c++":    "cpp",
  cc:       "cpp",
  golang:   "go",
  yml:      "yaml",
  md:       "markdown",
  node:     "javascript",
};

function resolveCodeLanguage(info: string): LanguageDescription | null {
  const key      = info.toLowerCase();
  const resolved = CODE_LANG_ALIASES[key] ?? key;
  return LanguageDescription.matchLanguageName(languages, resolved, true) ?? null;
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

// ── Syntax highlight styles — mirror the hljs preview palette ─────────────
// Light: GitHub-inspired (same as --hljs-* :root vars in globals.css)
// Dark:  Tokyo Night-inspired (same as --hljs-* .dark vars in globals.css)
//
// We use Prec.highest so these rules win over oneDark's bundled highlight style.

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword,                            color: "#d73a49", fontWeight: "600" },
  { tag: [tags.name, tags.deleted, tags.macroName], color: "#24292e" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName],
                                                  color: "#6f42c1", fontWeight: "600" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
                                                  color: "#005cc5" },
  { tag: [tags.definition(tags.name), tags.separator], color: "#24292e" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.changed, tags.annotation,
          tags.modifier, tags.self, tags.standard(tags.variableName)],
                                                  color: "#e36209" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp,
          tags.link, tags.special(tags.string)],  color: "#d73a49" },
  { tag: [tags.meta, tags.comment],               color: "#6a737d", fontStyle: "italic" },
  { tag: tags.strong,                             fontWeight: "bold" },
  { tag: tags.emphasis,                           fontStyle: "italic" },
  { tag: tags.strikethrough,                      textDecoration: "line-through" },
  { tag: tags.link,                               color: "#005cc5", textDecoration: "underline" },
  { tag: tags.heading,                            fontWeight: "bold", color: "#24292e" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#005cc5" },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#032f62" },
  { tag: tags.number,                             color: "#005cc5" },
  { tag: tags.tagName,                            color: "#22863a" },
  { tag: tags.attributeName,                      color: "#6f42c1" },
  { tag: tags.invalid,                            color: "#cb2431" },
]);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword,                            color: "#bb9af7", fontWeight: "600" },
  { tag: [tags.name, tags.deleted, tags.macroName], color: "#a9b1d6" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName],
                                                  color: "#7aa2f7", fontWeight: "600" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
                                                  color: "#ff9e64" },
  { tag: [tags.definition(tags.name), tags.separator], color: "#a9b1d6" },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.changed, tags.annotation,
          tags.modifier, tags.self, tags.standard(tags.variableName)],
                                                  color: "#e0af68" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp,
          tags.link, tags.special(tags.string)],  color: "#89ddff" },
  { tag: [tags.meta, tags.comment],               color: "#565f89", fontStyle: "italic" },
  { tag: tags.strong,                             fontWeight: "bold" },
  { tag: tags.emphasis,                           fontStyle: "italic" },
  { tag: tags.strikethrough,                      textDecoration: "line-through" },
  { tag: tags.link,                               color: "#7dcfff", textDecoration: "underline" },
  { tag: tags.heading,                            fontWeight: "bold", color: "#c0caf5" },
  { tag: [tags.atom, tags.bool, tags.special(tags.variableName)], color: "#ff9e64" },
  { tag: [tags.processingInstruction, tags.string, tags.inserted], color: "#9ece6a" },
  { tag: tags.number,                             color: "#ff9e64" },
  { tag: tags.tagName,                            color: "#f7768e" },
  { tag: tags.attributeName,                      color: "#bb9af7" },
  { tag: tags.invalid,                            color: "#f7768e" },
]);

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
  const linkMatch = text.match(/^\[(.+)\]\((.+)\)$/);

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

// ── Markdown pair auto-closing ────────────────────────────────────────────
//
// We replace basicSetup's closeBrackets (disabled below) with our own config
// that extends the standard pairs with Markdown inline delimiters:
//
//   *  →  **   cursor between     (italic/bold delimiters)
//   _  →  __   cursor between     (italic/bold delimiters)
//   `  →  ``   cursor between     (inline code)
//
// The [ key is intercepted at Prec.high (keydown level, before the
// closeBrackets inputHandler) to produce the full []() link skeleton
// instead of plain [].  Selection wrapping also applies to all pairs:
// selecting text and typing the delimiter wraps it.

/**
 * When the user types `*` with the cursor already sitting between an
 * auto-closed `*│*` pair, closeBrackets would normally just skip the
 * cursor past the closing `*` (IDE skip-over behaviour).  For Markdown
 * we want `**│**` instead — matching Obsidian / Typora bold-delimiter UX.
 *
 * This binding runs at Prec.highest so it fires before closeBrackets'
 * inputHandler.  When the conditions aren't met it returns false and lets
 * closeBrackets handle everything else (single-pair insertion, selection
 * wrapping, Backspace deletion, etc.).
 */
const boldPairKeymap = Prec.highest(
  keymap.of([
    {
      key: "*",
      run(view) {
        const { state } = view;
        const sel = state.selection.main;
        if (!sel.empty) return false; // let closeBrackets wrap the selection
        const { from } = sel;
        const prev = from > 0 ? state.doc.sliceString(from - 1, from) : "";
        const next = state.doc.sliceString(from, from + 1);
        // Only act when cursor is exactly between `*│*`
        if (prev !== "*" || next !== "*") return false;
        // Expand to `**│**`: insert one `*` before the closing star and
        // another after it (positions are in the original document).
        view.dispatch({
          changes: [
            { from,     insert: "*" }, // opening second `*`
            { from: from + 1, insert: "*" }, // closing second `*`
          ],
          selection: EditorSelection.cursor(from + 1),
        });
        return true;
      },
    },
  ])
);

/**
 * Standard pairs + Markdown inline delimiters.
 *
 * closeBrackets() v6 accepts NO parameters — the brackets list is read from
 * state.languageDataAt("closeBrackets", pos).  We inject our custom config
 * through EditorState.languageData so it replaces the built-in defaults
 * (which only cover `( [ { ' "`).
 */
const mdPairExtensions = [
  // Provide the brackets config that closeBrackets() reads at runtime
  EditorState.languageData.of(() => [
    {
      closeBrackets: {
        brackets: ["(", "[", "{", "'", '"', "*", "_", "`"],
      },
    },
  ]),
  closeBrackets(),
  // Backspace deletes an auto-inserted pair when cursor is between them
  Prec.high(keymap.of(closeBracketsKeymap)),
  boldPairKeymap,
];

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
 *  or null if the line at `pos` isn't a task list item or a table row with a
 *  checkbox pattern. */
function taskCheckboxRange(
  state: EditorState,
  pos: number,
): { from: number; to: number; checked: boolean } | null {
  const line = state.doc.lineAt(pos);

  // ── GFM list task item: `- [ ] text` / `* [x] text` ──────────────────────
  const m = line.text.match(/^[-*+] \[([ xX])\] /);
  if (m) {
    // The bracket span is always at line.from + 2 … line.from + 5
    const from    = line.from + 2;
    const to      = line.from + 5;
    const checked = m[1] !== " ";
    if (pos < from || pos > to) return null;
    return { from, to, checked };
  }

  // ── Table row: any line containing | with a [ ] or [x] cell ──────────────
  if (line.text.includes("|")) {
    const pattern = /\[([ xX])\](?!\()/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line.text)) !== null) {
      const from = line.from + match.index;
      const to   = from + match[0].length;   // covers `[`, char, `]`
      if (pos >= from && pos <= to) {
        return { from, to, checked: match[1] !== " " };
      }
    }
  }

  return null;
}

/** ViewPlugin: decorates the `[ ]`/`[x]` span on every visible task line
 *  and on every `[ ]`/`[x]` occurrence inside table rows. */
function buildTaskDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from, to } = view.viewport;
  const mark = Decoration.mark({ class: "cm-task-checkbox" });

  for (let pos = from; pos <= to; ) {
    const line = view.state.doc.lineAt(pos);

    // GFM list task item
    if (/^[-*+] \[([ xX])\] /.test(line.text)) {
      builder.add(line.from + 2, line.from + 5, mark);
    }
    // Table row — may contain multiple [ ]/[x] cells
    else if (line.text.includes("|")) {
      const pattern = /\[([ xX])\](?!\()/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line.text)) !== null) {
        builder.add(
          line.from + match.index,
          line.from + match.index + match[0].length,
          mark,
        );
      }
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

// ── Markdown inline decorations ────────────────────────────────────────────
// Walks the Lezer syntax tree inside the visible viewport and applies visual
// decorations for inline Markdown:
//
//   **bold**    → bold text, markers dimmed
//   *italic*    → italic text, markers dimmed
//   `code`      → monospace + indigo tint background, backticks dimmed
//   [link](url) → indigo colour, markup characters dimmed
//   > blockquote→ left accent border + muted colour on each line
//   ~~strike~~  → strikethrough, markers dimmed
//
// Headings are handled by the existing headingPlugin above; no overlap here.

type MdMarkSpec = { from: number; to: number; deco: Decoration };

// Stable decoration instances — created once, reused every render.
const _boldDeco  = Decoration.mark({ class: "cm-md-strong" });
const _emDeco    = Decoration.mark({ class: "cm-md-em" });
const _codeDeco  = Decoration.mark({ class: "cm-md-icode" });
const _linkDeco  = Decoration.mark({ class: "cm-md-link" });
const _strikeDeco= Decoration.mark({ class: "cm-md-strike" });
const _dimDeco   = Decoration.mark({ class: "cm-md-syntax" });
const _bqLineDeco= Decoration.line({ class: "cm-md-bq" });

function buildMdDecorations(view: EditorView): DecorationSet {
  const specs: MdMarkSpec[] = [];
  const { from, to } = view.viewport;
  const doc = view.state.doc;

  syntaxTree(view.state).iterate({
    from,
    to,
    enter(node) {
      switch (node.name) {
        // ── Bold / italic ────────────────────────────────────────────────
        case "StrongEmphasis":
          specs.push({ from: node.from, to: node.to, deco: _boldDeco }); break;
        case "Emphasis":
          specs.push({ from: node.from, to: node.to, deco: _emDeco }); break;

        // ── Syntax punctuation (dimmed in all contexts) ──────────────────
        case "EmphasisMark":
        case "CodeMark":
        case "LinkMark":
        case "QuoteMark":
        case "StrikethroughMark":
          specs.push({ from: node.from, to: node.to, deco: _dimDeco }); break;

        // ── Inline code ──────────────────────────────────────────────────
        case "InlineCode":
          specs.push({ from: node.from, to: node.to, deco: _codeDeco }); break;

        // ── Links ────────────────────────────────────────────────────────
        case "Link":
          specs.push({ from: node.from, to: node.to, deco: _linkDeco }); break;

        // ── Strikethrough ────────────────────────────────────────────────
        case "Strikethrough":
          specs.push({ from: node.from, to: node.to, deco: _strikeDeco }); break;

        // ── Blockquote — one line decoration per line in the block ───────
        case "Blockquote": {
          let pos = node.from;
          while (pos <= node.to) {
            const line = doc.lineAt(pos);
            // Only decorate lines inside the current viewport
            if (line.from >= from) {
              specs.push({ from: line.from, to: line.from, deco: _bqLineDeco });
            }
            pos = line.to + 1;
          }
          break;
        }
      }
    },
  });

  // RangeSetBuilder requires non-decreasing `from`; sort first.
  specs.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from: f, to: t, deco } of specs) {
    builder.add(f, t, deco);
  }
  return builder.finish();
}

const mdDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMdDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildMdDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const mdDecorationsTheme = EditorView.theme({
  // Each Markdown construct gets its own text colour so you can identify it
  // at a glance without relying solely on font changes.
  ".cm-md-strong": { fontWeight: "700",          color: "#4ade80" }, // green
  ".cm-md-em":     { fontStyle:  "italic",       color: "#facc15" }, // yellow
  ".cm-md-icode":  {                             color: "#f472b6", // pink
    backgroundColor: "rgba(244,114,182,0.1)",
    borderRadius:    "3px",
    padding:         "0 3px",
  },
  ".cm-md-link":   { color: "#60a5fa" },                            // blue
  ".cm-md-strike": { textDecoration: "line-through", color: "#fb923c" }, // orange
  // Syntax punctuation — dim on top of whatever colour the parent gives it
  ".cm-md-syntax": { opacity: "0.45" },
  // Blockquote line — left accent bar via box-shadow + teal text
  ".cm-md-bq": {
    color:     "#2dd4bf",                                            // teal
    boxShadow: "-4px 0 0 0 rgba(45,212,191,0.5)",
  },
});

// ── Extension bundles ──────────────────────────────────────────────────────
const sharedExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: resolveCodeLanguage }),
  EditorView.lineWrapping,
  baseTheme,
  headingTheme,
  headingPlugin,
  formattingKeymap,
  ...mdPairExtensions,
  emojiCompletion,
  completionTheme,
  taskPlugin,
  taskClickHandler,
  taskTheme,
  mdDecorationsPlugin,
  mdDecorationsTheme,
  ...findReplaceExtension,
  tableEditingExtension,
];

// ── Component ──────────────────────────────────────────────────────────────
export function MarkdownEditor({ value, onChange, editorViewRef, readableWidth, writingMode }: MarkdownEditorProps) {
  const { theme } = useTheme();
  const handleChange = useCallback((val: string) => onChange(val), [onChange]);

  const extensions = [
    ...sharedExtensions,
    // Syntax highlight style — matches the hljs preview palette exactly.
    // Prec.highest overrides the bundled highlight style from oneDark.
    Prec.highest(syntaxHighlighting(theme === "dark" ? darkHighlightStyle : lightHighlightStyle)),
    ...(theme !== "dark" ? [lightTheme] : []),
    // Writing mode: typewriter-scroll + paragraph-dim together
    ...(writingMode === "focus" ? [typewriterExtension, ...paragraphFocusExtension] : []),
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
            // We supply our own closeBrackets (with Markdown delimiters)
            // via mdPairExtensions — disable the basicSetup default to avoid
            // double-handling.
            closeBrackets: false,
            closeBracketsKeymap: false,
          }}
          className="h-full"
        />
      </div>
    </div>
  );
}
