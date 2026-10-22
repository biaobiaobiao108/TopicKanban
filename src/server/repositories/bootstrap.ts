import type { BootstrapData, Person, PersonRelationship, PublishedVideo, Tag, Topic } from '../../types';
import type { Database } from 'bun:sqlite';
import { command, readTransaction } from './shared';
import { loadTopics } from './topics';

export interface BootstrapLoadOptions {
  includeTopics?: boolean;
  includePeople?: boolean;
  includeRelationships?: boolean;
  includePublished?: boolean;
  includeTags?: boolean;
}

export async function loadBootstrap(db: Database, options: BootstrapLoadOptions = {}): Promise<BootstrapData> {
  const includeTopics = options.includeTopics !== false;
  const includePeople = options.includePeople !== false;
  const includeRelationships = options.includeRelationships !== false;
  const includePublished = options.includePublished !== false;
  const includeTags = options.includeTags !== false;
  const queries = [
    includePeople
      ? command(
          db,
          `SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ORDER BY p.updated_at DESC`,
        )
      : command(db, 'SELECT NULL WHERE 1 = 0'),
    includeRelationships
      ? command(
          db,
          `SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
      FROM person_relationships r
      LEFT JOIN people a ON a.id = r.person_a_id
      LEFT JOIN people b ON b.id = r.person_b_id
      ORDER BY r.created_at DESC`,
        )
      : command(db, 'SELECT NULL WHERE 1 = 0'),
    includePublished
      ? command(
          db,
          `SELECT v.*, t.title AS topic_title FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id ORDER BY v.published_at DESC, v.updated_at DESC`,
        )
      : command(db, 'SELECT NULL WHERE 1 = 0'),
    includeTags
      ? command(db, 'SELECT id, name, color FROM tags ORDER BY name ASC')
      : command(db, 'SELECT NULL WHERE 1 = 0'),
  ];

  const [topics, otherResults] = await Promise.all([
    includeTopics ? loadTopics(db, 'active') : Promise.resolve([] as Topic[]),
    Promise.resolve(readTransaction(db, queries)),
  ]);

  return {
    topics,
    people: otherResults[0] as Person[],
    relationships: otherResults[1] as PersonRelationship[],
    published: otherResults[2] as PublishedVideo[],
    tags: otherResults[3] as Tag[],
  };
}
