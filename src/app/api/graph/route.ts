import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const notes = await prisma.note.findMany({
    where: { userId: session.user.id, isTrashed: false },
    select: { id: true, title: true, body: true },
  });

  // Build title → id map (case-insensitive key)
  const titleMap = new Map<string, string>();
  for (const note of notes) {
    titleMap.set(note.title.toLowerCase(), note.id);
  }

  // Extract [[Title]] patterns from each note body
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const edgeSet = new Set<string>();
  const linkCountMap = new Map<string, number>();

  // Initialize counts
  for (const note of notes) {
    linkCountMap.set(note.id, 0);
  }

  const edges: { source: string; target: string }[] = [];

  for (const note of notes) {
    let match: RegExpExecArray | null;
    const seen = new Set<string>(); // deduplicate edges per source note
    while ((match = wikiLinkRegex.exec(note.body)) !== null) {
      const linkedTitle = match[1].trim();
      const targetId = titleMap.get(linkedTitle.toLowerCase());
      if (!targetId || targetId === note.id) continue;

      const edgeKey = `${note.id}→${targetId}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);

      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ source: note.id, target: targetId });
        // Increment link count for the target (it receives a link)
        linkCountMap.set(targetId, (linkCountMap.get(targetId) ?? 0) + 1);
        // Also count outgoing links for source
        linkCountMap.set(note.id, (linkCountMap.get(note.id) ?? 0) + 1);
      }
    }
    // Reset regex lastIndex after use in a for-of loop
    wikiLinkRegex.lastIndex = 0;
  }

  const nodes = notes.map((note) => ({
    id: note.id,
    title: note.title,
    linkCount: linkCountMap.get(note.id) ?? 0,
  }));

  return apiSuccess({ nodes, edges });
}
