import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import type { SuggestionKeyDownProps, SuggestionMatch } from '@tiptap/suggestion';
import {
  Bold, Bookmark, Code, Code2, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  Info, Italic, Lightbulb, List, ListOrdered, ListTodo, Minus, Pilcrow, Quote,
  ShieldAlert, Strikethrough, Table2, TriangleAlert, Underline,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FloatingScrollbar } from '../ui/FloatingScrollbar';
import type { CalloutType } from './ScriptCalloutNode';

type CommandAction = 'paragraph' | 'heading' | 'bulletList' | 'orderedList' | 'taskList'
  | 'blockquote' | 'codeBlock' | 'horizontalRule' | 'callout' | 'table'
  | 'bold' | 'italic' | 'strike' | 'underline' | 'inlineCode';

type ScriptMarkdownCommand = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  action: CommandAction;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  calloutType?: CalloutType;
};

const commandItems: ScriptMarkdownCommand[] = [
  { id: 'heading-1', label: '一级标题', description: '切换为 H1', keywords: ['h1', '标题1'], icon: Heading1, action: 'heading', headingLevel: 1 },
  { id: 'heading-2', label: '二级标题', description: '切换为 H2', keywords: ['h2', '标题2'], icon: Heading2, action: 'heading', headingLevel: 2 },
  { id: 'heading-3', label: '三级标题', description: '切换为 H3', keywords: ['h3', '标题3'], icon: Heading3, action: 'heading', headingLevel: 3 },
  { id: 'heading-4', label: '四级标题', description: '切换为 H4', keywords: ['h4', '标题4'], icon: Heading4, action: 'heading', headingLevel: 4 },
  { id: 'heading-5', label: '五级标题', description: '切换为 H5', keywords: ['h5', '标题5'], icon: Heading5, action: 'heading', headingLevel: 5 },
  { id: 'heading-6', label: '六级标题', description: '切换为 H6', keywords: ['h6', '标题6'], icon: Heading6, action: 'heading', headingLevel: 6 },
  { id: 'paragraph', label: '正文段落', description: '切换为普通正文', keywords: ['paragraph', '正文'], icon: Pilcrow, action: 'paragraph' },
  { id: 'bold', label: '加粗', description: '切换粗体标记', keywords: ['bold', 'strong'], icon: Bold, action: 'bold' },
  { id: 'italic', label: '斜体', description: '切换斜体标记', keywords: ['italic', 'emphasis'], icon: Italic, action: 'italic' },
  { id: 'strike', label: '删除线', description: '切换删除线标记', keywords: ['strike', 'strikethrough'], icon: Strikethrough, action: 'strike' },
  { id: 'underline', label: '下划线', description: '切换下划线标记（++文本++）', keywords: ['underline'], icon: Underline, action: 'underline' },
  { id: 'inline-code', label: '行内代码', description: '切换行内代码标记', keywords: ['inline code', 'code'], icon: Code, action: 'inlineCode' },
  { id: 'blockquote', label: '引用', description: '插入引用块', keywords: ['quote', 'blockquote'], icon: Quote, action: 'blockquote' },
  { id: 'code-block', label: '代码块', description: '插入代码围栏', keywords: ['code fence'], icon: Code2, action: 'codeBlock' },
  { id: 'horizontal-rule', label: '分隔线', description: '插入水平分隔线', keywords: ['divider', 'hr'], icon: Minus, action: 'horizontalRule' },
  { id: 'bullet-list', label: '无序列表', description: '插入项目符号列表', keywords: ['bullet', 'unordered list'], icon: List, action: 'bulletList' },
  { id: 'ordered-list', label: '有序列表', description: '插入编号列表', keywords: ['ordered', 'numbered list'], icon: ListOrdered, action: 'orderedList' },
  { id: 'task-list', label: '任务清单', description: '插入可勾选任务', keywords: ['task', 'todo', 'checkbox'], icon: ListTodo, action: 'taskList' },
  { id: 'table', label: '表格', description: '插入 3 × 3 表格', keywords: ['table', 'grid'], icon: Table2, action: 'table' },
  { id: 'callout-note', label: '提示块 · 说明', description: '插入 NOTE 提示块', keywords: ['callout', 'note'], icon: Info, action: 'callout', calloutType: 'NOTE' },
  { id: 'callout-tip', label: '提示块 · 建议', description: '插入 TIP 提示块', keywords: ['callout', 'tip'], icon: Lightbulb, action: 'callout', calloutType: 'TIP' },
  { id: 'callout-important', label: '提示块 · 重要', description: '插入 IMPORTANT 提示块', keywords: ['callout', 'important'], icon: Bookmark, action: 'callout', calloutType: 'IMPORTANT' },
  { id: 'callout-warning', label: '提示块 · 警告', description: '插入 WARNING 提示块', keywords: ['callout', 'warning'], icon: TriangleAlert, action: 'callout', calloutType: 'WARNING' },
  { id: 'callout-caution', label: '提示块 · 注意', description: '插入 CAUTION 提示块', keywords: ['callout', 'caution'], icon: ShieldAlert, action: 'callout', calloutType: 'CAUTION' },
];

