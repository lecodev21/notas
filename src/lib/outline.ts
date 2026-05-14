export interface OutlineItem {
  id: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  /** 0-based line index in the original markdown — used for editor scroll */
  lineIndex: number;
}

/** Convert heading text to a URL-safe slug (same algorithm used for rendered IDs). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "heading";
}

/** Parse all ATX headings from a markdown string. Deduplicates IDs automatically.
 *  Lines inside fenced code blocks (``` or ~~~) are skipped so bash/shell
 *  comments like `# install deps` never appear in the outline. */
export function parseHeadings(markdown: string): OutlineItem[] {
  const lines = markdown.split("\n");
  const seen = new Map<string, number>();
  const result: OutlineItem[] = [];
  let insideFence = false;
  let fenceChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect opening / closing of a fenced code block (``` or ~~~, optional lang tag)
    const fenceMatch = /^(`{3,}|~{3,})/.exec(line.trimStart());
    if (fenceMatch) {
      const marker = fenceMatch[1][0]; // ` or ~
      if (!insideFence) {
        insideFence = true;
        fenceChar = marker;
      } else if (marker === fenceChar) {
        insideFence = false;
        fenceChar = "";
      }
      continue;
    }

    // Skip everything inside a code block
    if (insideFence) continue;

    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!match) continue;
    const level = match[1].length as 1 | 2 | 3 | 4 | 5 | 6;
    const text = match[2].trim();
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    const id = count === 0 ? base : `${base}-${count}`;
    seen.set(base, count + 1);
    result.push({ id, level, text, lineIndex: i });
  }

  return result;
}
