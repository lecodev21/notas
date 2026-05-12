/**
 * tableEditingExtension
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart table editing for the CodeMirror markdown editor.
 *
 * Enter:
 *   • On a header row (first row of the table) → inserts separator + empty row
 *   • On any other data row with content       → inserts empty data row
 *   • On an empty data row (all cells blank)   → exits the table (deletes the
 *     empty row, leaving a blank line in its place)
 *   • On the separator row                     → inserts empty data row
 *
 * Tab:        move to the next cell (wraps to first cell of next row; appends a
 *             new row when already on the last cell of the last row)
 * Shift-Tab:  move to the previous cell (wraps to last cell of previous row)
 */

import { keymap } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";

// ── Predicates ────────────────────────────────────────────────────────────────

function isTableRow(text: string): boolean {
  const t = text.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length >= 3;
}

function countCols(text: string): number {
  // `| a | b |`.split("|") → ["", " a ", " b ", ""] → length-2 = 2 cols
  return text.split("|").length - 2;
}

function allCellsEmpty(text: string): boolean {
  return text.split("|").slice(1, -1).every((c) => c.trim() === "");
}

// ── Cell centers ──────────────────────────────────────────────────────────────
/**
 * Returns the document position of the **center** of each cell's raw space
 * (everything between the two `|` delimiters, including padding).
 *
 * Using the center means the cursor always lands visually inside the cell,
 * never pressed against a `|` border, whether the cell is empty or has text.
 */
function getCellCenters(lineText: string, lineFrom: number): number[] {
  const centers: number[] = [];
  const parts = lineText.split("|");
  // parts[0]      = before first | (usually "" or leading spaces)
  // parts[1..n-1] = raw cell content (including padding spaces)
  // parts[n]      = after last |
  let offset = parts[0].length + 1; // past leading text + first "|"

  for (let i = 1; i < parts.length - 1; i++) {
    const cell = parts[i];
    centers.push(lineFrom + offset + Math.floor(cell.length / 2));
    offset += cell.length + 1; // +1 for the next "|"
  }
  return centers;
}

// ── Tab / Shift-Tab navigation ────────────────────────────────────────────────

/** Dispatch a cursor move to the center of a cell given its center position. */
function jumpTo(view: EditorView, center: number): void {
  view.dispatch({
    selection: EditorSelection.cursor(center),
    scrollIntoView: true,
  });
}

function navigateCell(view: EditorView, dir: 1 | -1): boolean {
  const { state } = view;
  const pos  = state.selection.main.head;
  const line = state.doc.lineAt(pos);

  if (!isTableRow(line.text)) return false;

  const centers = getCellCenters(line.text, line.from);
  if (centers.length === 0) return false;

  // Which cell is the cursor in? A cell "owns" the range
  // [prevPipe+1, thisPipe].  Find by comparing to the midpoints.
  const parts  = line.text.split("|");
  let offset   = parts[0].length + 1;
  let idx      = -1;
  for (let i = 1; i < parts.length - 1; i++) {
    const start = line.from + offset;
    const end   = start + parts[i].length;
    if (pos >= start && pos <= end) { idx = i - 1; break; }
    offset += parts[i].length + 1;
  }
  if (idx === -1) idx = dir === 1 ? -1 : centers.length;

  const next = idx + dir;

  // ── Within the same row ──────────────────────────────────────────────────
  if (next >= 0 && next < centers.length) {
    jumpTo(view, centers[next]);
    return true;
  }

  // ── Forward past last cell → next row ────────────────────────────────────
  if (dir === 1) {
    if (line.number < state.doc.lines) {
      const nl = state.doc.line(line.number + 1);
      if (isTableRow(nl.text)) {
        const nc = getCellCenters(nl.text, nl.from);
        if (nc.length > 0) { jumpTo(view, nc[0]); return true; }
      }
    }
    // Last row of table → append a new row and jump to its first cell center
    const cols   = centers.length;
    const newRow = "\n| " + Array(cols).fill("   ").join(" | ") + " |";
    // Center of first cell in new row: line.to + 1(\n) + 1(|) + floor(3/2) = +3
    const firstCenter = line.to + 1 + 1 + Math.floor(3 / 2);
    view.dispatch({
      changes: { from: line.to, insert: newRow },
      selection: EditorSelection.cursor(firstCenter),
      scrollIntoView: true,
    });
    return true;
  }

  // ── Backward past first cell → previous row ───────────────────────────────
  if (line.number > 1) {
    const pl = state.doc.line(line.number - 1);
    if (isTableRow(pl.text)) {
      const pc = getCellCenters(pl.text, pl.from);
      if (pc.length > 0) { jumpTo(view, pc[pc.length - 1]); return true; }
    }
  }

  return false;
}

// ── Enter: auto-complete rows ─────────────────────────────────────────────────

function handleTableEnter(view: EditorView): boolean {
  const { state } = view;
  const pos  = state.selection.main.head;
  const line = state.doc.lineAt(pos);

  if (!isTableRow(line.text)) return false;

  const cols = countCols(line.text);
  if (cols <= 0) return false;

  // Empty row → exit the table (replace row content with nothing, keep the \n)
  if (allCellsEmpty(line.text)) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: EditorSelection.cursor(line.from),
    });
    return true;
  }

  // Is this the first row of the table? (previous line is NOT a table row)
  const prevLine  = line.number > 1 ? state.doc.line(line.number - 1) : null;
  const isHeader  = !prevLine || !isTableRow(prevLine.text);

  const emptyRow = "| " + Array(cols).fill("   ").join(" | ") + " |";

  // Cell width in the new row: "   " = 3 chars; center is at floor(3/2) = 1
  // So first-cell center = insertPos + 1(\n) + 1(|) + 1(space) + 1(center) = +4

  if (isHeader) {
    // Insert separator + empty data row
    const sep    = "| " + Array(cols).fill("---").join(" | ") + " |";
    const insert = "\n" + sep + "\n" + emptyRow;
    // Center of first cell of the data row:
    //   line.to + 1(\n) + sep.length + 1(\n) + 1(|) + floor(3/2)
    const firstCenter = line.to + 1 + sep.length + 1 + 1 + Math.floor(3 / 2);
    view.dispatch({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(firstCenter),
    });
    return true;
  }

  // Regular data row → insert new empty data row below
  // Center of first cell: line.to + 1(\n) + 1(|) + floor(3/2)
  const firstCenter = line.to + 1 + 1 + Math.floor(3 / 2);
  view.dispatch({
    changes: { from: line.to, insert: "\n" + emptyRow },
    selection: EditorSelection.cursor(firstCenter),
  });
  return true;
}

// ── Export ────────────────────────────────────────────────────────────────────

export const tableEditingExtension = Prec.highest(
  keymap.of([
    { key: "Enter",     run: handleTableEnter },
    { key: "Tab",       run: (v) => navigateCell(v,  1) },
    { key: "Shift-Tab", run: (v) => navigateCell(v, -1) },
  ])
);
