import { Node, mergeAttributes } from '@tiptap/core';

export const VoiceoverCueNode = Node.create({
  name: 'voiceoverCue',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      cue: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-cue') ||
          element.textContent?.replace(/^🎙️\s*/, '').replace(/^\[|\]$/g, '').trim() ||
          '',
        renderHTML: (attributes) => ({
          'data-cue': attributes.cue,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-cue]',
      },
      {
        tag: 'span.inline-voiceover-cue',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const cue = (node.attrs.cue || '').replace(/^\[|\]$/g, '').trim();
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-cue': cue,
        'class':
          'inline-voiceover-cue select-none inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800/80 align-baseline cursor-default shadow-2xs',
        'contenteditable': 'false',
      }),
      `🎙️ ${cue}`,
    ];
  },

  renderText({ node }) {
    const cue = (node.attrs.cue || '').replace(/^\[|\]$/g, '').trim();
    return `[${cue}]`;
  },
});
