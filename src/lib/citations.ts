import type { DraftCitation, Source, TimelineEvent, Topic, VerificationStatus } from '../types';

interface CitationContext {
  topic: Topic;
  sources: Source[];
  timeline: TimelineEvent[];
}

interface CurrentReference {
  snapshot: string;
  verificationStatus: VerificationStatus;
}

function resolveCurrentReference(citation: DraftCitation, context: CitationContext): CurrentReference | null {
  if (citation.reference_type === 'source') {
    const source = context.sources.find((item) => item.id === citation.reference_id);
    return source ? {
      snapshot: source.content || source.title,
      verificationStatus: source.verification_status,
    } : null;
  }
  if (citation.reference_type === 'timeline') {
    const event = context.timeline.find((item) => item.id === citation.reference_id);
    return event ? {
      snapshot: `【${event.event_date}】${event.title}：${event.description || ''}`,
      verificationStatus: event.verification_status,
    } : null;
  }
  if (citation.reference_type === 'person') {
    const person = context.topic.people?.find((item) => item.id === citation.reference_id);
    return person ? {
      snapshot: `“${person.quotes}” —— ${person.name}`,
      verificationStatus: 'confirmed',
    } : null;
  }
  const value = citation.reference_id === 'hook' ? context.topic.hook : context.topic.storyline;
  return { snapshot: value || '', verificationStatus: 'confirmed' };
}

export function getCitationHealth(citations: DraftCitation[], context: CitationContext) {
  const states = citations.map((citation) => {
    const current = resolveCurrentReference(citation, context);
    return {
      citation,
      missing: !current,
      stale: !current || current.snapshot.trim() !== citation.reference_snapshot.trim(),
      unverified: (current?.verificationStatus || citation.verification_status) !== 'confirmed',
    };
  });
  return {
    states,
    staleCount: states.filter((state) => state.stale).length,
    unverifiedCount: states.filter((state) => state.unverified).length,
  };
}
