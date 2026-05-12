import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { UpdateNoteSchema } from "@/lib/validations/note";

type Params = { params: Promise<{ id: string }> };

const noteInclude = {
  noteTags: { include: { tag: true } },
  notebook: { select: { id: true, name: true } },
};

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    include: noteInclude,
  });

  if (!note) return apiError(404, "Nota no encontrada");
  return apiSuccess({ note });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Datos inválidos", parsed.error.flatten());
  }

  const existing = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return apiError(404, "Nota no encontrada");

  const { tagIds, notebookId, ...rest } = parsed.data;

  // Keep trashedAt in sync with isTrashed:
  //   • moving to trash  → stamp trashedAt = now (only if not already set)
  //   • restoring        → clear trashedAt
  const trashedAtPatch =
    rest.isTrashed === true  ? { trashedAt: existing.trashedAt ?? new Date() } :
    rest.isTrashed === false ? { trashedAt: null }                             :
    {};

  const note = await prisma.$transaction(async (tx) => {
    // Update tags atomically if provided
    if (tagIds !== undefined) {
      await tx.noteTag.deleteMany({ where: { noteId: id } });
      if (tagIds.length > 0) {
        await tx.noteTag.createMany({
          data: tagIds.map((tagId) => ({ noteId: id, tagId })),
        });
      }
    }

    return tx.note.update({
      where: { id },
      data: {
        ...rest,
        ...trashedAtPatch,
        ...(notebookId !== undefined && { notebookId }),
      },
      include: noteInclude,
    });
  });

  return apiSuccess({ note });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const existing = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return apiError(404, "Nota no encontrada");

  await prisma.note.delete({ where: { id } });
  return apiSuccess({ success: true });
}
