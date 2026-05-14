import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BulkSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("trash"),
    ids:    z.array(z.string().cuid()).min(1).max(200),
  }),
  z.object({
    action:     z.literal("move"),
    ids:        z.array(z.string().cuid()).min(1).max(200),
    notebookId: z.string().cuid().nullable(),
  }),
  z.object({
    action: z.literal("tag"),
    ids:    z.array(z.string().cuid()).min(1).max(200),
    tagId:  z.string().cuid(),
    mode:   z.enum(["add", "remove"]),
  }),
  z.object({
    action: z.literal("status"),
    ids:    z.array(z.string().cuid()).min(1).max(200),
    status: z.enum(["active", "on_hold", "completed", "dropped"]),
  }),
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  // Verify all notes belong to the current user
  const owned = await prisma.note.findMany({
    where: { id: { in: data.ids }, userId },
    select: { id: true },
  });
  const ownedIds = owned.map((n) => n.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "Sin notas válidas" }, { status: 404 });
  }

  switch (data.action) {
    case "trash":
      await prisma.note.updateMany({
        where: { id: { in: ownedIds } },
        data:  { isTrashed: true, trashedAt: new Date() },
      });
      break;

    case "move":
      // If moving to a notebook, verify it belongs to the user
      if (data.notebookId !== null) {
        const nb = await prisma.notebook.findFirst({
          where: { id: data.notebookId, userId },
        });
        if (!nb) {
          return NextResponse.json({ error: "Notebook no encontrado" }, { status: 404 });
        }
      }
      await prisma.note.updateMany({
        where: { id: { in: ownedIds } },
        data:  { notebookId: data.notebookId },
      });
      break;

    case "tag": {
      const tag = await prisma.tag.findFirst({ where: { id: data.tagId, userId } });
      if (!tag) return NextResponse.json({ error: "Tag no encontrado" }, { status: 404 });

      if (data.mode === "add") {
        await prisma.$transaction(
          ownedIds.map((noteId) =>
            prisma.noteTag.upsert({
              where:  { noteId_tagId: { noteId, tagId: data.tagId } },
              create: { noteId, tagId: data.tagId },
              update: {},
            })
          )
        );
      } else {
        await prisma.noteTag.deleteMany({
          where: { noteId: { in: ownedIds }, tagId: data.tagId },
        });
      }
      break;
    }

    case "status":
      await prisma.note.updateMany({
        where: { id: { in: ownedIds } },
        data:  { status: data.status },
      });
      break;
  }

  return NextResponse.json({ updated: ownedIds.length });
}
