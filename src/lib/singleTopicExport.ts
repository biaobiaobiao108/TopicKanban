import type { Topic } from '../types';
import { exportSingleTopicMarkdown, fetchTopicWorkspace } from './storage';

/** Load the complete archive independently of which detail tabs have been opened. */
export async function fetchAndExportSingleTopicMarkdown(topic: Topic, readingSpeed: number): Promise<string> {
  const workspace = await fetchTopicWorkspace(topic.id);
  if (workspace.draft.conflict) {
    throw new Error('文案存在本机与云端版本冲突，请先在文案创作中解决后再导出');
  }
  return exportSingleTopicMarkdown(topic, {
    sources: workspace.sources,
    report: workspace.report,
    draft: workspace.draft.draft,
  }, readingSpeed);
}
