import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

/** Generate a new token or replace the existing one (regenerate). */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;

  const existing = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) return apiError(404, "Nota no encontrada");

  // 12 random bytes → 16-char base64url string (URL-safe, no padding)
  const shareToken = randomBytes(12).toString("base64url");

  const note = await prisma.note.update({
    where: { id },
    data: { shareToken },
    select: { shareToken: true },
  });

  return apiSuccess({ shareToken: note.shareToken });
}

/** Revoke the public link (set shareToken = null). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  const { id } = await params;

  const existing = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) return apiError(404, "Nota no encontrada");

  await prisma.note.update({
    where: { id },
    data: { shareToken: null },
  });

  return apiSuccess({ success: true });
}
