import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { CreateNoteSchema } from "@/lib/validations/note";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { searchParams } = new URL(request.url);
  const notebookId = searchParams.get("notebookId");
  const tag = searchParams.get("tag");
  const pinned = searchParams.get("pinned");
  const trashed = searchParams.get("trashed");

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isTrashed: trashed === "true" ? true : false,
      ...(pinned === "true" && { isPinned: true }),
      ...(notebookId === "none"
        ? { notebookId: null }
        : notebookId
        ? { notebookId }
        : {}),
      ...(tag && {
        noteTags: { some: { tag: { name: tag } } },
      }),
    },
    include: {
      noteTags: {
        include: { tag: true },
      },
      notebook: { select: { id: true, name: true } },
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  });

  return apiSuccess({ notes });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const body = await request.json();
  const parsed = CreateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "Datos inválidos", parsed.error.flatten());
  }

  const { title, body: noteBody, notebookId, tagIds } = parsed.data;

  const note = await prisma.note.create({
    data: {
      title: title ?? "Sin título",
      body: noteBody ?? "",
      userId: session.user.id,
      notebookId: notebookId ?? null,
      ...(tagIds?.length && {
        noteTags: {
          create: tagIds.map((tagId) => ({ tagId })),
        },
      }),
    },
    include: {
      noteTags: { include: { tag: true } },
      notebook: { select: { id: true, name: true } },
    },
  });

  return apiSuccess({ note }, 201);
}
