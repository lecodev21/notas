"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { useTheme } from "@/lib/theme";
import { MarkdownToolbar } from "./MarkdownToolbar";

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

// ── Extension bundles ──────────────────────────────────────────────────────
const sharedExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  EditorView.lineWrapping,
  baseTheme,
  headingTheme,
  headingPlugin,
];

// ── Component ──────────────────────────────────────────────────────────────
export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const { theme } = useTheme();
  const handleChange = useCallback((val: string) => onChange(val), [onChange]);

  // Shared with MarkdownToolbar so toolbar buttons can dispatch transactions
  const editorViewRef = useRef<EditorView | null>(null);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Formatting toolbar */}
      <MarkdownToolbar editorViewRef={editorViewRef} />

      {/* CodeMirror fills the remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror
          value={value}
          onChange={handleChange}
          onCreateEditor={(view) => { editorViewRef.current = view; }}
          extensions={
            theme === "dark"
              ? sharedExtensions
              : [...sharedExtensions, lightTheme]
          }
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
