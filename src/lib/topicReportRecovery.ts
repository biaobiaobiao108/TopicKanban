export interface TopicReportRecoveryDraft {
  markdown: string;
  html: string;
  json: string;
  wordCount: number;
  baseVersion: number;
  savedAt: string;
}

const RECOVERY_KEY_PREFIX = 'topic_report_recovery_v1:';
const RECOVERY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function getRecoveryKey(topicId: string): string {
  return `${RECOVERY_KEY_PREFIX}${encodeURIComponent(topicId)}`;
}

function isRecoveryDraft(value: unknown): value is TopicReportRecoveryDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<TopicReportRecoveryDraft>;
  return (
    typeof draft.markdown === 'string' &&
    typeof draft.html === 'string' &&
    typeof draft.json === 'string' &&
    Number.isInteger(draft.wordCount) &&
    (draft.wordCount ?? -1) >= 0 &&
    Number.isInteger(draft.baseVersion) &&
    (draft.baseVersion ?? -1) >= 0 &&
    typeof draft.savedAt === 'string'
  );
}

function pruneExpiredRecoveries(storage: Storage, now: number): void {
  const expiredKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(RECOVERY_KEY_PREFIX)) continue;
    try {
      const value: unknown = JSON.parse(storage.getItem(key) || 'null');
      const savedAt = isRecoveryDraft(value) ? Date.parse(value.savedAt) : Number.NaN;
      if (!Number.isFinite(savedAt) || now - savedAt > RECOVERY_TTL_MS) expiredKeys.push(key);
    } catch {
      expiredKeys.push(key);
    }
  }
  expiredKeys.forEach(key => storage.removeItem(key));
}

export function readTopicReportRecovery(topicId: string): TopicReportRecoveryDraft | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const storage = localStorage;
    const key = getRecoveryKey(topicId);
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecoveryDraft(parsed)) {
      storage.removeItem(key);
      return null;
    }
    const savedAt = Date.parse(parsed.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > RECOVERY_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeTopicReportRecovery(topicId: string, draft: Omit<TopicReportRecoveryDraft, 'savedAt'>): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const storage = localStorage;
    pruneExpiredRecoveries(storage, Date.now());
    storage.setItem(getRecoveryKey(topicId), JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    // Storage may be unavailable or full. Keep editing and cloud autosave active.
    return false;
  }
}

export function clearTopicReportRecovery(topicId: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(getRecoveryKey(topicId));
  } catch {
    // A stale recovery copy is harmless; it will be compared with the server on next open.
  }
}

export function clearTopicReportRecoveryIfMatches(
  topicId: string,
  saved: Pick<TopicReportRecoveryDraft, 'markdown' | 'html' | 'json' | 'baseVersion'>,
): void {
  const current = readTopicReportRecovery(topicId);
  if (
    current &&
    current.markdown === saved.markdown &&
    current.html === saved.html &&
    current.json === saved.json &&
    current.baseVersion === saved.baseVersion
  ) {
    clearTopicReportRecovery(topicId);
  }
}
