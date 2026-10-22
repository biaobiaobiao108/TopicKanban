import type { Topic } from '../types';

type TopicField = keyof Topic;
interface PendingField {
  baseValue: unknown;
  pending: Array<{ sequence: number; value: unknown }>;
  latestResolved?: { sequence: number; value: unknown };
}

/** Track individual fields so one failed write cannot undo another edit. */
export class TopicMutationTracker {
  private sequence = 0;
  private topics = new Map<string, Map<TopicField, PendingField>>();

  begin(topicId: string, updates: Partial<Topic>, currentTopic?: Topic): number {
    const sequence = ++this.sequence;
    const fields = this.topics.get(topicId) || new Map<TopicField, PendingField>();
    for (const field of Object.keys(updates) as TopicField[]) {
      const state = fields.get(field) || { baseValue: currentTopic?.[field], pending: [] };
      state.pending.push({ sequence, value: updates[field] });
      fields.set(field, state);
    }
    this.topics.set(topicId, fields);
    return sequence;
  }

  settle(topicId: string, updates: Partial<Topic>, sequence: number, serverTopic?: Partial<Topic>): Partial<Topic> {
    const fields = this.topics.get(topicId);
    const patch: Record<string, unknown> = {};
    for (const field of Object.keys(updates) as TopicField[]) {
      const state = fields?.get(field);
      const index = state?.pending.findIndex(entry => entry.sequence === sequence) ?? -1;
      if (!state || index < 0) continue;
      state.pending.splice(index, 1);
      if (serverTopic && (!state.latestResolved || state.latestResolved.sequence < sequence)) {
        state.latestResolved = {
          sequence,
          value: Object.prototype.hasOwnProperty.call(serverTopic, field) ? serverTopic[field] : updates[field],
        };
      }
      const latestPending = state.pending[state.pending.length - 1];
      patch[field] = latestPending
        ? latestPending.value
        : state.latestResolved
          ? state.latestResolved.value
          : state.baseValue;
      if (state.pending.length === 0) fields?.delete(field);
    }
    // These fields can be derived by the server even when absent from the edit.
    if (serverTopic) {
      for (const field of ['updated_at', 'is_pinned'] as const) {
        if (!(field in updates) && Object.prototype.hasOwnProperty.call(serverTopic, field)) {
          const pending = fields?.get(field)?.pending;
          patch[field] = pending?.length ? pending[pending.length - 1].value : serverTopic[field];
        }
      }
    }
    if (fields?.size === 0) this.topics.delete(topicId);
    return patch as Partial<Topic>;
  }
}
