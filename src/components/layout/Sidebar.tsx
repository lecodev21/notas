"use client";

import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { NotebookTree } from "@/components/notebooks/NotebookTree";
import type { Notebook, Tag } from "@/generated/prisma/client";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/lib/theme";
import React, { useState } from "react";
import { STATUS_META, STATUS_ORDER, type NoteStatus } from "@/lib/noteStatus";
import {
  LuFileText, LuLogOut, LuMoon, LuNetwork, LuNotebook,
  LuPencilLine, LuPin, LuPlus, LuSun, LuTrash2,
} from "react-icons/lu";

type NotebookWithChildren = Notebook & { children?: NotebookWithChildren[]; _count?: { notes: number } };
type TagWithCount = Tag & { _count: { noteTags: number } };

interface SidebarProps {
  notebooks: NotebookWithChildren[];
  tags: TagWithCount[];
  selectedNotebook: string | null;
  selectedTag: string | null;
  selectedStatus: NoteStatus | null;
  statusCounts: Record<NoteStatus, number>;
  view: "all" | "pinned" | "trash" | "notebook" | "tag" | "status";
  onSelectView: (view: "all" | "pinned" | "trash") => void;
  onSelectNotebook: (id: string) => void;
  onSelectTag: (name: string) => void;
  onSelectStatus: (status: NoteStatus) => void;
  onNewNotebook: (name: string) => void;
  onNewSubNotebook?: (parentId: string, name: string) => void;
  onRenameNotebook?: (id: string, name: string) => void;
  onDeleteNotebook?: (id: string) => void;
  onDropNote?: (noteId: string, notebookId: string) => void;
  onDropNotes?: (noteIds: string[], notebookId: string) => void;
  graphMode?: boolean;
  onToggleGraphMode?: () => void;
}

const NAV_ITEMS: { id: "all" | "pinned" | "trash"; label: string; icon: React.ReactNode }[] = [
  { id: "all",    label: "Todas las notas", icon: <LuFileText className="w-3.5 h-3.5" /> },
  { id: "pinned", label: "Fijadas",         icon: <LuPin      className="w-3.5 h-3.5" /> },
  { id: "trash",  label: "Papelera",        icon: <LuTrash2   className="w-3.5 h-3.5" /> },
];

export function Sidebar({
  notebooks,
  tags,
  selectedNotebook,
  selectedTag,
  selectedStatus,
  statusCounts,
  view,
  onSelectView,
  onSelectNotebook,
  onSelectTag,
  onSelectStatus,
  onNewNotebook,
  onNewSubNotebook,
  onRenameNotebook,
  onDeleteNotebook,
  onDropNote,
  onDropNotes,
  graphMode = false,
  onToggleGraphMode,
}: SidebarProps) {
  const { data: session } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [addingNotebook, setAddingNotebook] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");

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
          className="text-sm font-semibold tracking-wide flex items-center gap-1.5"
          style={{ color: "var(--app-text-primary)" }}
        >
          <LuPencilLine className="w-4 h-4" />
          Inkdrop
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
                  {item.icon}
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

        {/* Graph */}
        <ul className="space-y-0.5">
          <li>
            <GraphNavItem active={graphMode} onToggle={onToggleGraphMode} />
          </li>
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
            <Button
              size="icon"
              onClick={() => { setAddingNotebook(true); setNewNotebookName(""); }}
              title="Nuevo notebook"
            >
              <LuPlus className="w-3 h-3" />
            </Button>
          </div>

          {notebooks.length > 0 && (
            <NotebookTree
              notebooks={notebooks}
              selectedId={selectedNotebook}
              onSelect={onSelectNotebook}
              onRename={onRenameNotebook}
              onDelete={onDeleteNotebook}
              onNewChild={onNewSubNotebook}
              onDropNote={onDropNote}
              onDropNotes={onDropNotes}
            />
          )}

          {/* Inline new-notebook input */}
          {addingNotebook && (
            <div className="flex items-center gap-1 px-2 py-1">
              <LuNotebook className="w-3 h-3 shrink-0" style={{ color: "var(--app-text-muted)" }} />
              <input
                autoFocus
                value={newNotebookName}
                onChange={(e) => setNewNotebookName(e.target.value)}
                onBlur={() => {
                  if (newNotebookName.trim()) onNewNotebook(newNotebookName.trim());
                  setAddingNotebook(false);
                  setNewNotebookName("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newNotebookName.trim()) {
                    onNewNotebook(newNotebookName.trim());
                    setAddingNotebook(false);
                    setNewNotebookName("");
                  }
                  if (e.key === "Escape") {
                    setAddingNotebook(false);
                    setNewNotebookName("");
                  }
                }}
                placeholder="Nombre del notebook"
                className="flex-1 text-xs rounded px-1 py-0.5 outline-none border border-indigo-500 min-w-0"
                style={{
                  backgroundColor: "var(--app-bg-input)",
                  color: "var(--app-text-primary)",
                }}
              />
            </div>
          )}

          {notebooks.length === 0 && !addingNotebook && (
            <p className="text-xs px-2 py-1" style={{ color: "var(--app-text-faint)" }}>
              Sin notebooks aún
            </p>
          )}
        </div>

        {/* Statuses */}
        <div>
          <div className="flex items-center px-2 mb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--app-text-muted)" }}
            >
              Statuses
            </span>
          </div>
          <ul className="space-y-0.5">
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const isActive = view === "status" && selectedStatus === s;
              return (
                <li key={s}>
                  <button
                    onClick={() => onSelectStatus(s)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
                    style={{
                      backgroundColor: isActive ? "rgba(99,102,241,0.15)" : undefined,
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
                    <span className="text-[11px] leading-none font-bold" style={{ color: meta.color }}>{meta.icon}</span>
                    <span
                      className="truncate"
                      style={{ color: isActive ? "#6366f1" : "var(--app-text-secondary)" }}
                    >
                      {meta.label}
                    </span>
                    <span className="ml-auto" style={{ color: "var(--app-text-muted)" }}>
                      {statusCounts[s] ?? 0}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center px-2 mb-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--app-text-muted)" }}
            >
              Tags
            </span>
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
            {theme === "dark"
              ? <LuSun  className="w-3.5 h-3.5" />
              : <LuMoon className="w-3.5 h-3.5" />
            }
          </Button>

          {/* Sign out */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Cerrar sesión"
          >
            <LuLogOut className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

function GraphNavItem({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
      style={{
        backgroundColor: active
          ? "rgba(99,102,241,0.15)"
          : hovered
          ? "var(--app-hover)"
          : undefined,
        color: active ? "#818cf8" : "var(--app-text-secondary)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LuNetwork className="w-3.5 h-3.5" />
      <span>Grafo de notas</span>
    </button>
  );
}

function TagItem({
  tag,
  isSelected,
  onSelect,
}: {
  tag: TagWithCount;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left"
        style={{
          backgroundColor: isSelected ? "rgba(99,102,241,0.15)" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--app-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected)
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = "";
        }}
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
        <span className="ml-auto" style={{ color: "var(--app-text-muted)" }}>
          {tag._count.noteTags}
        </span>
      </button>
    </li>
  );
}
