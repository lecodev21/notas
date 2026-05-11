"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={cn("rounded-xl shadow-2xl w-full max-w-md mx-4 p-5", className)}
        style={{
          backgroundColor: "var(--app-bg-surface)",
          border: "1px solid var(--app-border-strong)",
        }}
      >
        {title && (
          <h2
            className="text-base font-semibold mb-4"
            style={{ color: "var(--app-text-primary)" }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
