"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js";
import { Children, cloneElement, isValidElement, useRef, useState } from "react";
import type { ReactNode } from "react";
import React from "react";
import { useTheme } from "@/lib/theme";
import { slugify } from "@/lib/outline";
import {
  LuInfo, LuLightbulb, LuTriangleAlert, LuCircleAlert, LuOctagonAlert,
} from "react-icons/lu";

// ── GFM Alerts ────────────────────────────────────────────────────────────────

type AlertType = "NOTE" | "TIP" | "WARNING" | "IMPORTANT" | "CAUTION";

const ALERT_META: Record<AlertType, {
  Icon:  React.ComponentType<{ style?: React.CSSProperties }>;
  color: string;
  bg:    string;
  label: string;
}> = {
  NOTE:      { Icon: LuInfo,          color: "#3b82f6", bg: "rgba(59,130,246,0.08)",  label: "Nota"       },
  TIP:       { Icon: LuLightbulb,     color: "#22c55e", bg: "rgba(34,197,94,0.08)",   label: "Consejo"    },
  IMPORTANT: { Icon: LuCircleAlert,   color: "#a855f7", bg: "rgba(168,85,247,0.08)",  label: "Importante" },
  WARNING:   { Icon: LuTriangleAlert, color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  label: "Atención"   },
  CAUTION:   { Icon: LuOctagonAlert,  color: "#ef4444", bg: "rgba(239,68,68,0.08)",   label: "Precaución" },
};

/** Recursively extracts plain text from a React node tree. */
function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    return extractText(el.props?.children);
  }
  return "";
}

/**
 * Remark plugin: detects `> [!TYPE]` blockquotes, strips the marker paragraph,
 * and adds `data-alert-type="note"` (etc.) to the HAST properties so the
 * custom `blockquote` React component can render it as a styled callout.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remarkAlerts() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(node: any) {
      if (node.type === "blockquote") {
        const first = node.children?.[0];
        if (first?.type === "paragraph") {
          const text = first.children?.[0];
          if (text?.type === "text") {
            // remark joins consecutive `>` lines into one text node separated
            // by \n, so the value might be "[!NOTE]\nContent here".
            // We only check the FIRST line of the text node.
            const rawValue   = text.value as string;
            const firstLine  = rawValue.split("\n")[0];
            const m = firstLine.trim().match(
              /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]$/i
            );
            if (m) {
              const alertType  = m[1].toLowerCase();
              const restOfText = rawValue.slice(firstLine.length + 1); // after \n

              if (restOfText) {
                // Content follows on the same paragraph — keep it but
                // replace the text node with the remaining content.
                first.children = [
                  { ...text, value: restOfText },
                  ...first.children.slice(1),
                ];
                // Leave node.children as-is (first paragraph still present)
              } else if (first.children.length <= 1) {
                // Whole paragraph was just [!TYPE] — remove it entirely.
                node.children = node.children.slice(1);
              } else {
                // Other children exist (break nodes, etc.) — drop first text node.
                first.children = first.children.slice(1);
              }

              node.data = node.data ?? {};
              node.data.hProperties = {
                ...node.data.hProperties,
                "data-alert-type": alertType,
              };
            }
          }
        }
      }
      if (Array.isArray(node.children)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node.children.forEach((child: any) => walk(child));
      }
    }
    walk(tree);
  };
}

function AlertBlock({ type, children }: { type: AlertType; children: ReactNode }) {
  const { Icon, color, bg, label } = ALERT_META[type];
  return (
    <div
      className="my-4 not-prose"
      style={{
        borderLeft:      `4px solid ${color}`,
        borderRadius:    "0 6px 6px 0",
        backgroundColor: bg,
        padding:         "10px 16px",
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <Icon style={{ width: 14, height: 14, color, flexShrink: 0 }} />
        <span style={{
          fontSize:      11,
          fontWeight:    700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color,
        }}>
          {label}
        </span>
      </div>
      {/* Content — rendered in a prose sub-context so inline formatting works */}
      <div className="prose prose-sm max-w-none" style={{ color: "var(--app-text-secondary)" }}>
        {children}
      </div>
    </div>
  );
}

// ── Language alias map ─────────────────────────────────────────────────────
// Maps common shorthands to the name highlight.js registers the language under.
// hljs already handles many aliases internally (py→python, js→javascript…),
// but this map adds extra shorthands and normalises casing before the lookup.
const LANG_ALIASES: Record<string, string> = {
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
  mdx:      "markdown",
  tf:       "hcl",           // Terraform
  dockerfile: "dockerfile",
  node:     "javascript",
};

