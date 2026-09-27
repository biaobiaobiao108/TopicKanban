import type { EditorView } from '@tiptap/pm/view';

const MARKDOWN_PASTE_RE = /(?:^|\n)\s{0,3}(?:[#＃]{1,6}[\s\u3000]|[-+*＊＋－·•][\s\u3000]|\d+[.)、．][\s\u3000]|(?:\[(?: |x|X)\]|【(?: |x|X)】)[\s\u3000]|[>＞》〉][\s\u3000]|```|~~~|(?:-{3,}|_{3,}|(?:\*\s*){3,})\s*$)|(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^\)\n]+\))/u;

export function shouldParseMarkdownPaste(text: string, hasHtml: boolean) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return !hasHtml || MARKDOWN_PASTE_RE.test(text);
}

export function pastePlainTextIntoCodeBlock(view: EditorView, text: string) {
  if (!text) return false;
  const { $from, $to } = view.state.selection;
  if (!$from.parent.type.spec.code || !$from.sameParent($to)) return false;
  view.dispatch(view.state.tr.insertText(text).setMeta('uiEvent', 'paste').scrollIntoView());
  return true;
}
