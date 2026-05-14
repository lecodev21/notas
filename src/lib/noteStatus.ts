/**
 * Note status system
 * ──────────────────
 * Every note has one of four statuses that describe its work state.
 * Completed and Dropped notes are hidden from the default list view;
 * they can only be seen by explicitly filtering by that status.
 */

export type NoteStatus = "active" | "on_hold" | "completed" | "dropped";

export const STATUS_META: Record<
  NoteStatus,
  { label: string; icon: string; color: string }
> = {
  active:    { label: "Active",    icon: "●", color: "#34d399" },
  on_hold:   { label: "On Hold",   icon: "◑", color: "#fbbf24" },
  completed: { label: "Completed", icon: "✓", color: "#818cf8" },
  dropped:   { label: "Dropped",   icon: "○", color: "#64748b" },
};

export const STATUS_ORDER: NoteStatus[] = [
  "active",
  "on_hold",
  "completed",
  "dropped",
];

/**
 * Statuses that appear in the default (unfiltered) note list.
 * Completed and Dropped are intentionally excluded to keep the
 * day-to-day list clean and focused.
 */
export const DEFAULT_VISIBLE_STATUSES: NoteStatus[] = ["active", "on_hold"];
