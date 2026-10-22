import type { NativeApp } from '../native';
import type { Person, PersonRelationship } from '../../types';
import { createId, jsonError, jsonValidationError, requireDb } from '../apiShared';
import {
  parseWithZod,
  personCreateSchema,
  personUpdateSchema,
  personRelationshipCreateSchema,
  personRelationshipUpdateSchema,
} from '../schemas';
import {
  deletePerson,
  deleteRelationship,
  insertPerson,
  insertRelationship,
  loadBootstrap,
  loadPeoplePage,
  loadRelationship,
  listPeopleOptions,
  updatePerson,
  updateRelationship,
  invalidatePublishedAnalyticsCache,
} from '../repositories';

export function registerPeopleRoutes(app: NativeApp): void {
  app.get('/people', async c => {
    try {
      const data = await loadBootstrap(requireDb(c), {
        includeTopics: false,
        includePeople: true,
        includeRelationships: false,
        includePublished: false,
        includeTags: false,
      });
      return c.json(data.people);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/people/page', async c => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '30', 10) || 30));
      return c.json(await loadPeoplePage(requireDb(c), { page, pageSize, query: c.req.query('q')?.slice(0, 200) }));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/people/options', async c => {
    try {
      return c.json(await listPeopleOptions(requireDb(c)));
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/people', async c => {
    try {
      const parsed = parseWithZod(personCreateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const now = new Date().toISOString();
      const person: Person = {
        id: parsed.data.id || createId('person'),
        name: parsed.data.name.trim(),
        aliases: parsed.data.aliases || '',
        avatar_url: parsed.data.avatar_url || '',
        description: parsed.data.description || '',
        identity: parsed.data.identity || '',
        platform_accounts: parsed.data.platform_accounts || '',
        quotes: parsed.data.quotes || '',
        notes: parsed.data.notes || '',
        created_at: parsed.data.created_at || now,
        updated_at: now,
      };
      await insertPerson(requireDb(c), person);
      invalidatePublishedAnalyticsCache();
      return c.json(person, 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.patch('/people/:id', async c => {
    try {
      const parsed = parseWithZod(personUpdateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const person = await updatePerson(requireDb(c), c.req.param('id'), parsed.data);
      if (person) invalidatePublishedAnalyticsCache();
      return person ? c.json(person) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/people/:id', async c => {
    try {
      await deletePerson(requireDb(c), c.req.param('id'));
      invalidatePublishedAnalyticsCache();
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/relationships', async c => {
    try {
      const data = await loadBootstrap(requireDb(c), {
        includeTopics: false,
        includePeople: false,
        includeRelationships: true,
        includePublished: false,
        includeTags: false,
      });
      return c.json(data.relationships);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/relationships', async c => {
    try {
      const parsed = parseWithZod(personRelationshipCreateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);
      const relationship: PersonRelationship = {
        id: parsed.data.id || createId('rel'),
        person_a_id: parsed.data.person_a_id,
        person_b_id: parsed.data.person_b_id,
        relationship: parsed.data.relationship.trim(),
        description: parsed.data.description || '',
        created_at: new Date().toISOString(),
      };
      await insertRelationship(requireDb(c), relationship);
      return c.json(await loadRelationship(requireDb(c), relationship.id), 201);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.patch('/relationships/:id', async c => {
    try {
      const db = requireDb(c);
      const id = c.req.param('id');
      const parsed = parseWithZod(personRelationshipUpdateSchema, await c.req.json());
      if (!parsed.success) return jsonValidationError(c, parsed.error, parsed.issues);

      const existing = await loadRelationship(db, id);
      if (!existing) return c.json({ error: 'Not found' }, 404);

      const nextA = parsed.data.person_a_id ?? existing.person_a_id;
      const nextB = parsed.data.person_b_id ?? existing.person_b_id;
      if (nextA === nextB) return c.json({ error: 'A person cannot relate to itself' }, 400);

      const relationship = await updateRelationship(db, id, parsed.data);
      return relationship ? c.json(relationship) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.delete('/relationships/:id', async c => {
    try {
      await deleteRelationship(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
