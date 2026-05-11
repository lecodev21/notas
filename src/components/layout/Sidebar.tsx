"use client";

import { signOut, useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { NotebookTree } from "@/components/notebooks/NotebookTree";
import type { Notebook, Tag } from "@/generated/prisma/client";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/lib/theme";

type NotebookWithChildren = Notebook & { children?: NotebookWithChildren[] };
type TagWithCount = Tag & { _count: { noteTags: number } };

interface SidebarProps {
  notebooks: NotebookWithChildren[];
  tags: TagWithCount[];
  selectedNotebook: string | null;
  selectedTag: string | null;
  view: "all" | "pinned" | "trash" | "notebook" | "tag";
  onSelectView: (view: "all" | "pinned" | "trash") => void;
  onSelectNotebook: (id: string) => void;
  onSelectTag: (name: string) => void;
  onNewNotebook: () => void;
  onNewTag: () => void;
  onRenameNotebook?: (id: string, name: string) => void;
  onDeleteNotebook?: (id: string) => void;
  onDeleteTag?: (id: string) => void;
}

const NAV_ITEMS = [
  { id: "all",    label: "Todas las notas", icon: "📄" },
  { id: "pinned", label: "Fijadas",         icon: "📌" },
  { id: "trash",  label: "Papelera",        icon: "🗑️" },
] as const;

export function Sidebar({
  notebooks,
  tags,
  selectedNotebook,
  selectedTag,
  view,
  onSelectView,
  onSelectNotebook,
  onSelectTag,
  onNewNotebook,
  onNewTag,
  onRenameNotebook,
  onDeleteNotebook,
  onDeleteTag,
}: SidebarProps) {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className="flex flex-col h-full border-r select-none overflow-hidden theme-transition"
      style={{
        backgroundColor: "var(--app-bg-sidebar)",
        borderColor: "var(--app-border)",
      }}
    >
      {/* App header */}
      <div
        className="px-4 py-3.5 shrink-0"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <span
          className="text-sm font-semibold tracking-wide"
          style={{ color: "var(--app-text-primary)" }}
        >
          ✏️ Inkdrop
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-4">
        {/* Quick access */}
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive =
              view === item.id &&
              selectedNotebook === null &&
              selectedTag === null;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onSelectView(item.id as "all" | "pinned" | "trash")}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
                  style={{
                    backgroundColor: isActive ? "rgba(99,102,241,0.15)" : undefined,
                    color: isActive ? "#6366f1" : "var(--app-text-muted)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        "var(--app-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
                  }}
                >
                  <span>{item.icon}</span>
                  <span
                    style={{ color: isActive ? "#6366f1" : "var(--app-text-secondary)" }}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Notebooks */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--app-text-muted)" }}
            >
              Notebooks
            </span>
            <Button size="icon" onClick={onNewNotebook} title="Nuevo notebook">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          </div>
          {notebooks.length === 0 ? (
            <p
              className="text-xs px-2 py-1"
              style={{ color: "var(--app-text-faint)" }}
            >
              Sin notebooks aún
            </p>
          ) : (
            <NotebookTree
              notebooks={notebooks}
              selectedId={selectedNotebook}
              onSelect={onSelectNotebook}
              onRename={onRenameNotebook}
              onDelete={onDeleteNotebook}
            />
          )}
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--app-text-muted)" }}
            >
              Tags
            </span>
            <Button size="icon" onClick={onNewTag} title="Nuevo tag">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
          </div>
          {tags.length === 0 ? (
            <p
              className="text-xs px-2 py-1"
              style={{ color: "var(--app-text-faint)" }}
            >
              Sin tags aún
            </p>
          ) : (
            <ul className="space-y-0.5">
              {tags.map((tag) => (
                <TagItem
                  key={tag.id}
                  tag={tag}
                  isSelected={selectedTag === tag.name}
                  onSelect={() => onSelectTag(tag.name)}
                  onDelete={onDeleteTag ? () => onDeleteTag(tag.id) : undefined}
                />
              ))}
            </ul>
          )}
        </div>
      </nav>

      {/* User footer */}
      <div
        className="px-3 py-3 flex items-center justify-between shrink-0"
        style={{ borderTop: "1px solid var(--app-border)" }}
      >
        <div className="min-w-0">
          <p
            className="text-xs font-medium truncate"
            style={{ color: "var(--app-text-secondary)" }}
          >
            {session?.user?.name ?? "Usuario"}
          </p>
          <p
            className="text-[10px] truncate"
            style={{ color: "var(--app-text-muted)" }}
          >
            {session?.user?.email}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {theme === "dark" ? (
              /* Sun icon */
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </Button>

          {/* Sign out */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Cerrar sesión"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function TagItem({
  tag,
  isSelected,
  onSelect,
  onDelete,
}: {
  tag: TagWithCount;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <li>
      <div
        className="group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors"
        style={{
          backgroundColor: isSelected ? "rgba(99,102,241,0.15)" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              "var(--app-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "";
        }}
      >
        <button
          onClick={onSelect}
          className="flex-1 flex items-center gap-2 text-xs text-left min-w-0"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: tag.color ?? "#6366f1" }}
          />
          <span
            className="truncate"
            style={{ color: isSelected ? "#6366f1" : "var(--app-text-secondary)" }}
          >
            {tag.name}
          </span>
          <span
            className="ml-auto"
            style={{ color: "var(--app-text-faint)" }}
          >
            {tag._count.noteTags}
          </span>
        </button>

        {onDelete && (
          <div className="relative" ref={menuRef}>
            <button
              className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center transition-all text-xs"
              style={{ color: "var(--app-text-muted)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#f87171")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color =
                  "var(--app-text-muted)")
              }
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ×
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-5 z-10 rounded-lg shadow-xl py-1 w-28"
                style={{
                  backgroundColor: "var(--app-bg-menu)",
                  border: "1px solid var(--app-border-strong)",
                }}
              >
                <button
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                >
                  Eliminar tag
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
