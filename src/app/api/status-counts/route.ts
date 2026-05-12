import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { STATUS_ORDER, type NoteStatus } from "@/lib/noteStatus";

export async function GET() {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  // Group non-trashed notes by status and count them.
  const groups = await prisma.note.groupBy({
    by: ["status"],
    where: { userId: session.user.id, isTrashed: false },
    _count: { id: true },
  });

  // Build a full record so every status key is always present (even if 0).
  const counts = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, 0])
  ) as Record<NoteStatus, number>;

  for (const g of groups) {
    const key = g.status as NoteStatus;
    if (key in counts) counts[key] = g._count.id;
  }

  return apiSuccess({ counts });
}
