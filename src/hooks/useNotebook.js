// Connects React to the notebook state and creates the Quill editor once.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Quill from "quill";
import { notebookDb } from "../data/client";
import { createNotebookController } from "./notebook-controller";

export function useNotebook() {
  // Keep one set of save timers and requests across React renders.
  const [controller] = useState(() => createNotebookController(notebookDb));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);
  const titleRef = useRef(null);
  const quillRef = useRef(null);

  useEffect(() => {
    // Reuse Quill when development hot reload reruns this effect.
    const editor =
      quillRef.current ||
      new Quill(editorRef.current, {
        theme: "snow",
        placeholder: "Start writing your document…",
        modules: { toolbar: toolbarRef.current },
        formats: ["header", "bold", "italic", "list", "link", "image"],
      });
    editor.root.setAttribute("role", "textbox");
    editor.root.setAttribute("aria-label", "Document content");
    editor.root.setAttribute("aria-multiline", "true");
    toolbarRef.current
      .querySelector(".ql-picker-label")
      ?.setAttribute("aria-label", "Text style");
    editor.enable(false);
    quillRef.current = editor;
    return controller.mount(editor, titleRef.current);
  }, [controller]);

  // Archived entries and entries being loaded cannot be edited.
  useEffect(() => {
    quillRef.current?.enable(Boolean(state.membership) && !state.locked);
  }, [state.membership, state.locked]);

  return {
    state,
    actions: controller.actions,
    editorRef,
    toolbarRef,
    titleRef,
  };
}
