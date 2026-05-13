/**
 * exportNote
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side export utilities: Markdown (.md), HTML (.html), PDF (print).
 * All functions must be called from a user gesture (button click) so that
 * popup blockers and clipboard permissions don't interfere.
 */

import { marked } from "marked";
import remarkGfm from "remark-gfm"; // kept for future use; rendering via marked

// Configure marked once: GFM + line breaks
marked.setOptions({ gfm: true, breaks: false });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sanitise a note title so it can be used as a filename. */
function toFilename(title: string): string {
  return (title.trim() || "nota")
    .replace(/[\\/:*?"<>|]/g, "-")   // Windows-forbidden chars
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

/** Trigger a file download in the browser. */
function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── GitHub-inspired CSS for HTML / PDF ───────────────────────────────────────
const EXPORT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.7;
    color: #24292f;
    background: #ffffff;
    max-width: 820px;
    margin: 40px auto;
    padding: 0 24px 60px;
  }
  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    margin: 28px 0 12px;
    line-height: 1.3;
  }
  h1 { font-size: 2em;   border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
  h3 { font-size: 1.25em; }
  h4 { font-size: 1em; }
  p  { margin: 0 0 16px; }
  a  { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  strong { font-weight: 600; }
  em     { font-style: italic; }
  del    { text-decoration: line-through; color: #6e7781; }
  code {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: .9em;
    background: #f6f8fa;
    padding: 2px 6px;
    border-radius: 4px;
  }
  pre {
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 16px;
    overflow: auto;
    margin: 0 0 16px;
  }
  pre code { background: none; padding: 0; font-size: .875em; }
  blockquote {
    border-left: 4px solid #d0d7de;
    color: #57606a;
    margin: 0 0 16px;
    padding: 4px 16px;
  }
  blockquote p { margin: 0; }
  ul, ol { margin: 0 0 16px; padding-left: 2em; }
  li { margin: 4px 0; }
  li input[type="checkbox"] { margin-right: 6px; }
  hr { border: none; border-top: 1px solid #d0d7de; margin: 24px 0; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0 0 16px;
    display: block;
    overflow: auto;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 8px 14px;
    text-align: left;
  }
  th { background: #f6f8fa; font-weight: 600; }
  tr:nth-child(even) td { background: #f6f8fa; }
  @media print {
    body { margin: 0; padding: 20px; max-width: 100%; }
    a    { color: #24292f; }
    pre  { white-space: pre-wrap; word-break: break-word; }
  }
`;

/** Build a complete HTML document wrapping the rendered body. */
function buildHtmlDoc(title: string, bodyHtml: string): string {
  const escaped = title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escaped}</title>
  <style>${EXPORT_CSS}</style>
</head>
<body>
  <h1>${escaped}</h1>
  ${bodyHtml}
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Export the raw Markdown body as a .md file. */
export function exportAsMarkdown(title: string, body: string) {
  download(`${toFilename(title)}.md`, body, "text/markdown;charset=utf-8");
}

/** Render Markdown to HTML and export as a standalone .html file. */
export async function exportAsHtml(title: string, body: string) {
  const bodyHtml = await marked.parse(body);
  const doc      = buildHtmlDoc(title, bodyHtml);
  download(`${toFilename(title)}.html`, doc, "text/html;charset=utf-8");
}

/**
 * Export as PDF by opening a print-ready window and triggering the browser's
 * native print dialog (File → Save as PDF).  No extra library needed — the
 * browser produces a properly paginated PDF.
 */
export async function exportAsPdf(title: string, body: string) {
  const bodyHtml = await marked.parse(body);
  const doc      = buildHtmlDoc(title, bodyHtml);

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("El navegador bloqueó la ventana emergente. Permite los pop-ups para exportar como PDF.");
    return;
  }

  win.document.write(doc);
  win.document.close();

  // Wait for resources (fonts, images) then print
  win.onload = () => {
    win.focus();
    win.print();
    // Close after print dialog is dismissed
    win.onafterprint = () => win.close();
  };
}
