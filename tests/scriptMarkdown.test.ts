import { describe, expect, it } from 'bun:test';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { MarkdownManager } from '@tiptap/markdown';
import { CitationMark } from '../src/components/topic-detail/CitationMark';
import { CalloutNode } from '../src/components/topic-detail/ScriptCalloutNode';
import { ScriptImage } from '../src/components/topic-detail/ScriptImage';
import { ScriptLink } from '../src/components/topic-detail/ScriptLink';
import { createTableExtensions } from '../src/components/topic-detail/ScriptTableExtensions';
import { VoiceoverCueNode } from '../src/components/topic-detail/VoiceoverCueNode';
import { shouldParseMarkdownPaste } from '../src/components/topic-detail/scriptMarkdownPaste';

const markdown = new MarkdownManager({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false }),
    ScriptLink,
    ScriptImage,
    TaskList,
    TaskItem.configure({ nested: true }),
    ...createTableExtensions(),
    CitationMark,
    VoiceoverCueNode,
    CalloutNode,
  ],
});

describe('script Markdown source', () => {
  it('parses and serializes the editor block and inline features', () => {
    const source = [
      '# 开场',
      '',
      '###### 六级标题',
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
      '![封面](https://example.test/cover.png "封面标题")',
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
    expect(json).toContain('"checked":false');
    expect(json).toContain('"checked":true');
    expect(json).toContain('"type":"table"');
    expect(json).toContain('"type":"callout"');
    expect(json).toContain('"citationId":"source-1"');
    expect(json).toContain('"type":"voiceoverCue"');
    expect(serialized).toContain('###### 六级标题');
    expect(serialized).toMatch(/\|\s*镜头\s*\|\s*旁白\s*\|/u);
    expect(serialized).toContain('> [!WARNING]');
    expect(serialized).toContain('![封面](https://example.test/cover.png "封面标题")');
    expect(serialized).toContain('[引用原文](citation:source-1 "来源标题")');
    expect(serialized).toContain('[cue cue="停顿"]');
  });

  it('detects Markdown pasted alongside rich clipboard HTML', () => {
    expect(shouldParseMarkdownPaste('# 标题\n\n- 项目', true)).toBe(true);
    expect(shouldParseMarkdownPaste('<p>普通富文本</p>', true)).toBe(false);
    expect(shouldParseMarkdownPaste('## 纯文本标题', false)).toBe(true);
  });
});
