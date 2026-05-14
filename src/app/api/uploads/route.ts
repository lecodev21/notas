import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { apiError, apiSuccess } from "@/lib/api-response";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const EXT_MAP: Record<string, string> = {
  "image/jpeg":   "jpg",
  "image/jpg":    "jpg",
  "image/png":    "png",
  "image/gif":    "gif",
  "image/webp":   "webp",
  "image/svg+xml":"svg",
  "image/avif":   "avif",
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return apiError(401, "No autorizado");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(400, "Solicitud inválida");
  }

  const file = formData.get("file") as File | null;
  if (!file) return apiError(400, "No se proporcionó ningún archivo");
  if (!file.type.startsWith("image/")) return apiError(400, "Solo se permiten imágenes");
  if (file.size > MAX_SIZE) return apiError(400, "El archivo supera el límite de 10 MB");

  const ext = EXT_MAP[file.type] ?? "png";
  const filename = `${randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(
    path.join(uploadDir, filename),
    Buffer.from(await file.arrayBuffer()),
  );

  return apiSuccess({ url: `/uploads/${filename}` });
}
