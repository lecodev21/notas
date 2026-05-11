import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";

const SearchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

interface FTSResult {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
  notebookId: string | null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { searchParams } = new URL(request.url);
  const parsed = SearchSchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return apiError(400, "Parámetros inválidos", parsed.error.flatten());
  }

  const { q, limit, offset } = parsed.data;
  const userId = session.user.id;

  // Use FTS5 for full-text search with BM25 ranking
  // The prefix wildcard (*) enables prefix matching (e.g. "mark" matches "markdown")
  const ftsQuery = q
    .trim()
    .split(/\s+/)
    .map((t) => `${t}*`)
    .join(" ");

  const results = await prisma.$queryRaw<FTSResult[]>`
    SELECT
      n.id,
      n.title,
      n.body,
      n.updatedAt,
      n.notebookId
    FROM notes_fts f
    JOIN "Note" n ON n.id = f.note_id
    WHERE notes_fts MATCH ${ftsQuery}
      AND n.userId = ${userId}
      AND n.isTrashed = 0
    ORDER BY rank
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Generate excerpts with match highlighting
  const withExcerpts = results.map((note) => {
    const lowerBody = note.body.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerBody.indexOf(lowerQ);
    const excerpt =
      idx >= 0
        ? "..." +
          note.body.slice(Math.max(0, idx - 40), idx + 100) +
          "..."
        : note.body.slice(0, 120);
    return { ...note, excerpt };
  });

  return apiSuccess({ results: withExcerpts, total: withExcerpts.length });
}
