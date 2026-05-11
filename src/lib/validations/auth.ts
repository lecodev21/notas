import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.email("Email inválido"),
  name: z.string().min(1, "El nombre es requerido").max(100).optional(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const LoginSchema = z.object({
  email: z.email("Email inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
