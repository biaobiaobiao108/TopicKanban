import type { Editor } from '@tiptap/core';

export interface OutlineItem {
  id: string;
  title: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  index: number;
  nodePos: number;
  textPos: number;
}

export interface ScriptOutline {
  flatItems: OutlineItem[];
  hasHeadings: boolean;
}

export const EMPTY_SCRIPT_OUTLINE: ScriptOutline = {
  flatItems: [],
  hasHeadings: false,
};

/**
 * Builds a hierarchical H1-H6 outline from the editor document.
 */
export function extractScriptOutline(editor: Editor | null): ScriptOutline {
  if (!editor) return EMPTY_SCRIPT_OUTLINE;

  const flatItems: OutlineItem[] = [];

  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1)) as OutlineItem['level'];
      flatItems.push({
        id: `heading-${offset}`,
        title: node.textContent.trim() || '未命名章节',
        level,
        index: flatItems.length,
        nodePos: offset,
        textPos: offset + 1,
      });
    }
  });

  return {
    flatItems,
    hasHeadings: flatItems.length > 0,
  };
}

export function findActiveOutlineItem(outline: ScriptOutline, position: number): OutlineItem | null {
  let activeItem: OutlineItem | null = null;
  for (const item of outline.flatItems) {
    if (item.textPos > position) break;
    activeItem = item;
  }
  return activeItem;
}
