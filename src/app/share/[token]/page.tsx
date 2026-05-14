import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ShareNoteView } from "@/components/share/ShareNoteView";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const note = await prisma.note.findUnique({
    where: { shareToken: token },
    select: { title: true },
  });
  if (!note) return { title: "Nota no encontrada" };
  return { title: note.title + " · Inkdrop" };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;

  const note = await prisma.note.findUnique({
    where: { shareToken: token },
    select: {
      title: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      isTrashed: true,
    },
  });

  // Treat trashed notes as not found even if the token matches
  if (!note || note.isTrashed) notFound();

  return (
    <ShareNoteView
      title={note.title}
      body={note.body}
      createdAt={note.createdAt.toISOString()}
      updatedAt={note.updatedAt.toISOString()}
    />
  );
}
