import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { CreateNotebookSchema } from "@/lib/validations/notebook";

export async function GET() {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const notebooks = await prisma.notebook.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return apiSuccess({ notebooks });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const body = await request.json();
  const parsed = CreateNotebookSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Datos inválidos", parsed.error.flatten());
  }

  const notebook = await prisma.notebook.create({
    data: {
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      userId: session.user.id,
    },
  });

  return apiSuccess({ notebook }, 201);
}
