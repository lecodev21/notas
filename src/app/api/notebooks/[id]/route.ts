import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { UpdateNotebookSchema } from "@/lib/validations/notebook";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
    include: { children: true },
  });

  if (!notebook) return apiError(404, "Notebook no encontrado");
  return apiSuccess({ notebook });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateNotebookSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Datos inválidos", parsed.error.flatten());
  }

  const existing = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return apiError(404, "Notebook no encontrado");

  const notebook = await prisma.notebook.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.parentId !== undefined && { parentId: parsed.data.parentId }),
    },
  });

  return apiSuccess({ notebook });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const existing = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return apiError(404, "Notebook no encontrado");

  // Collect the notebook and all its descendants recursively.
  const allIds = await collectNotebookIds(id, session.user.id);

  // 1. Move every note in these notebooks to the trash.
  await prisma.note.updateMany({
    where: { notebookId: { in: allIds }, userId: session.user.id },
    data: { isTrashed: true, notebookId: null },
  });

  // 2. Detach all notebooks from their parents so the self-referencing FK
  //    doesn't block deletion (SQLite doesn't cascade on this relation).
  await prisma.notebook.updateMany({
    where: { id: { in: allIds }, userId: session.user.id },
    data: { parentId: null },
  });

  // 3. Delete every notebook in the subtree (now safe — no FK references left).
  await prisma.notebook.deleteMany({
    where: { id: { in: allIds }, userId: session.user.id },
  });

  return apiSuccess({ success: true });
}

/** Recursively collect a notebook's ID plus all descendant IDs. */
async function collectNotebookIds(rootId: string, userId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  const children = await prisma.notebook.findMany({
    where: { parentId: rootId, userId },
    select: { id: true },
  });
  for (const child of children) {
    ids.push(...(await collectNotebookIds(child.id, userId)));
  }
  return ids;
}
