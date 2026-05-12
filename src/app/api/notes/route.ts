import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";
import { CreateNoteSchema } from "@/lib/validations/note";
import { DEFAULT_VISIBLE_STATUSES, type NoteStatus } from "@/lib/noteStatus";

const TRASH_TTL_DAYS = 30;

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { searchParams } = new URL(request.url);
  const notebookId = searchParams.get("notebookId");
  const tag = searchParams.get("tag");
  const pinned = searchParams.get("pinned");
  const trashed = searchParams.get("trashed");
  const status = searchParams.get("status") as NoteStatus | null;

  // Auto-purge: permanently delete trashed notes older than TRASH_TTL_DAYS.
  // Runs on every request to the notes list — cheap because the WHERE clause
  // uses an index and usually matches zero rows.
  if (trashed === "true") {
    const cutoff = new Date(Date.now() - TRASH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.note.deleteMany({
      where: {
        userId: session.user.id,
        isTrashed: true,
        trashedAt: { lte: cutoff },
      },
    });
  }

  // Status filter:
  //   • If a specific status is requested → show only that status.
  //   • Global views (no notebook/tag) → hide Completed and Dropped by default
  //     so the day-to-day list stays clean and focused.
  //   • Notebook / tag views → show ALL statuses so notes don't disappear
  //     when their status changes; the notebook is the source of truth there.
  //   • Trashed notes are never filtered by status.
  const isContextualView = !!(notebookId || tag);
  const statusFilter =
    trashed === "true"
      ? {}
      : status
      ? { status }
      : isContextualView
      ? {}
      : { status: { in: DEFAULT_VISIBLE_STATUSES } };

  const notes = await prisma.note.findMany({
    where: {
      userId: session.user.id,
      isTrashed: trashed === "true" ? true : false,
      ...statusFilter,
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
