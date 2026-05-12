import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";

/** DELETE /api/trash — permanently deletes ALL trashed notes for the current user. */
export async function DELETE() {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { count } = await prisma.note.deleteMany({
    where: { userId: session.user.id, isTrashed: true },
  });

  return apiSuccess({ deleted: count });
}
