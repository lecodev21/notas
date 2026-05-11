import { z } from "zod";

export const CreateNoteSchema = z.object({
  title: z.string().max(255).optional(),
  body: z.string().optional(),
  notebookId: z.string().cuid().optional().nullable(),
  tagIds: z.array(z.string().cuid()).optional(),
});

export const UpdateNoteSchema = z.object({
  title: z.string().max(255).optional(),
  body: z.string().optional(),
  notebookId: z.string().cuid().optional().nullable(),
  tagIds: z.array(z.string().cuid()).optional(),
  isPinned: z.boolean().optional(),
  isTrashed: z.boolean().optional(),
});

export type CreateNoteInput = z.infer<typeof CreateNoteSchema>;
export type UpdateNoteInput = z.infer<typeof UpdateNoteSchema>;
