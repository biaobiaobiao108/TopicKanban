import { createInlineMarkdownSpec, Node, mergeAttributes } from '@tiptap/core';
import { getVoiceoverCueTone } from '../../lib/voiceoverCues';

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
        'class': 'inline-voiceover-cue select-none inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-full text-xs font-semibold align-baseline cursor-default',
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
