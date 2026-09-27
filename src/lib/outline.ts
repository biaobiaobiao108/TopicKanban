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

  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === 'heading') {
      const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1)) as OutlineItem['level'];
      flatItems.push({
        id: `heading-${flatItems.length}`,
        title: node.textContent.trim() || '未命名章节',
        level,
        index: flatItems.length,
        nodePos,
        textPos: nodePos + 1,
      });
    }
  });

  return {
    flatItems,
    hasHeadings: flatItems.length > 0,
  };
}

export function findActiveOutlineItem(outline: ScriptOutline, position: number): OutlineItem | null {
  const items = outline.flatItems;
  let low = 0;
  let high = items.length - 1;
  let activeIndex = -1;

  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    if (items[middle].textPos <= position) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return activeIndex >= 0 ? items[activeIndex] : null;
}
