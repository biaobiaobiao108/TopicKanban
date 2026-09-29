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
  if (citation.reference_type === 'report') {
    // Report citations preserve the selected quote as their own immutable snapshot.
    // This context does not carry a versioned report body to compare against.
    return { snapshot: citation.reference_snapshot, verificationStatus: citation.verification_status };
  }
  if (citation.reference_type === 'outline') {
    if (citation.reference_id === 'hook') {
      return { snapshot: context.topic.hook || '', verificationStatus: 'confirmed' };
    }
    if (citation.reference_id === 'storyline') {
      return { snapshot: context.topic.storyline || '', verificationStatus: 'confirmed' };
    }
    return null;
  }
  return null;
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
