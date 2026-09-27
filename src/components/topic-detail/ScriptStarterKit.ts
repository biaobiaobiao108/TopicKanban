import StarterKit from '@tiptap/starter-kit';

const MARKS_EXITED_ON_SPLIT = new Set(['bold', 'italic', 'strike', 'underline', 'code']);

/** Keep slash-menu inline formatting scoped to the current text block. */
export const ScriptStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => (
      MARKS_EXITED_ON_SPLIT.has(extension.name)
        ? extension.extend({ keepOnSplit: false })
        : extension
    ));
  },
});
