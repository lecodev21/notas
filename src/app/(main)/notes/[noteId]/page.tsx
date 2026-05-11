import { AppShell } from "@/components/layout/AppShell";

interface Props {
  params: Promise<{ noteId: string }>;
}

export default async function NotePage({ params }: Props) {
  const { noteId } = await params;
  return <AppShell initialNoteId={noteId} />;
}
