import Link from '@tiptap/extension-link';
import type { MarkdownToken } from '@tiptap/core';

type LinkMarkdownToken = MarkdownToken & {
  href?: string;
  title?: string | null;
  tokens?: MarkdownToken[];
};

function decodeCitationId(href: string) {
  try {
    return decodeURIComponent(href.slice('citation:'.length));
  } catch {
    return href.slice('citation:'.length);
  }
}

function escapeMarkdownTitle(value: string) {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

export const ScriptLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Keep Markdown titles in the document without showing a browser tooltip.
      title: { default: null, rendered: false },
    };
  },

  parseMarkdown(token, helpers) {
    const link = token as LinkMarkdownToken;
    const href = String(link.href || '');
    const content = helpers.parseInline(link.tokens || []);

    if (href.startsWith('citation:')) {
      return helpers.applyMark('citation', content, {
        citationId: decodeCitationId(href),
        referenceTitle: link.title || '',
      });
    }

    return helpers.applyMark('link', content, {
      href,
      title: link.title || null,
    });
  },

  renderMarkdown(node, helpers) {
    const href = String(node.attrs?.href || '');
    const title = String(node.attrs?.title || '');
    const label = helpers.renderChildren(node);
    return title
      ? `[${label}](${href} "${escapeMarkdownTitle(title)}")`
      : `[${label}](${href})`;
  },
});
