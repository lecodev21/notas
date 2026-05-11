import { z } from "zod";

export const CreateNotebookSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  parentId: z.string().cuid().optional().nullable(),
});

export const UpdateNotebookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().cuid().optional().nullable(),
});

export type CreateNotebookInput = z.infer<typeof CreateNotebookSchema>;
export type UpdateNotebookInput = z.infer<typeof UpdateNotebookSchema>;
