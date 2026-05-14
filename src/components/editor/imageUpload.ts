import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

/**
 * Upload an image File to the server and insert the resulting markdown into
 * the CodeMirror editor at the given position.
 *
 * Flow:
 *  1. Insert `![filename](uploading:uid)` placeholder immediately (so the
 *     user sees "Subiendo imagen…" inline via the image widget).
 *  2. Upload the file via POST /api/uploads.
 *  3. Replace the placeholder URL with the real `/uploads/…` URL.
 *  4. On error, replace the placeholder with an error comment.
 */
export async function uploadImageAndInsert(
  file: File,
  view: EditorView,
  insertPos: number,
): Promise<void> {
  const uid = Math.random().toString(36).slice(2, 10);
  const placeholderUrl = `uploading:${uid}`;
  const altText = file.name.replace(/[[\]]/g, ""); // strip brackets from alt
  const placeholder = `![${altText}](${placeholderUrl})`;

  // Insert placeholder at the drop / paste position
  const before = view.state.doc.sliceString(insertPos - 1, insertPos);
  const needsNewlineBefore =
    insertPos > 0 && before !== "\n" && before !== "";
  const prefix = needsNewlineBefore ? "\n" : "";

  view.dispatch({
    changes: { from: insertPos, insert: prefix + placeholder },
    selection: EditorSelection.cursor(insertPos + prefix.length + placeholder.length),
  });

  // Upload
  const formData = new FormData();
  formData.append("file", file);

  let finalMd: string;
  try {
    const res = await fetch("/api/uploads", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.url) {
      const msg = data.error ?? "Error al subir imagen";
      finalMd = `<!-- ${msg} -->`;
    } else {
      finalMd = `![${altText}](${data.url})`;
    }
  } catch {
    finalMd = `<!-- Error de red al subir imagen -->`;
  }

  // Replace the placeholder in the current document (it may have moved due to
  // other edits, so search for the unique sentinel URL).
  const docText = view.state.doc.toString();
  const idx = docText.indexOf(placeholderUrl);
  if (idx === -1) return; // user deleted it — nothing to do

  // Find the full `![…](uploading:uid)` span
  const bracketOpen = docText.lastIndexOf("![", idx);
  if (bracketOpen === -1) return;
  const spanEnd = idx + placeholderUrl.length + 1; // +1 for the closing `)`

  view.dispatch({
    changes: { from: bracketOpen, to: spanEnd, insert: finalMd },
  });
}