export function filterScriptMarkdownCommands(query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return commandItems;
  return commandItems.filter((item) => `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLocaleLowerCase().includes(normalized));
}

export function findScriptMarkdownCommandMatch(config: {
  $position: {
    pos: number;
    parentOffset?: number;
    parent?: { textBetween?: (from: number, to: number) => string };
    nodeBefore?: { isText?: boolean; text?: string | null } | null;
  };
}): SuggestionMatch {
  const { $position } = config;
  const hasParentText = typeof $position.parent?.textBetween === 'function' && typeof $position.parentOffset === 'number';
  const text = hasParentText
    ? $position.parent?.textBetween?.(0, $position.parentOffset!) ?? ''
    : $position.nodeBefore?.isText ? $position.nodeBefore.text ?? '' : '';
  if (!text) return null;

  const match = /(?:^|[ \t\u3000])\/([^\n]*)$/u.exec(text);
  if (!match || match.index === undefined) return null;
  const slashOffset = match.index + match[0].lastIndexOf('/');
  let precedingBackslashes = 0;
  for (let index = slashOffset - 1; index >= 0 && text[index] === '\\'; index -= 1) precedingBackslashes += 1;
  if (precedingBackslashes % 2 === 1) return null;

  const from = $position.pos - (hasParentText ? $position.parentOffset! : text.length) + slashOffset;
  const to = $position.pos;
  if (from >= to) return null;
  return { range: { from, to }, query: match[1], text: match[0].slice(match[0].lastIndexOf('/')) };
}

export function insertScriptMarkdownCommand(editor: Editor, range: { from: number; to: number }, item: ScriptMarkdownCommand) {
  if (item.action === 'table') {
    editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    return;
  }

  if (item.action === 'callout') {
    const position = range.from;
    editor.chain()
      .focus()
      .deleteRange(range)
      .insertContentAt(position, { type: 'callout', attrs: { type: item.calloutType ?? 'NOTE' }, content: [{ type: 'paragraph' }] }, { updateSelection: false })
      .setTextSelection(position + 2)
      .run();
    return;
  }

  const chain = editor.chain().focus().deleteRange(range);
  switch (item.action) {
    case 'paragraph': chain.setParagraph(); break;
    case 'heading': chain.setHeading({ level: item.headingLevel ?? 1 }); break;
    case 'bulletList': chain.toggleBulletList(); break;
    case 'orderedList': chain.toggleOrderedList(); break;
    case 'taskList': chain.toggleTaskList(); break;
    case 'blockquote': chain.toggleBlockquote(); break;
    case 'codeBlock': chain.toggleCodeBlock(); break;
    case 'horizontalRule': chain.setHorizontalRule(); break;
    case 'bold': chain.toggleBold(); break;
    case 'italic': chain.toggleItalic(); break;
    case 'strike': chain.toggleStrike(); break;
    case 'underline': chain.toggleUnderline(); break;
    case 'inlineCode': chain.toggleCode(); break;
  }
  chain.run();
}

type CommandListRef = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };
type CommandListProps = {
  items: ScriptMarkdownCommand[];
  command: (item: ScriptMarkdownCommand) => void;
  editor: Editor;
  query: string;
};

const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listId = `script-markdown-commands-${useId().replace(/:/gu, '')}`;

  useEffect(() => {
    selectedIndexRef.current = 0;
    setSelectedIndex(0);
  }, [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.isComposing || event.keyCode === 229) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const length = props.items.length;
        if (!length) return true;
        const next = (selectedIndexRef.current + (event.key === 'ArrowDown' ? 1 : length - 1)) % length;
        selectedIndexRef.current = next;
        setSelectedIndex(next);
        return true;
      }
      if (event.key === 'Enter' && props.items.length) {
        event.preventDefault();
        props.command(props.items[selectedIndexRef.current] ?? props.items[0]);
        return true;
      }
      return false;
    },
  }), [props.items, props.command]);

  return (
    <div className="script-markdown-menu" role="listbox" id={listId} aria-label="Markdown 插入命令">
      <div className="script-markdown-menu-heading">Markdown 命令</div>
      <FloatingScrollbar className="script-markdown-menu-list" wrapperClassName="script-markdown-menu-scroll">
        {props.items.length ? props.items.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={`script-markdown-menu-item${index === selectedIndex ? ' is-selected' : ''}`}
              key={item.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => { selectedIndexRef.current = index; setSelectedIndex(index); }}
              onClick={() => props.command(item)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="script-markdown-menu-copy">
                <span>{item.label}</span>
                <small>{item.description}</small>
              </span>
            </button>
          );
        }) : <div className="script-markdown-menu-empty">没有匹配的命令</div>}
      </FloatingScrollbar>
      <div className="script-markdown-menu-footer"><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>Enter</kbd> 确认 <kbd>Esc</kbd> 关闭</div>
    </div>
  );
});
CommandList.displayName = 'ScriptMarkdownCommandList';

const scriptMarkdownSuggestionKey = 'scriptMarkdownSlashCommand';

export const ScriptMarkdownMenu = Extension.create({
  name: scriptMarkdownSuggestionKey,

  addProseMirrorPlugins() {
    return [Suggestion<ScriptMarkdownCommand>({
      editor: this.editor,
      char: '/',
      allowSpaces: true,
      allowedPrefixes: null,
      findSuggestionMatch: findScriptMarkdownCommandMatch,
      allow: ({ editor, state }) => {
        if (!editor.isEditable || editor.view.composing || !state.selection.empty) return false;
        const parentRole = state.selection.$from.node(-1)?.type.spec.tableRole;
        if (parentRole === 'cell' || parentRole === 'header_cell') return false;
        if (state.selection.$from.parent.type.spec.code || state.selection.$from.marks().some((mark) => mark.type.spec.code)) return false;
        return true;
      },
      items: ({ query }) => filterScriptMarkdownCommands(query),
      command: ({ editor, range, props }) => insertScriptMarkdownCommand(editor, range, props),
      render: () => {
        let component: ReactRenderer<CommandListRef> | null = null;
        let popup: HTMLDivElement | null = null;
        let activeClientRect: (() => DOMRect | null) | undefined;
        let positionFrame: number | null = null;

        const updatePosition = () => {
          if (!popup || !activeClientRect) return;
          const rect = activeClientRect();
          if (!rect) return;
          const padding = 12;
          const width = Math.min(360, window.innerWidth - padding * 2);
          const maxHeight = Math.min(380, window.innerHeight - padding * 2);
          popup.style.width = `${width}px`;
          popup.style.maxHeight = `${maxHeight}px`;
          const height = Math.min(popup.getBoundingClientRect().height || maxHeight, maxHeight);
          const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding));
          const below = rect.bottom + 6;
          const above = rect.top - height - 6;
          const top = below + height <= window.innerHeight - padding
            ? below
            : above >= padding
              ? above
              : Math.max(padding, Math.min(below, window.innerHeight - height - padding));
          popup.style.left = `${Math.round(left)}px`;
          popup.style.top = `${Math.round(Math.max(padding, top))}px`;
        };

        const schedulePosition = () => {
          if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
          positionFrame = window.requestAnimationFrame(() => {
            positionFrame = null;
            updatePosition();
          });
        };

        const destroy = () => {
          window.removeEventListener('resize', updatePosition);
          window.removeEventListener('scroll', updatePosition, true);
          if (positionFrame !== null) window.cancelAnimationFrame(positionFrame);
          positionFrame = null;
          activeClientRect = undefined;
          component?.destroy();
          component = null;
          popup?.remove();
          popup = null;
        };

        return {
          onStart: (props) => {
            destroy();
            popup = document.createElement('div');
            popup.className = 'script-markdown-menu-portal';
            document.body.appendChild(popup);
            component = new ReactRenderer(CommandList, { props, editor: props.editor });
            popup.appendChild(component.element);
            activeClientRect = props.clientRect as (() => DOMRect | null) | undefined;
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
            updatePosition();
            schedulePosition();
          },
          onUpdate: (props) => {
            component?.updateProps(props);
            activeClientRect = props.clientRect as (() => DOMRect | null) | undefined;
            updatePosition();
            schedulePosition();
          },
          onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
          onExit: destroy,
        };
      },
    })];
  },
});
