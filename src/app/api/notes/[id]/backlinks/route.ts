import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;

  // Get the target note's title
  const targetNote = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    select: { title: true },
  });

  if (!targetNote) return apiError(404, "Nota no encontrada");

  const title = targetNote.title;

  // Find all non-trashed notes (same user) whose body contains [[title]]
  const pattern = `[[${title}]]`;

  const allNotes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isTrashed: false,
      id: { not: id },
      body: { contains: pattern },
    },
    select: { id: true, title: true, body: true, updatedAt: true },
  });

  // Build context snippets (120 chars around the match)
  const backlinks = allNotes.map((note) => {
    const idx = note.body.indexOf(pattern);
    let snippet = "";
    if (idx !== -1) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(note.body.length, idx + pattern.length + 60);
      snippet = note.body.slice(start, end).replace(/\n+/g, " ").trim();
      if (start > 0) snippet = "…" + snippet;
      if (end < note.body.length) snippet = snippet + "…";
    }
    return { id: note.id, title: note.title, snippet, updatedAt: note.updatedAt };
  });

  return apiSuccess({ backlinks });
}
