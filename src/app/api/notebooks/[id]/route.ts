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

  await prisma.notebook.delete({ where: { id } });
  return apiSuccess({ success: true });
}
