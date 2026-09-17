import type { Topic } from '../types';

export function matchesTopicSearch(topic: Topic, searchTerm: string): boolean {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return true;

  const searchableValues: unknown[] = [
    topic.title,
    topic.summary,
    topic.hook,
    topic.storyline,
    topic.current_todo?.title,
    ...(topic.tags || []).map((tag) => tag.name),
    ...(topic.people || []).flatMap((person) => [person.name, person.aliases, person.identity]),
  ];

  return searchableValues.some((value) => typeof value === 'string' && value.toLowerCase().includes(query));
}
