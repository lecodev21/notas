/**
 * parseFrontmatter
 * ─────────────────────────────────────────────────────────────────────────────
 * Parses the YAML front matter block from a Markdown string.
 *
 * Supported front-matter fields
 * ─────────────────────────────
 *   title:    string
 *   notebook: string
 *   tags:     comma-separated inline  ← tags: work, urgent
 *             OR YAML bracket list    ← tags: [work, urgent]
 *             OR YAML block list      ← tags:\n  - work\n  - urgent
 *   date:     ISO-8601 date string (parsed but not applied — API does not
 *             support back-dating createdAt)
 *
 * Files without a front-matter block are returned with an empty `frontmatter`
 * object and the full content as `body`.
 */

export interface FrontmatterData {
  title?:    string;
  notebook?: string;
  tags?:     string[];
  date?:     string;
}

export interface ParsedMarkdown {
  frontmatter: FrontmatterData;
  body:        string;
}

export function parseFrontmatter(content: string): ParsedMarkdown {
  // Strip UTF-8 BOM if present
  const text = content.replace(/^﻿/, "");

  // Front matter must start at byte 0 with ---\n or ---\r\n
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: {}, body: text };
  }

  const lines = text.split(/\r?\n/);

  // Find closing --- on its own line (must be line 1 or later)
  let closingLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingLine = i;
      break;
    }
  }

  if (closingLine === -1) {
    return { frontmatter: {}, body: text };
  }

  const yamlLines = lines.slice(1, closingLine);
  const body      = lines.slice(closingLine + 1).join("\n").replace(/^\n+/, "");

  return { frontmatter: parseYaml(yamlLines), body };
}

// ── Minimal YAML parser ───────────────────────────────────────────────────────

function parseYaml(lines: string[]): FrontmatterData {
  const result: FrontmatterData = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank / comment lines
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const colon = line.indexOf(":");
    if (colon === -1) { i++; continue; }

    const key      = line.slice(0, colon).trim().toLowerCase();
    const rawValue = line.slice(colon + 1).trim();

    switch (key) {
      case "title":
        if (rawValue) result.title = unquote(rawValue);
        break;

      case "notebook":
        if (rawValue) result.notebook = unquote(rawValue);
        break;

      case "date":
        if (rawValue) result.date = rawValue;
        break;

      case "tags": {
        if (rawValue) {
          // Inline:  tags: work, urgent   OR   tags: [work, urgent]
          const v = rawValue.replace(/^\[/, "").replace(/\]$/, "");
          result.tags = v
            .split(",")
            .map((t) => unquote(t.trim()))
            .filter(Boolean);
        } else {
          // Block list:
          //   tags:
          //     - work
          //     - urgent
          const tagList: string[] = [];
          i++;
          while (i < lines.length) {
            const m = lines[i].match(/^\s*-\s+(.+)$/);
            if (!m) break;
            tagList.push(unquote(m[1].trim()));
            i++;
          }
          if (tagList.length) result.tags = tagList;
          continue; // i already advanced inside the inner loop
        }
        break;
      }
    }

    i++;
  }

  return result;
}

function unquote(s: string): string {
  if (s.length >= 2) {
    const first = s[0], last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}
