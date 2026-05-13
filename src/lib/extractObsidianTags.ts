/**
 * Extracts Obsidian-style inline tags (#tagname) from a Markdown body.
 *
 * Rules:
 *  - Skips fenced code blocks (``` or ~~~)
 *  - Skips inline code (`...`)
 *  - Does NOT match Markdown headings ("# Heading" has a space after #)
 *  - Does NOT match URL fragments ("/path#anchor" is preceded by /)
 *  - Handles nested Obsidian tags like #trabajo/backend
 *  - Cleans up blank lines left behind after removal
 *
 * Returns the extracted tag names (lowercase, without #) and the cleaned body.
 */
export function extractObsidianTags(body: string): {
  tags: string[];
  cleanBody: string;
} {
  const found = new Map<string, string>(); // lowercase → original casing (first wins)

  // Inline tag pattern:
  //   (?<![#\w/])   not preceded by #, word char, or /  → avoids ##headings and URL #anchors
  //   #             the hash
  //   ([a-zA-Z...]) tag must start with a Unicode letter (not a digit or symbol)
  //   [...]*)       letters, digits, underscores, hyphens, slashes (nested tags)
  //   (?![#\w])     not followed by word char or # → no partial matches
  const TAG_RE =
    /(?<![#\w/])#([a-zA-ZÀ-ÿĀ-ſ][a-zA-ZÀ-ÿĀ-ſ0-9_\-/]*)(?![#\w])/g;

  let inFencedCode = false;
  const lines = body.split("\n");
  const processedLines: string[] = [];

  for (const line of lines) {
    // Toggle fenced code block on ``` or ~~~ fence lines
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inFencedCode = !inFencedCode;
      processedLines.push(line);
      continue;
    }

    if (inFencedCode) {
      processedLines.push(line);
      continue;
    }

    // Temporarily replace inline code spans to protect them
    const codeSegments: string[] = [];
    let processed = line.replace(/`[^`\n]+`/g, (match) => {
      codeSegments.push(match);
      return `\x00C${codeSegments.length - 1}\x00`;
    });

    // Extract inline tags and remove them from the line
    TAG_RE.lastIndex = 0;
    processed = processed.replace(TAG_RE, (_, name: string) => {
      const key = name.toLowerCase();
      if (!found.has(key)) found.set(key, name); // preserve first-seen casing
      return "";
    });

    // Restore inline code spans
    codeSegments.forEach((seg, i) => {
      processed = processed.replace(`\x00C${i}\x00`, seg);
    });

    processedLines.push(processed);
  }

  // Clean up:
  //  1. Trim trailing whitespace on each line (tags may leave trailing spaces)
  //  2. Collapse 3+ consecutive blank lines to at most 2
  //  3. Trim the whole result
  const cleanBody = processedLines
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    tags: Array.from(found.values()), // original casing
    cleanBody,
  };
}
