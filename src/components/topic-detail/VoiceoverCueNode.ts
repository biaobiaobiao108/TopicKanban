import { createInlineMarkdownSpec, Node, mergeAttributes } from '@tiptap/core';
import { getVoiceoverCueSymbol, getVoiceoverCueTone } from '../../lib/voiceoverCues';

const voiceoverCueMarkdown = createInlineMarkdownSpec({
  nodeName: 'voiceoverCue',
  name: 'cue',
  selfClosing: true,
  allowedAttributes: ['cue'],
});

export const VoiceoverCueNode = Node.create({
  name: 'voiceoverCue',
  markdownTokenName: 'voiceoverCue',
  ...voiceoverCueMarkdown,
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
          element.querySelector('.voiceover-cue-label')?.textContent?.trim() ||
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
        'data-cue-tone': getVoiceoverCueTone(cue),
        'class': 'inline-voiceover-cue select-none align-baseline cursor-default',
        'contenteditable': 'false',
      }),
      ['span', { class: 'voiceover-cue-symbol', 'aria-hidden': 'true' }, getVoiceoverCueSymbol(cue)],
      ['span', { class: 'voiceover-cue-label' }, cue],
    ];
  },

  renderText({ node }) {
    const cue = (node.attrs.cue || '').replace(/^\[|\]$/g, '').trim();
    return `[${cue}]`;
  },
});
