import { Mark, mergeAttributes } from '@tiptap/core';

export const CitationMark = Mark.create({
  name: 'citation',
  inclusive: false,
  markdownTokenName: 'citation',
  addAttributes() {
    return {
      citationId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-citation-id'),
        renderHTML: (attributes) => ({ 'data-citation-id': attributes.citationId }),
      },
      referenceTitle: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-reference-title'),
        renderHTML: (attributes) => ({ 'data-reference-title': attributes.referenceTitle }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-citation-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'script-citation' }), 0];
  },
  renderMarkdown(node, helpers) {
    const citationId = encodeURIComponent(String(node.attrs?.citationId || ''));
    const referenceTitle = String(node.attrs?.referenceTitle || '').replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
    const title = referenceTitle ? ` "${referenceTitle}"` : '';
    return `[${helpers.renderChildren(node)}](citation:${citationId}${title})`;
  },
});
