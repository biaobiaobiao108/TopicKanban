import { useCallback, useEffect, useRef, useState } from 'react';
import CodeBlock from '@tiptap/extension-code-block';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import { Check, Copy } from 'lucide-react';
import { copyTextToClipboard } from '../../lib/clipboard';
import { useToast } from '../ui/Toast';

function ScriptCodeBlockView({ node }: ReactNodeViewProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  const copyCode = useCallback(async () => {
    const success = await copyTextToClipboard(node.textContent);
    if (!success) {
      showToast({ message: '复制代码失败，请检查浏览器剪贴板权限后重试', tone: 'error' });
      return;
    }

    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setCopied(false);
    }, 1400);
  }, [node.textContent, showToast]);

  return (
    <NodeViewWrapper className="script-code-block">
      <button
        type="button"
        className="script-code-block-copy"
        contentEditable={false}
        aria-label={copied ? '代码已复制' : '复制代码'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { void copyCode(); }}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span className="sr-only">{copied ? '代码已复制' : '复制代码'}</span>
      </button>
      <pre>
        <NodeViewContent<'code'> as="code" spellCheck={false} />
      </pre>
    </NodeViewWrapper>
  );
}

const ScriptCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ScriptCodeBlockView);
  },
});

export { ScriptCodeBlock };
