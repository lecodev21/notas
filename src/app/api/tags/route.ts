import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { CreateTagSchema } from "@/lib/validations/tag";

export async function GET() {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const tags = await prisma.tag.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { noteTags: true } } },
    orderBy: { name: "asc" },
  });

  return apiSuccess({ tags });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const body = await request.json();
  const parsed = CreateTagSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Datos inválidos", parsed.error.flatten());
  }

  const tag = await prisma.tag.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color,
      userId: session.user.id,
    },
  });

  return apiSuccess({ tag }, 201);
}
