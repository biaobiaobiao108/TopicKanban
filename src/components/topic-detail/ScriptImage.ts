import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';

export const ScriptImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Keep image titles in the Markdown source without rendering a tooltip.
      title: { default: null, rendered: false },
    };
  },

  renderHTML({ HTMLAttributes }) {
    const { title: _title, ...attributes } = HTMLAttributes;
    return ['img', mergeAttributes(attributes, { decoding: 'async', loading: 'lazy' })];
  },
});
