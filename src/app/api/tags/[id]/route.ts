import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { UpdateTagSchema } from "@/lib/validations/tag";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateTagSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Datos inválidos", parsed.error.flatten());
  }

  const existing = await prisma.tag.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return apiError(404, "Tag no encontrado");

  const tag = await prisma.tag.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.color !== undefined && { color: parsed.data.color }),
    },
  });

  return apiSuccess({ tag });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;
  const existing = await prisma.tag.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return apiError(404, "Tag no encontrado");

  await prisma.tag.delete({ where: { id } });
  return apiSuccess({ success: true });
}