/** Returns the hljs language id for `lang`, or "" if unknown/still-being-typed. */
function resolveLanguage(lang: string): string {
  const key = lang.toLowerCase();
  const resolved = LANG_ALIASES[key] ?? key;
  return hljs.getLanguage(resolved) ? resolved : "";
}

interface MarkdownPreviewProps {
  content: string;
  /** Called with the 0-based index of the toggled task checkbox. */
  onToggleTask?: (taskIndex: number) => void;
  /** Notes available for resolving [[wiki links]] */
  availableNotes?: { id: string; title: string }[];
  /** Called when a [[wiki link]] is clicked, with the linked title */
  onWikiLinkClick?: (title: string) => void;
}

export function MarkdownPreview({ content, onToggleTask, availableNotes: _availableNotes, onWikiLinkClick }: MarkdownPreviewProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // ── Interactive task checkboxes ────────────────────────────────────────────
  // Key constraints:
  //  1. `components` must be a stable object reference — if it changes every
  //     render React treats `input` as a new component type, unmounts/remounts
  //     the checkboxes and breaks click interactions.
  //  2. We can't use a render-time counter for the index because React StrictMode
  //     double-invokes components in development, causing indices to be off.
  //
  // Solution: create `components` once with useState, use refs for the callback,
  // and calculate the checkbox index from the DOM at click time (not render time).

  // Always points to the latest onToggleTask prop.
  const onToggleRef   = useRef(onToggleTask);
  onToggleRef.current = onToggleTask;

  // Always points to the latest onWikiLinkClick prop.
  const onWikiLinkClickRef   = useRef(onWikiLinkClick);
  onWikiLinkClickRef.current = onWikiLinkClick;

  // Ref to the prose wrapper so we can querySelectorAll checkboxes inside it.
  const containerRef = useRef<HTMLDivElement>(null);

  // Created once; closes over stable ref objects (not over prop values).
  const [components] = useState(() => {
    // ── Table checkbox helper ──────────────────────────────────────────────
    // Renders a single [ ]/[x] found inside a table cell.  Uses the same
    // containerRef + onToggleRef pattern as the task-list input so indices
    // stay consistent across the whole document.
    const TableCheckbox = ({ checked }: { checked: boolean }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const cbRef = useRef<HTMLInputElement>(null);
      return (
        <input
          ref={cbRef}
          type="checkbox"
          checked={checked}
          disabled={!onToggleRef.current}
          onChange={() => {
            if (!cbRef.current || !containerRef.current) return;
            const all = Array.from(
              containerRef.current.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
            );
            const idx = all.indexOf(cbRef.current);
            if (idx !== -1) onToggleRef.current?.(idx);
          }}
          style={{
            cursor:        onToggleRef.current ? "pointer" : "default",
            accentColor:   "#6366f1",
            width:         "0.9em",
            height:        "0.9em",
            marginRight:   "0.3em",
            verticalAlign: "middle",
            flexShrink:    0,
          }}
        />
      );
    };

    // Recursively walk React children and replace `[ ]`/`[x]` text patterns
    // with <TableCheckbox> elements.  Handles plain strings, arrays, and
    // arbitrarily nested React elements (e.g. bold text inside a cell).
    function processNode(node: ReactNode): ReactNode {
      if (typeof node === "string") {
        const parts = node.split(/(\[[ xX]\])/);
        if (parts.length === 1) return node;
        return parts.map((part, i) => {
          if (part === "[ ]")          return <TableCheckbox key={i} checked={false} />;
          if (/^\[[xX]\]$/.test(part)) return <TableCheckbox key={i} checked={true}  />;
          return part || null;
        });
      }
      if (Array.isArray(node)) {
        return node.map((child, i) => {
          const result = processNode(child);
          // Re-key the result if it's a valid element to avoid React warnings
          return isValidElement(result)
            ? cloneElement(result, { key: (result.key ?? i) })
            : result;
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (isValidElement(node) && (node as any).props?.children != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const el = node as React.ReactElement<any>;
        return cloneElement(el, {}, processNode(el.props.children));
      }
      return node;
    }

    return {
    // ── Tables ──────────────────────────────────────────────────────────────
    // remark-gfm passes `style={{ textAlign }}` to th/td for column alignment
    // (`:---`, `:---:`, `---:`).  We forward that single property and apply
    // our own visual styles on top using CSS variables so both themes work.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: ({ children }: any) => (
      <div className="md-table">
        <table>
          {children}
        </table>
      </div>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thead: ({ children }: any) => <thead>{children}</thead>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tr: ({ children }: any) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [hovered, setHovered] = useState(false);
      return (
        <tr
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ backgroundColor: hovered ? "var(--app-hover)" : undefined }}
        >
          {children}
        </tr>
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    th: ({ children, style }: any) => (
      <th style={{
        padding:       "9px 14px",
        textAlign:     (style as React.CSSProperties)?.textAlign ?? "left",
        fontWeight:    600,
        fontSize:      "0.7rem",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color:         "#6366f1",
        borderBottom:  "1px solid var(--app-border-strong)",
        whiteSpace:    "nowrap",
      }}>
        {children}
      </th>
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    td: ({ children, style }: any) => (
      <td style={{
        padding:       "9px 14px",
        textAlign:     (style as React.CSSProperties)?.textAlign ?? "left",
        color:         "var(--app-text-secondary)",
        borderBottom:  "1px solid var(--app-border)",
        verticalAlign: "top",
      }}>
        {processNode(children)}
      </td>
    ),

    // ── Input (task checkboxes) ──────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: ({ type, checked }: any) => {
      // Each rendered checkbox gets its own DOM ref.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const cbRef = useRef<HTMLInputElement>(null);
      if (type !== "checkbox") return <input type={type} />;
      return (
        <input
          ref={cbRef}
          type="checkbox"
          checked={!!checked}
          disabled={!onToggleRef.current}
          onChange={() => {
            if (!cbRef.current || !containerRef.current) return;
            // Find the index of this checkbox among all checkboxes in the container.
            // Doing this at click time avoids any render-order / StrictMode issues.
            const all = Array.from(
              containerRef.current.querySelectorAll<HTMLInputElement>(
                'input[type="checkbox"]'
              )
            );
            const idx = all.indexOf(cbRef.current);
            if (idx !== -1) onToggleRef.current?.(idx);
          }}
          style={{
            cursor:        onToggleRef.current ? "pointer" : "default",
            accentColor:   "#6366f1",
            width:         "0.9em",
            height:        "0.9em",
            marginRight:   "0.35em",
            verticalAlign: "middle",
            flexShrink:    0,
          }}
        />
      );
    },
    // ── Task list items ──────────────────────────────────────────────────────
    // For `- [x] text`, remark-gfm renders:
    //   <li class="task-list-item"><input checked> text…</li>
    // We separate the checkbox (first child) from the text (rest) so we can
    // apply strikethrough + opacity to the text without affecting the checkbox.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    li: ({ node, children, className, ...props }: any) => {
      if (className !== "task-list-item") {
        return <li className={className} {...props}>{children}</li>;
      }

      // Read checked state from the HAST node (reliable, no render-order issues)
      const isChecked = node?.children?.[0]?.properties?.checked === true;
      const all       = Children.toArray(children);
      const checkbox  = all[0];   // the <input> rendered by our custom component
      const text      = all.slice(1);

      return (
        <li className={className} style={{ listStyle: "none" }} {...props}>
          {checkbox}
          <span
            style={isChecked ? {
              opacity:        0.45,
              textDecoration: "line-through",
              textDecorationColor: "currentColor",
            } : undefined}
          >
            {text}
          </span>
        </li>
      );
    },
    // ── Fenced code blocks ───────────────────────────────────────────────────
    // We bypass rehype-highlight (which fights Tailwind Typography specificity)
    // and call highlight.js directly.  `not-prose` removes Tailwind's overrides
    // so our .hljs-* CSS rules apply cleanly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre: ({ children }: any) => {
      // The direct child is always the <code> element rendered by react-markdown
      const codeEl = Children.toArray(children).find(isValidElement) as
        | React.ReactElement<{ className?: string; children?: ReactNode }>
        | undefined;

      const className = codeEl?.props?.className ?? "";
      const lang      = /language-(\w+)/.exec(className)?.[1] ?? "";
      const raw       = String(codeEl?.props?.children ?? "").replace(/\n$/, "");

      // Resolve alias ("py" → "python", "ts" → "typescript", …) and verify
      // hljs knows it before highlighting — avoids console errors while the
      // user is still typing the language name (e.g. "p", "pyt"…).
      const knownLang = resolveLanguage(lang);
      const html = knownLang
        ? hljs.highlight(raw, { language: knownLang, ignoreIllegals: true }).value
        : hljs.highlightAuto(raw).value;

      // Label: resolved alias lowercase (e.g. "py" → "python"), or "code" as
      // fallback when no language is specified in the fence.
      const label = lang
        ? (LANG_ALIASES[lang.toLowerCase()] ?? knownLang ?? lang).toLowerCase()
        : "code";

      return (
        <div className="not-prose hljs-block">
          {/* ── Language bar — always shown; falls back to "code" ──────── */}
          <div className="hljs-lang-bar">
            <span className="hljs-lang-label">{label}</span>
          </div>
          {/* ── Code ───────────────────────────────────────────────────── */}
          <pre className="hljs-pre">
            <code
              className={`hljs${lang ? ` language-${lang}` : ""}`}
              // highlight.js output is safe: it HTML-escapes the source before
              // wrapping tokens in <span> elements.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </pre>
        </div>
      );
    },
    // ── Wiki links ───────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: ({ href, children }: any) => {
      if (href?.startsWith("wiki://")) {
        const title = decodeURIComponent(href.slice(7));
        return (
          <button
            onClick={() => onWikiLinkClickRef.current?.(title)}
            style={{
              color:           "#6366f1",
              textDecoration:  "underline",
              cursor:          "pointer",
              background:      "none",
              border:          "none",
              padding:         0,
              font:            "inherit",
            }}
          >
            {children}
          </button>
        );
      }
      return <a href={href}>{children}</a>;
    },
    // ── Alert blockquotes ─────────────────────────────────────────────────
    // The remarkAlerts plugin strips [!TYPE] from the AST and sets
    // data-alert-type="note" on the HAST node, which arrives here as a prop.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockquote: ({ children, ...props }: any) => {
      const alertType = props["data-alert-type"] as string | undefined;
      if (alertType) {
        const type = alertType.toUpperCase() as AlertType;
        if (type in ALERT_META) {
          return <AlertBlock type={type}>{children}</AlertBlock>;
        }
      }
      return <blockquote>{children}</blockquote>;
    },

    // ── Headings with IDs (for outline scroll targets) ──────────────────────
    // Each heading receives an id derived from its text so OutlineView can
    // scroll to it.  The slugify function is shared with parseHeadings so the
    // IDs always match — deduplication is handled by MarkdownPreview by
    // tracking a per-render seen map via ref.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h1: ({ children }: any) => <h1 id={slugify(String(children))}>{children}</h1>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h2: ({ children }: any) => <h2 id={slugify(String(children))}>{children}</h2>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h3: ({ children }: any) => <h3 id={slugify(String(children))}>{children}</h3>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h4: ({ children }: any) => <h4 id={slugify(String(children))}>{children}</h4>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h5: ({ children }: any) => <h5 id={slugify(String(children))}>{children}</h5>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    h6: ({ children }: any) => <h6 id={slugify(String(children))}>{children}</h6>,
    } as {
      input:      React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li:         React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table:      React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thead:      React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tbody:      React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tr:         React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      th:         React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      td:         React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pre:        React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      a:          React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blockquote: React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h1: React.ComponentType<any>; h2: React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h3: React.ComponentType<any>; h4: React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h5: React.ComponentType<any>; h6: React.ComponentType<any>;
    };
  });

  const proseClass = [
    "prose prose-sm max-w-none",
    isDark
      ? [
          "prose-invert",
          "prose-headings:text-gray-100 prose-headings:font-semibold",
          "prose-p:text-gray-300 prose-p:leading-relaxed",
          "prose-strong:text-white",
          "prose-code:text-indigo-300 prose-code:bg-white/8 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono",
          "prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10",
          "prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400",
          "prose-a:text-indigo-400 hover:prose-a:text-indigo-300",
          "prose-li:text-gray-300",
          "prose-hr:border-white/10",
          "prose-th:text-gray-200 prose-td:text-gray-300",
        ].join(" ")
      : [
          "prose-stone",
          "prose-headings:text-stone-900 prose-headings:font-semibold",
          "prose-p:text-stone-700 prose-p:leading-relaxed",
          "prose-strong:text-stone-900",
          "prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono",
          "prose-pre:bg-stone-100 prose-pre:border prose-pre:border-stone-200",
          "prose-blockquote:border-indigo-400 prose-blockquote:text-stone-500",
          "prose-a:text-indigo-600 hover:prose-a:text-indigo-500",
          "prose-li:text-stone-700",
          "prose-hr:border-stone-200",
          "prose-th:text-stone-800 prose-td:text-stone-700",
        ].join(" "),
  ].join(" ");

  // Preprocess [[Title]] wiki links into standard markdown links with wiki:// scheme
  const processedContent = content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, title) => `[${title}](wiki://${encodeURIComponent(title)})`
  );

  return (
    <div className="px-6 py-4">
      <div ref={containerRef} className={proseClass}>
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkAlerts]}
            components={components}
            urlTransform={(url) => url}
          >
            {processedContent}
          </ReactMarkdown>
        ) : (
          <p style={{ color: "var(--app-text-faint)" }} className="italic">
            Nada que previsualizar...
          </p>
        )}
      </div>
    </div>
  );
}
