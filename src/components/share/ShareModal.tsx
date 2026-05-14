"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ShareModalProps {
  noteId: string;
  noteTitle: string;
  initialToken: string | null;
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "loading" | "error";

export function ShareModal({
  noteId,
  noteTitle,
  initialToken,
  open,
  onClose,
}: ShareModalProps) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);

  const shareUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${token}`
      : null;

  async function generate() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/notes/${noteId}/share`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setToken(json.shareToken as string);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  async function revoke() {
    setStatus("loading");
    try {
      const res = await fetch(`/api/notes/${noteId}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      setToken(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the input
    }
  }

  const busy = status === "loading";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compartir nota"
    >
      <div className="space-y-4">
        {/* Note title preview */}
        <p className="text-sm truncate" style={{ color: "var(--app-text-muted)" }}>
          📄 {noteTitle}
        </p>

        {token ? (
          <>
            {/* Active link section */}
            <div
              className="rounded-lg p-3 space-y-3"
              style={{ backgroundColor: "var(--app-bg-input)", border: "1px solid var(--app-border)" }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Activo
                </span>
                <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                  · Cualquiera con el link puede leer esta nota
                </span>
              </div>

              {/* URL row */}
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl ?? ""}
                  className="flex-1 text-xs rounded px-2 py-1.5 outline-none min-w-0"
                  style={{
                    backgroundColor: "var(--app-bg-editor)",
                    color: "var(--app-text-secondary)",
                    border: "1px solid var(--app-border)",
                    fontFamily: "ui-monospace, monospace",
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="sm"
                  variant={copied ? "primary" : "ghost"}
                  onClick={copyLink}
                  style={copied ? { backgroundColor: "#22c55e" } : undefined}
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={generate}
                disabled={busy}
                title="Invalida el link actual y genera uno nuevo"
              >
                {busy ? "Generando…" : "🔄 Regenerar link"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={revoke}
                disabled={busy}
                style={{ color: "#f87171" }}
                title="El link deja de funcionar"
              >
                {busy ? "Desactivando…" : "🔒 Desactivar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* No active link */}
            <div
              className="rounded-lg p-4 text-center space-y-3"
              style={{ backgroundColor: "var(--app-bg-input)", border: "1px solid var(--app-border)" }}
            >
              <div className="text-2xl">🔒</div>
              <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
                Esta nota es privada
              </p>
              <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                Genera un link público para compartirla con quien quieras, sin que necesite cuenta.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={generate}
                disabled={busy}
              >
                {busy ? "Generando…" : "🔗 Generar link"}
              </Button>
            </div>
          </>
        )}

        {status === "error" && (
          <p className="text-xs text-red-400">
            Ocurrió un error. Inténtalo de nuevo.
          </p>
        )}
      </div>
    </Modal>
  );
}
