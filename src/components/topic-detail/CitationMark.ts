import { Mark, mergeAttributes } from '@tiptap/core';

export const CitationMark = Mark.create({
  name: 'citation',
  inclusive: false,
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
});
