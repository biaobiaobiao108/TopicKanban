import type {
  AppSettings,
  BootstrapData,
  Person,
  PersonRelationship,
  PublishedVideo,
  Tag,
  Topic,
} from '../../types';
import { DEFAULT_APP_SETTINGS } from '../../types';
import type { SqliteDatabase, SqlitePreparedStatement } from '../sqlite';
import { loadTopics } from './topics';

export interface BootstrapLoadOptions {
  includeTopics?: boolean;
  includePeople?: boolean;
  includeRelationships?: boolean;
  includePublished?: boolean;
  includeTags?: boolean;
}

export async function loadBootstrap(db: SqliteDatabase, kvSettings?: AppSettings, options: BootstrapLoadOptions = {}): Promise<BootstrapData> {
  const includeTopics = options.includeTopics !== false;
  const includePeople = options.includePeople !== false;
  const includeRelationships = options.includeRelationships !== false;
  const includePublished = options.includePublished !== false;
  const includeTags = options.includeTags !== false;
  const queries: SqlitePreparedStatement[] = [
    includePeople ? db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM topic_people tp WHERE tp.person_id = p.id) AS related_topics_count
      FROM people p ORDER BY p.updated_at DESC`) : db.prepare('SELECT NULL WHERE 1 = 0'),
    includeRelationships ? db.prepare(`SELECT r.*, a.name AS person_a_name, b.name AS person_b_name
      FROM person_relationships r
      LEFT JOIN people a ON a.id = r.person_a_id
      LEFT JOIN people b ON b.id = r.person_b_id
      ORDER BY r.created_at DESC`) : db.prepare('SELECT NULL WHERE 1 = 0'),
    includePublished ? db.prepare(`SELECT v.*, t.title AS topic_title FROM published_videos v
      LEFT JOIN topics t ON t.id = v.topic_id ORDER BY v.published_at DESC, v.updated_at DESC`)
      : db.prepare('SELECT NULL WHERE 1 = 0'),
    includeTags ? db.prepare('SELECT id, name, color FROM tags ORDER BY name ASC') : db.prepare('SELECT NULL WHERE 1 = 0'),
  ];

  const settings = kvSettings || DEFAULT_APP_SETTINGS;

  const [topics, otherResults] = await Promise.all([
    includeTopics ? loadTopics(db, 'active') : Promise.resolve([] as Topic[]),
    db.batch(queries),
  ]);

  return {
    topics,
    people: otherResults[0].results as unknown as Person[],
    relationships: otherResults[1].results as unknown as PersonRelationship[],
    published: otherResults[2].results as unknown as PublishedVideo[],
    tags: otherResults[3].results as unknown as Tag[],
    settings,
  };
}
