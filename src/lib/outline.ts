import type { Editor } from '@tiptap/core';

export interface OutlineItem {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  index: number;
  nodePos: number;
  textPos: number;
  charCount: number;
  percentage: number;
  durationSeconds: number;
  children: OutlineItem[];
}

export interface ScriptOutline {
  items: OutlineItem[];
  flatItems: OutlineItem[];
  totalCharCount: number;
  totalDurationSeconds: number;
  leadCharCount: number;
  leadPercentage: number;
  leadDurationSeconds: number;
  hasHeadings: boolean;
}

interface MutableOutlineItem extends Omit<OutlineItem, 'children'> {
  directCharCount: number;
  children: MutableOutlineItem[];
}

export const EMPTY_SCRIPT_OUTLINE: ScriptOutline = {
  items: [],
  flatItems: [],
  totalCharCount: 0,
  totalDurationSeconds: 0,
  leadCharCount: 0,
  leadPercentage: 0,
  leadDurationSeconds: 0,
  hasHeadings: false,
};

const countCharacters = (text: string) => text.replace(/\s+/g, '').length;

const roundPercentage = (value: number) => Math.round(value * 1000) / 10;

export function formatOutlineDuration(seconds: number): string {
  if (seconds <= 0) return '0秒';
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分钟`;
}

/**
 * Builds a hierarchical H1/H2/H3 outline from the editor document.
 * Percentages are calculated among siblings; heading text is excluded from body statistics.
 */
export function extractScriptOutline(editor: Editor | null, readingSpeed = 280): ScriptOutline {
  if (!editor) return EMPTY_SCRIPT_OUTLINE;

  const rootItems: MutableOutlineItem[] = [];
  const flatItems: MutableOutlineItem[] = [];
  const stack: MutableOutlineItem[] = [];
  let leadCharCount = 0;
  let totalCharCount = 0;

  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      const level = Math.min(3, Math.max(1, Number(node.attrs.level) || 1)) as 1 | 2 | 3;
      const item: MutableOutlineItem = {
        id: `heading-${offset}`,
        title: node.textContent.trim() || '未命名章节',
        level,
        index: flatItems.length,
        nodePos: offset,
        textPos: offset + 1,
        directCharCount: 0,
        charCount: 0,
        percentage: 0,
        durationSeconds: 0,
        children: [],
      };

      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(item);
      else rootItems.push(item);

      stack.push(item);
      flatItems.push(item);
      return;
    }

    const charCount = countCharacters(node.textContent);
    totalCharCount += charCount;
    const currentHeading = flatItems[flatItems.length - 1];
    if (currentHeading) currentHeading.directCharCount += charCount;
    else leadCharCount += charCount;
  });

  const speed = readingSpeed > 0 ? readingSpeed : 280;
  const calculateTotals = (item: MutableOutlineItem): number => {
    item.charCount = item.directCharCount
      + item.children.reduce((sum, child) => sum + calculateTotals(child), 0);
    item.durationSeconds = Math.round((item.charCount / speed) * 60);
    return item.charCount;
  };
  rootItems.forEach(calculateTotals);

  const calculateSiblingPercentages = (items: MutableOutlineItem[], parentTotal?: number) => {
    const siblingTotal = parentTotal ?? items.reduce((sum, item) => sum + item.charCount, 0);
    items.forEach((item) => {
      item.percentage = siblingTotal > 0 ? roundPercentage(item.charCount / siblingTotal) : 0;
      calculateSiblingPercentages(item.children);
    });
  };
  calculateSiblingPercentages(rootItems, totalCharCount);

  return {
    items: rootItems,
    flatItems,
    totalCharCount,
    totalDurationSeconds: Math.round((totalCharCount / speed) * 60),
    leadCharCount,
    leadPercentage: totalCharCount > 0 ? roundPercentage(leadCharCount / totalCharCount) : 0,
    leadDurationSeconds: Math.round((leadCharCount / speed) * 60),
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
