/**
 * imageExtension — CodeMirror 6 extension bundle for inline image previews.
 *
 * What it does:
 *  - Detects `![alt](url)` patterns inside the visible viewport.
 *  - For normal image URLs: renders an `<img>` tag as a Decoration.replace widget
 *    on the line BELOW the markdown source, keeping the raw syntax editable.
 *  - For `uploading:uid` placeholder URLs: renders a "⏳ Subiendo imagen…" badge.
 *  - Clicking the rendered image selects the markdown source span.
 *  - Handles drag-and-drop of image files onto the editor.
 *  - Handles Ctrl+V / Cmd+V paste of image files / clipboard image data.
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { EditorSelection, RangeSetBuilder } from "@codemirror/state";
import { uploadImageAndInsert } from "./imageUpload";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Parse all ![alt](url) occurrences in a line and return their spans. */
interface ImageMatch {
  from:  number; // absolute doc position of `!`
  to:    number; // absolute doc position of `)` + 1
  alt:   string;
  url:   string;
}

const IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

function findImagesInLine(
  lineText: string,
  lineFrom: number,
): ImageMatch[] {
  const results: ImageMatch[] = [];
  IMG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_RE.exec(lineText)) !== null) {
    results.push({
      from: lineFrom + m.index,
      to:   lineFrom + m.index + m[0].length,
      alt:  m[1],
      url:  m[2],
    });
  }
  return results;
}

// ── Uploading placeholder widget ──────────────────────────────────────────

class UploadingWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-img-uploading";
    span.textContent = "⏳ Subiendo imagen…";
    return span;
  }
  eq(): boolean { return true; }
  ignoreEvent(): boolean { return false; }
}

// ── Rendered image widget ─────────────────────────────────────────────────

class ImageWidget extends WidgetType {
  constructor(
    private readonly url:  string,
    private readonly alt:  string,
    /** absolute doc position of the `!` that starts this image */
    private readonly from: number,
    /** absolute doc position after the closing `)` */
    private readonly to:   number,
  ) { super(); }

  eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-img-widget";
    wrapper.contentEditable = "false";

    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.className = "cm-img-preview";
    img.draggable = false;

    // Click: select the markdown source span
    const { from, to } = this;
    img.addEventListener("click", (e) => {
      e.preventDefault();
      view.dispatch({
        selection: EditorSelection.range(from, to),
      });
      view.focus();
    });

    wrapper.appendChild(img);
    return wrapper;
  }

  ignoreEvent(e: Event): boolean {
    // Let click events through so our listener above fires
    return e.type !== "click";
  }
}

// ── ViewPlugin: build decorations ────────────────────────────────────────

function buildImageDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from: vpFrom, to: vpTo } = view.viewport;

  for (let pos = vpFrom; pos <= vpTo; ) {
    const line = view.state.doc.lineAt(pos);
    const images = findImagesInLine(line.text, line.from);

    for (const img of images) {
      if (img.url.startsWith("uploading:")) {
        // Insert uploading badge right after the source text (same line)
        builder.add(
          img.to,
          img.to,
          Decoration.widget({ widget: new UploadingWidget(), side: 1 }),
        );
      } else {
        // Insert the rendered image widget on a new line after the source
        builder.add(
          img.to,
          img.to,
          Decoration.widget({
            widget: new ImageWidget(img.url, img.alt, img.from, img.to),
            side:   1,
            block:  false,
          }),
        );
      }
    }

    pos = line.to + 1;
  }

  return builder.finish();
}

export const imagePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) {
        this.decorations = buildImageDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ── CSS theme for image widgets ───────────────────────────────────────────

export const imageTheme = EditorView.theme({
  ".cm-img-widget": {
    display:    "inline-block",
    lineHeight: "0",
  },
  ".cm-img-preview": {
    display:       "block",
    maxWidth:      "min(100%, 480px)",
    maxHeight:     "320px",
    objectFit:     "contain",
    borderRadius:  "6px",
    margin:        "4px 0",
    cursor:        "pointer",
    border:        "2px solid transparent",
    transition:    "border-color 0.15s",
  },
  ".cm-img-preview:hover": {
    borderColor: "rgba(99,102,241,0.5)",
  },
  ".cm-img-uploading": {
    display:         "inline-block",
    marginLeft:      "8px",
    padding:         "2px 8px",
    borderRadius:    "4px",
    fontSize:        "11px",
    backgroundColor: "rgba(99,102,241,0.12)",
    color:           "var(--app-text-muted)",
    verticalAlign:   "middle",
  },
  // Drop-overlay applied on the editor wrapper
  ".cm-drop-target": {
    outline:         "2px dashed #6366f1",
    outlineOffset:   "-4px",
    backgroundColor: "rgba(99,102,241,0.06)",
  },
});

// ── Drag & drop + paste handler ───────────────────────────────────────────

function getImageFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];
  const files: File[] = [];
  for (const file of Array.from(transfer.files)) {
    if (file.type.startsWith("image/")) files.push(file);
  }
  return files;
}

/**
 * Returns a CodeMirror domEventHandlers extension that:
 *  - Highlights the editor on dragover
 *  - Uploads dropped image files
 *  - Uploads pasted image files / image clipboard items
 *
 * The `setDragOver` callback is called with true/false so the parent React
 * component can show a full-panel drop overlay.
 */
export function createImageDropExtension(
  setDragOver: (v: boolean) => void,
) {
  return EditorView.domEventHandlers({
    dragover(event, view) {
      const files = getImageFiles(event.dataTransfer);
      if (files.length === 0) return false;
      event.preventDefault();
      event.dataTransfer!.dropEffect = "copy";
      view.dom.classList.add("cm-drop-target");
      setDragOver(true);
      return true;
    },

    dragleave(_event, view) {
      view.dom.classList.remove("cm-drop-target");
      setDragOver(false);
      return false;
    },

    drop(event, view) {
      view.dom.classList.remove("cm-drop-target");
      setDragOver(false);

      const files = getImageFiles(event.dataTransfer);
      if (files.length === 0) return false;
      event.preventDefault();

      // Drop position in the document
      const coords = { x: event.clientX, y: event.clientY };
      const pos = view.posAtCoords(coords) ?? view.state.doc.length;

      for (const file of files) {
        uploadImageAndInsert(file, view, pos);
      }
      return true;
    },

    paste(event, view) {
      const items = event.clipboardData?.items;
      if (!items) return false;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return false;

      event.preventDefault();
      const pos = view.state.selection.main.from;
      for (const file of imageFiles) {
        uploadImageAndInsert(file, view, pos);
      }
      return true;
    },
  });
}
