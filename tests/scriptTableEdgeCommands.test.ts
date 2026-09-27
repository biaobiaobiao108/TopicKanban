import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { history, undo, undoDepth } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { createTableExtensions } from "../src/components/topic-detail/ScriptTableExtensions";
import {
  adjustActiveTableSize,
  getActiveTableContext,
  getActiveTableSnapshot,
  getTableEdgeDragDelta,
  restoreActiveTableSnapshot,
  snapTableEdgeDrag,
} from "../src/components/topic-detail/ScriptTableEdgeCommands";

function createTableEditor() {
  return new Editor({
    extensions: [StarterKit, ...createTableExtensions(), Markdown],
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
}

function createHistoryHarness(source: Editor) {
  let state = EditorState.create({
    schema: source.state.schema,
    doc: source.state.doc,
    selection: source.state.selection,
    plugins: [history()],
  });
  const editor = {
    get state() { return state; },
    chain() {
      let runCommand: ((args: { tr: typeof state.tr }) => boolean) | null = null;
      const chain = {
        command(command: (args: { tr: typeof state.tr }) => boolean) {
          runCommand = command;
          return chain;
        },
        run() {
          if (!runCommand) return false;
          const tr = state.tr;
          const result = runCommand({ tr });
          if (result) state = state.apply(tr);
          return result;
        },
      };
      return chain;
    },
  } as unknown as Editor;
  return { editor, get state() { return state; }, undo: () => undo(state, (tr) => { state = state.apply(tr); }) };
}

describe("script table edge commands", () => {
  test("snaps pointer distance to whole row or column steps and preserves one item", () => {
    expect(getTableEdgeDragDelta(27, 3)).toBe(0);
    expect(getTableEdgeDragDelta(28, 3)).toBe(1);
    expect(getTableEdgeDragDelta(-56, 3)).toBe(-2);
    expect(getTableEdgeDragDelta(-140, 3)).toBe(-2);
    expect(getTableEdgeDragDelta(-28, 1)).toBe(0);
    expect(snapTableEdgeDrag(84, 3)).toEqual({ delta: 3, snappedDistance: 84 });
    expect(snapTableEdgeDrag(-56, 3)).toEqual({ delta: -2, snappedDistance: -56 });
  });

  test("adds and removes trailing rows and columns without deleting the last one", () => {
    const editor = createTableEditor();
    try {
      editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
      expect(getActiveTableContext(editor)).toMatchObject({ rows: 2, columns: 2 });

      expect(adjustActiveTableSize(editor, "columns", 2)).toBe(true);
      expect(getActiveTableContext(editor)).toMatchObject({ rows: 2, columns: 4 });
      expect(adjustActiveTableSize(editor, "rows", 2)).toBe(true);
      expect(getActiveTableContext(editor)).toMatchObject({ rows: 4, columns: 4 });

      expect(adjustActiveTableSize(editor, "columns", -20)).toBe(true);
      expect(getActiveTableContext(editor)).toMatchObject({ rows: 4, columns: 1 });
      expect(adjustActiveTableSize(editor, "columns", -1)).toBe(false);
      expect(adjustActiveTableSize(editor, "rows", -20)).toBe(true);
      expect(getActiveTableContext(editor)).toMatchObject({ rows: 1, columns: 1 });
      expect(adjustActiveTableSize(editor, "rows", -1)).toBe(false);
      expect(editor.state.doc.check()).toBeUndefined();
    } finally {
      editor.destroy();
    }
  });

  test("keeps drag previews out of history and undoes the committed resize as one unit", () => {
    const source = createTableEditor();
    try {
      source.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
      const harness = createHistoryHarness(source);
      const snapshot = getActiveTableSnapshot(harness.editor);
      expect(snapshot).not.toBeNull();

      expect(adjustActiveTableSize(harness.editor, "columns", 1, { addToHistory: false, emitUpdate: false })).toBe(true);
      expect(undoDepth(harness.state)).toBe(0);
      expect(restoreActiveTableSnapshot(harness.editor, snapshot!, { addToHistory: false, emitUpdate: false })).toBe(true);
      expect(adjustActiveTableSize(harness.editor, "columns", 2, { addToHistory: false, emitUpdate: false })).toBe(true);
      expect(undoDepth(harness.state)).toBe(0);
      expect(restoreActiveTableSnapshot(harness.editor, snapshot!, { addToHistory: false, emitUpdate: false, closeHistory: true })).toBe(true);
      expect(adjustActiveTableSize(harness.editor, "columns", 2)).toBe(true);

      expect(getActiveTableContext(harness.editor)?.columns).toBe(4);
      expect(undoDepth(harness.state)).toBe(1);
      expect(harness.undo()).toBe(true);
      expect(getActiveTableContext(harness.editor)?.columns).toBe(2);
    } finally {
      source.destroy();
    }
  });
});
