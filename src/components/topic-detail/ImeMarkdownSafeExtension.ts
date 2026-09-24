import { Extension, textblockTypeInputRule, wrappingInputRule } from '@tiptap/core';
import { Plugin, PluginKey, Transaction, EditorState } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';

export interface ImeSafePluginState {
  /** 记录最近刚刚通过 Markdown 快捷语法转换为空块的节点位置与时间 */
  convertedBlockPos: number | null;
  convertedBlockTime: number;
  /** 转换后记录的是否仅有孤立的小写拼音字母（如 'b'） */
  pendingLeakedChar: string | null;
  /** 当前是否处于输入法组合中 */
  isComposing: boolean;
}

export const ImeMarkdownSafePluginKey = new PluginKey<ImeSafePluginState>('imeMarkdownSafe');

/**
 * 获取当前选区所在的目标 Markdown 块级信息（支持 heading、codeBlock、以及包含在 blockquote / listItem 内的段落）
 */
function getTargetBlockInfo($from: ResolvedPos) {
  const currentBlock = $from.parent;
  const currentBlockType = currentBlock.type.name;

  if (['heading', 'codeBlock'].includes(currentBlockType)) {
    return {
      block: currentBlock,
      start: $from.start(),
      type: currentBlockType,
    };
  }

  // 如果当前是 paragraph，但祖先是 blockquote / listItem
  if (currentBlockType === 'paragraph') {
    for (let d = $from.depth - 1; d >= 1; d--) {
      const ancestor = $from.node(d);
      if (['blockquote', 'listItem'].includes(ancestor.type.name)) {
        return {
          block: currentBlock,
          start: $from.start(),
          type: ancestor.type.name,
        };
      }
    }
  }

  // 深度为 0 的边界容错
  if ($from.depth === 0 && $from.nodeAfter) {
    const node = $from.nodeAfter;
    if (['heading', 'blockquote', 'listItem', 'codeBlock'].includes(node.type.name)) {
      return {
        block: node,
        start: $from.pos + 1,
        type: node.type.name,
      };
    }
  }

  return null;
}

/**
 * 检测并清洗中文输入法在刚执行 Markdown 转换后孤立遗留的小写拼音首字母（如 "b标题" -> "标题"）
 */
