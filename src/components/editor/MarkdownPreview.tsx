"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Children, cloneElement, isValidElement, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";

// Stable reference — prevents ReactMarkdown from treating this as a new plugin
// on every render (which would unmount/remount code blocks causing flicker).
const rehypePlugins: Parameters<typeof ReactMarkdown>[0]["rehypePlugins"] = [
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
];

interface MarkdownPreviewProps {
  content: string;
  /** Called with the 0-based index of the toggled task checkbox. */
  onToggleTask?: (taskIndex: number) => void;
}

export function MarkdownPreview({ content, onToggleTask }: MarkdownPreviewProps) {
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
    } as {
      input:  React.ComponentType<React.InputHTMLAttributes<HTMLInputElement>>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      li:     React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table:  React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thead:  React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tbody:  React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tr:     React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      th:     React.ComponentType<any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      td:     React.ComponentType<any>;
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

  return (
    <div className="px-6 py-4">
      <div ref={containerRef} className={proseClass}>
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={components}
          >
            {content}
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
