import { z } from "zod";

export const CreateTagSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (formato #rrggbb)")
    .optional(),
});

export const UpdateTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido (formato #rrggbb)")
    .optional(),
});

export type CreateTagInput = z.infer<typeof CreateTagSchema>;
export type UpdateTagInput = z.infer<typeof UpdateTagSchema>;