export function detectAndCleanImeLeak(
  text: string,
  isWithinWindow = true
): { cleaned: string; leaked: string | null } {
  // 匹配 1-2 个小写英文字母紧贴汉字（如 "b标题" 或 "bi标题"）
  const match = text.match(/^([a-z]{1,2})([\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+)/);
  if (!match) {
    return { cleaned: text, leaked: null };
  }

  const leaked = match[1];
  // 仅在转换保护期内，或是新生成的短文本时执行自愈
  const isShortBlock = text.length <= 25;
  if (isWithinWindow || isShortBlock) {
    return {
      cleaned: text.slice(leaked.length),
      leaked,
    };
  }

  return { cleaned: text, leaked: null };
}

/**
 * 创建 ProseMirror IME Markdown 安全防护与自愈插件
 */
export function createImeMarkdownSafePlugin(): Plugin<ImeSafePluginState> {
  return new Plugin<ImeSafePluginState>({
    key: ImeMarkdownSafePluginKey,
    state: {
      init(): ImeSafePluginState {
        return {
          convertedBlockPos: null,
          convertedBlockTime: 0,
          pendingLeakedChar: null,
          isComposing: false,
        };
      },
      apply(
        tr: Transaction,
        prevState: ImeSafePluginState,
        oldState: EditorState,
        newState: EditorState
      ): ImeSafePluginState {
        const meta = tr.getMeta(ImeMarkdownSafePluginKey);
        let state = meta ? { ...prevState, ...meta } : prevState;

        // 只要文档发生了改变，跟踪块级转换和单字符输入
        if (tr.docChanged) {
          const { $from } = newState.selection;
          const targetInfo = getTargetBlockInfo($from);

          if (targetInfo) {
            const { block: currentBlock, start: blockStart, type: currentBlockType } = targetInfo;
            const blockText = currentBlock.textContent;

            // 阶段一：识别刚被 Markdown 语法转换的空块（内容为 0）
            if (blockText.length === 0) {
              const oldFrom = Math.min(oldState.selection.from, oldState.doc.content.size);
              const oldNode = oldState.doc.resolve(oldFrom).parent;
              if (oldNode.type.name !== currentBlockType || state.convertedBlockPos === null) {
                state = {
                  ...state,
                  convertedBlockPos: blockStart,
                  convertedBlockTime: Date.now(),
                  pendingLeakedChar: null,
                };
              }
            }
            // 阶段二：识别在转换后 8 秒内孤立泄漏的 1-2 个小写拼音字母
            else if (
              /^[a-z]{1,2}$/.test(blockText) &&
              state.convertedBlockPos !== null &&
              Date.now() - state.convertedBlockTime < 8000
            ) {
              state = {
                ...state,
                pendingLeakedChar: blockText,
              };
            }
          }
        }

        // 选区移动时维护或重置状态
        if (tr.selectionSet && state.convertedBlockPos !== null) {
          const currentPos = tr.selection.from;
          const mappedPos = tr.mapping.map(state.convertedBlockPos);
          if (Math.abs(currentPos - mappedPos) > 30) {
            state = {
              ...state,
              convertedBlockPos: null,
              convertedBlockTime: 0,
              pendingLeakedChar: null,
            };
          } else {
            state = {
              ...state,
              convertedBlockPos: mappedPos,
            };
          }
        } else if (state.convertedBlockPos !== null && tr.docChanged) {
          state = {
            ...state,
            convertedBlockPos: tr.mapping.map(state.convertedBlockPos),
          };
        }

        return state;
      },
    },

    props: {
      handleDOMEvents: {
        compositionstart: (view) => {
          view.dispatch(
            view.state.tr.setMeta(ImeMarkdownSafePluginKey, { isComposing: true })
          );
          return false;
        },
        compositionend: (view) => {
          view.dispatch(
            view.state.tr.setMeta(ImeMarkdownSafePluginKey, { isComposing: false })
          );
          return false;
        },
      },
    },

    appendTransaction(transactions, _oldState, newState) {
      const docChanged = transactions.some((tr) => tr.docChanged);
      const compositionEnded = transactions.some((tr) => {
        const meta = tr.getMeta(ImeMarkdownSafePluginKey) as { isComposing?: boolean } | undefined;
        return meta?.isComposing === false;
      });
      if (!docChanged && !compositionEnded) return null;

      const pluginState = ImeMarkdownSafePluginKey.getState(newState);
      if (!pluginState || pluginState.isComposing) return null;

      const { $from } = newState.selection;
      const targetInfo = getTargetBlockInfo($from);
      if (!targetInfo) return null;

      const { block: currentBlock, start: blockStart } = targetInfo;
      const blockText = currentBlock.textContent;

      const now = Date.now();
      const isWithinConvertedWindow =
        pluginState.convertedBlockPos !== null &&
        now - pluginState.convertedBlockTime < 8000;

      const { cleaned, leaked } = detectAndCleanImeLeak(blockText, isWithinConvertedWindow);

      if (leaked && cleaned !== blockText) {
        const tr = newState.tr;
        tr.delete(blockStart, blockStart + leaked.length);
        tr.setMeta(ImeMarkdownSafePluginKey, {
          convertedBlockPos: null,
          convertedBlockTime: 0,
          pendingLeakedChar: null,
        });
        return tr;
      }

      return null;
    },
  });
}

/**
 * 针对中文输入法（IME）在 Markdown 快捷语法转换（标题、引用、列表等）后首字母泄露的防御与自愈扩展。
 */
export const ImeMarkdownSafeExtension = Extension.create({
  name: 'imeMarkdownSafe',

  addInputRules() {
    // 增强中文输入法下的 Markdown 兼容：支持中文全角井号 `＃` 及全角空格 `\u3000`
    const rules = [];

    if (this.editor.schema.nodes.heading) {
      rules.push(
        textblockTypeInputRule({
          find: /^[#＃]{1,6}[\s\u3000]$/,
          type: this.editor.schema.nodes.heading,
          getAttributes: (match) => {
            const hashCount = match[0].replace(/[\s\u3000]/g, '').length;
            return { level: Math.min(Math.max(hashCount, 1), 3) };
          },
        })
      );
    }

    if (this.editor.schema.nodes.blockquote) {
      rules.push(
        wrappingInputRule({
          find: /^\s*[>＞》〉][\s\u3000]$/,
          type: this.editor.schema.nodes.blockquote,
        })
      );
    }

    if (this.editor.schema.nodes.bulletList) {
      rules.push(
        wrappingInputRule({
          find: /^\s*([*＊·•])[\s\u3000]$/,
          type: this.editor.schema.nodes.bulletList,
        })
      );
    }

    if (this.editor.schema.nodes.orderedList) {
      rules.push(
        wrappingInputRule({
          find: /^(\d+)[.、．][\s\u3000]$/,
          type: this.editor.schema.nodes.orderedList,
          getAttributes: (match) => ({ start: +match[1] }),
          joinPredicate: (match, node) => node.childCount + node.attrs.start === +match[1],
        })
      );
    }

    return rules;
  },

  addProseMirrorPlugins() {
    return [createImeMarkdownSafePlugin()];
  },
});
