import { describe, expect, it } from 'bun:test';
import { Editor } from '@tiptap/core';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { MarkdownManager } from '@tiptap/markdown';
import { CitationMark } from '../src/components/topic-detail/CitationMark';
import { CalloutNode } from '../src/components/topic-detail/ScriptCalloutNode';
import { ScriptLink } from '../src/components/topic-detail/ScriptLink';
import { ScriptCodeBlock } from '../src/components/topic-detail/ScriptCodeBlock';
import { ScriptStarterKit } from '../src/components/topic-detail/ScriptStarterKit';
import { createTableExtensions } from '../src/components/topic-detail/ScriptTableExtensions';
import { VoiceoverCueNode } from '../src/components/topic-detail/VoiceoverCueNode';
import { detectAndCleanImeLeak } from '../src/components/topic-detail/ImeMarkdownSafeExtension';
import { shouldParseMarkdownPaste } from '../src/components/topic-detail/scriptMarkdownPaste';
import {
  filterScriptMarkdownCommands,
  findScriptMarkdownCommandMatch,
  getNextGroupedScriptMarkdownCommandIndex,
  getNextScriptMarkdownCommandIndex,
  groupScriptMarkdownCommands,
} from '../src/components/topic-detail/ScriptMarkdownMenu';

const markdown = new MarkdownManager({
  extensions: [
    ScriptStarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false, codeBlock: false }),
    ScriptCodeBlock.configure({ exitOnTripleEnter: false }),
    ScriptLink,
    TaskList,
    TaskItem.configure({ nested: true }),
    ...createTableExtensions(),
    CitationMark,
    VoiceoverCueNode,
    CalloutNode,
  ],
});

describe('script Markdown source', () => {
  it('exits slash-menu inline formatting when a new line starts', () => {
    const markCommands = [
      ['bold', 'toggleBold'],
      ['italic', 'toggleItalic'],
      ['strike', 'toggleStrike'],
      ['underline', 'toggleUnderline'],
      ['code', 'toggleCode'],
    ] as const;

    for (const [markName, commandName] of markCommands) {
      const editor = new Editor({
        extensions: [ScriptStarterKit.configure({})],
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      });

      editor.commands[commandName]();
      editor.view.dispatch(editor.state.tr.insertText('格式文字'));
      expect(editor.isActive(markName)).toBe(true);
      editor.commands.splitBlock();

      expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(editor.isActive(markName)).toBe(false);
      expect(editor.state.storedMarks?.some((mark) => mark.type.name === markName) ?? false).toBe(false);
      editor.destroy();
    }
  });

  it('parses and serializes the editor block and inline features', () => {
    const source = [
      '# 开场',
      '',
      '###### 六级标题',
      '',
      '```ts',
      'const answer = 42;',
      '```',
      '',
      '- [ ] 待核实镜头',
      '- [x] 已核实旁白',
      '',
      '| 镜头 | 旁白 |',
      '| --- | --- |',
      '| 远景 | **故事开始** |',
      '',
      '> [!WARNING]',
      '> 需要复核的事实',
      '',
      '[公开资料](https://example.test/source "来源标题")',
      '[引用原文](citation:source-1 "来源标题")',
      '[cue cue="停顿"]',
      '`时间码` ~~删改~~ ++旁白提示++',
    ].join('\n');

    const document = markdown.parse(source);
    const serialized = markdown.serialize(document);
    const json = JSON.stringify(document);

    expect(json).toContain('"level":6');
    expect(json).toContain('"type":"codeBlock"');
    expect(json).toContain('"checked":false');
    expect(json).toContain('"checked":true');
    expect(json).toContain('"type":"table"');
    expect(json).toContain('"type":"callout"');
    expect(json).toContain('"citationId":"source-1"');
    expect(json).toContain('"type":"voiceoverCue"');
    expect(serialized).toContain('###### 六级标题');
    expect(serialized).toContain('```ts\nconst answer = 42;\n```');
    expect(serialized).toMatch(/\|\s*镜头\s*\|\s*旁白\s*\|/u);
    expect(serialized).toContain('> [!WARNING]');
    expect(serialized).toContain('[引用原文](citation:source-1 "来源标题")');
    expect(serialized).toContain('[cue cue="停顿"]');
  });

  it('groups the slash command directory and supports directional keyboard navigation', () => {
    const commands = filterScriptMarkdownCommands('');
    const columns = groupScriptMarkdownCommands(commands);

    expect(columns).toHaveLength(3);
    expect(columns.flatMap((column) => column.items.map((command) => command.id))).toEqual(commands.map((command) => command.id));
    expect(getNextGroupedScriptMarkdownCommandIndex(0, 'ArrowDown', columns.map((column) => column.items))).toBe(1);
    expect(getNextGroupedScriptMarkdownCommandIndex(0, 'ArrowRight', columns.map((column) => column.items))).toBe(columns[0].items.length);
    expect(getNextScriptMarkdownCommandIndex(0, 'ArrowUp', 4)).toBe(3);
  });

  it('filters slash commands by Chinese names and Markdown aliases', () => {
    expect(filterScriptMarkdownCommands('表格').map((command) => command.id)).toEqual(['table']);
    expect(filterScriptMarkdownCommands('checkbox').map((command) => command.id)).toEqual(['task-list']);
    expect(filterScriptMarkdownCommands('超链接').map((command) => command.id)).toEqual(['link']);
  });

  it('matches completed Chinese slash queries without requiring another keypress', () => {
    const query = '/一级标题';
    const match = findScriptMarkdownCommandMatch({
      $position: {
        pos: query.length + 1,
        parentOffset: query.length,
        parent: { textBetween: (from, to) => query.slice(from, to) },
      },
    });

    expect(match?.query).toBe('一级标题');
    expect(filterScriptMarkdownCommands(match?.query ?? '').map((command) => command.id)).toContain('heading-1');
  });

  it('detects Markdown pasted alongside rich clipboard HTML', () => {
    expect(shouldParseMarkdownPaste('# 标题\n\n- 项目', true)).toBe(true);
    expect(shouldParseMarkdownPaste('＃ 标题\n\n》 引用', true)).toBe(true);
    expect(shouldParseMarkdownPaste('【 】 待办', true)).toBe(true);
    expect(shouldParseMarkdownPaste('<p>普通富文本</p>', true)).toBe(false);
    expect(shouldParseMarkdownPaste('## 纯文本标题', false)).toBe(true);
  });

  it('only removes a tracked IME leak immediately after Markdown block conversion', () => {
    expect(detectAndCleanImeLeak('bi标题', false, 'bi')).toEqual({ cleaned: 'bi标题', leaked: null });
    expect(detectAndCleanImeLeak('bi标题', true, 'bi')).toEqual({ cleaned: '标题', leaked: 'bi' });
    expect(detectAndCleanImeLeak('bi标题', true, 'b')).toEqual({ cleaned: 'bi标题', leaked: null });
  });
});
