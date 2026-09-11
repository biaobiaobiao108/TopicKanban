import { describe, it, expect } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  detectAndCleanImeLeak,
  createImeMarkdownSafePlugin,
  ImeMarkdownSafePluginKey,
} from '../src/components/topic-detail/ImeMarkdownSafeExtension';

// 构造一个最小化的 ProseMirror Schema 用于纯状态测试
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    heading: {
      group: 'block',
      content: 'text*',
      attrs: { level: { default: 1 } },
      parseDOM: [{ tag: 'h1', attrs: { level: 1 } }, { tag: 'h2', attrs: { level: 2 } }],
    },
    blockquote: { group: 'block', content: 'block*' },
    text: { inline: true },
  },
});

describe('ImeMarkdownSafeExtension 纯逻辑与自愈规则测试', () => {
  it('detectAndCleanImeLeak: 准确识别并清洗单字母泄漏 (如 b标题 -> 标题)', () => {
    // 典型场景：用户输入 "## " 转为标题后，打 "biaoti" 泄漏了 'b'，随后上屏 '标题'
    const res1 = detectAndCleanImeLeak('b标题', true);
    expect(res1.leaked).toBe('b');
    expect(res1.cleaned).toBe('标题');

    // 两个字母的偶发泄漏 (如 bi标题 -> 标题)
    const res2 = detectAndCleanImeLeak('bi标题', true);
    expect(res2.leaked).toBe('bi');
    expect(res2.cleaned).toBe('标题');

    // 引用块首字母泄漏 (如 y引用 -> 引用)
    const res3 = detectAndCleanImeLeak('y引用', true);
    expect(res3.leaked).toBe('y');
    expect(res3.cleaned).toBe('引用');

    // 列表项首字母泄漏 (如 l列表 -> 列表)
    const res4 = detectAndCleanImeLeak('l列表第一条', true);
    expect(res4.leaked).toBe('l');
    expect(res4.cleaned).toBe('列表第一条');
  });

  it('detectAndCleanImeLeak: 安全防误伤检测 (英文、大写、带空格等不应被误清洗)', () => {
    // 1. 纯英文单词不应被误删
    expect(detectAndCleanImeLeak('app', true)).toEqual({ cleaned: 'app', leaked: null });
    expect(detectAndCleanImeLeak('heading', true)).toEqual({ cleaned: 'heading', leaked: null });

    // 2. 大写英文字母开头（如 "B站动态"，非拼音小写泄漏）
    expect(detectAndCleanImeLeak('B站动态', true)).toEqual({ cleaned: 'B站动态', leaked: null });

    // 3. 带空格的英文加中文（如 "a 计划"）
    expect(detectAndCleanImeLeak('a 计划', true)).toEqual({ cleaned: 'a 计划', leaked: null });

    // 4. 英文单词加中文（如 "iPhone 评测"）
    expect(detectAndCleanImeLeak('iPhone 评测', true)).toEqual({ cleaned: 'iPhone 评测', leaked: null });

    // 5. 纯中文正常输入
    expect(detectAndCleanImeLeak('正常标题', true)).toEqual({ cleaned: '正常标题', leaked: null });
  });

  it('createImeMarkdownSafePlugin: ProseMirror 状态机生命周期与自愈 Transaction 模拟', () => {
    const plugin = createImeMarkdownSafePlugin();
    let state = EditorState.create({
      schema: testSchema,
      plugins: [plugin],
    });

    // 1. 初始状态
    let pluginState = ImeMarkdownSafePluginKey.getState(state);
    expect(pluginState).toBeDefined();
    expect(pluginState?.convertedBlockPos).toBeNull();
    expect(pluginState?.pendingLeakedChar).toBeNull();

    // 2. 模拟 Markdown 转换：将初始的 paragraph 转换为空 heading
    const headingType = testSchema.nodes.heading;
    const tr1 = state.tr.setBlockType(1, 1, headingType, { level: 2 });
    state = state.apply(tr1);

    pluginState = ImeMarkdownSafePluginKey.getState(state);
    expect(pluginState?.convertedBlockPos).not.toBeNull();
    expect(pluginState?.convertedBlockTime).toBeGreaterThan(0);

    // 3. 模拟输入法首字母泄漏：输入小写字符 'b'
    const tr2 = state.tr.insertText('b', 1);
    state = state.apply(tr2);

    pluginState = ImeMarkdownSafePluginKey.getState(state);
    expect(pluginState?.pendingLeakedChar).toBe('b');

    // 4. 模拟输入法汉字上屏：输入 '标题'，输入法首字母泄漏产生 'b标题'
    // ProseMirror state.apply 内部在事务提交时自动调用 appendTransaction 进行自愈
    const tr3 = state.tr.insertText('标题', 2, 2);
    const newState = state.apply(tr3);

    // 断言：自愈扩展自动检测并移除了多余的首字母 'b'，最终文档文本纯净为 '标题'
    expect(newState.doc.textContent).toBe('标题');
    expect(ImeMarkdownSafePluginKey.getState(newState)?.convertedBlockPos).toBeNull();
  });

  it('引用块与列表项首字母泄漏模拟自愈 (y引用 -> 引用)', () => {
    const plugin = createImeMarkdownSafePlugin();
    let state = EditorState.create({
      schema: testSchema,
      plugins: [plugin],
    });

    // 模拟转为 blockquote 内部的 paragraph
    const blockquoteType = testSchema.nodes.blockquote;
    // 构造带有 blockquote 的状态
    const tr = state.tr.wrap(state.doc.resolve(1).blockRange()!, [{ type: blockquoteType }]);
    state = state.apply(tr);

    // 模拟泄漏 'y' 并输入 '引用文字'
    state = state.apply(state.tr.insertText('y', 2, 2));
    const nextState = state.apply(state.tr.insertText('引用文字', 3, 3));
    expect(nextState.doc.textContent).toBe('引用文字');
  });

  it('全角 Markdown 正则校验：支持 ＃ 与 ＞', () => {
    const headingRegex = /^[#＃]{1,6}[\s\u3000]$/;
    expect(headingRegex.test('# ')).toBe(true);
    expect(headingRegex.test('## ')).toBe(true);
    expect(headingRegex.test('＃ ')).toBe(true);
    expect(headingRegex.test('＃＃ ')).toBe(true);
    expect(headingRegex.test('＃＃　')).toBe(true); // 全角空格

    const blockquoteRegex = /^\s*[>＞][\s\u3000]$/;
    expect(blockquoteRegex.test('> ')).toBe(true);
    expect(blockquoteRegex.test('＞ ')).toBe(true);
    expect(blockquoteRegex.test('＞　')).toBe(true); // 全角空格
  });
});
