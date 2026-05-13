/**
 * markdownToPlainText
 * ─────────────────────────────────────────────────────────────────────────────
 * Strips Markdown syntax and returns readable plain text.
 * Intentionally regex-based (no parser) — fast enough for clipboard operations.
 */
export function markdownToPlainText(md: string): string {
  return md
    // Fenced code blocks → keep code content only
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim())
    // Inline code → keep content
    .replace(/`([^`\n]+)`/g, "$1")
    // ATX headings — strip leading #s
    .replace(/^#{1,6}\s+/gm, "")
    // Setext headings underlines (=== / ---)
    .replace(/^[=\-]{2,}\s*$/gm, "")
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Images → alt text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Links → label text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Reference-style links/images [label][ref]
    .replace(/!?\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    // Bold + italic combined ***text***
    .replace(/\*{3}([^*]+)\*{3}/g, "$1")
    // Bold **text** or __text__
    .replace(/\*{2}([^*]+)\*{2}/g, "$1")
    .replace(/_{2}([^_]+)_{2}/g, "$1")
    // Italic *text* or _text_
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    // Strikethrough ~~text~~
    .replace(/~~([^~]+)~~/g, "$1")
    // Blockquotes — strip leading >
    .replace(/^>\s?/gm, "")
    // GFM task-list items — strip checkbox
    .replace(/^[ \t]{0,3}[-*+]\s+\[[ xX]\]\s+/gm, "")
    // Unordered list markers
    .replace(/^[ \t]{0,3}[-*+]\s+/gm, "")
    // Ordered list markers
    .replace(/^[ \t]{0,3}\d+[.)]\s+/gm, "")
    // Table separator rows (|---|---|)
    .replace(/^\|[-| :]+\|$/gm, "")
    // Table cell pipes → spaces
    .replace(/\|/g, " ")
    // Collapse excess whitespace on each line
    .replace(/[ \t]{2,}/g, " ")
    // Collapse 3+ blank lines → 1 blank line
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
