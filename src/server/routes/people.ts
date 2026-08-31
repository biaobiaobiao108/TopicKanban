import type { NativeApp } from '../native';
import type { Person, PersonRelationship } from '../../types';
import {
  createId,
  jsonError,
  requireDb,
  validateExternalUrlField,
  validateTextFields,
} from '../apiShared';
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
} from '../repositories';

export function registerPeopleRoutes(app: NativeApp): void {
  app.get('/people', async (c) => {
    try {
      const data = await loadBootstrap(requireDb(c), undefined, {
        includeTopics: false, includePeople: true, includeRelationships: false, includePublished: false, includeTags: false,
      });
      return c.json(data.people);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/people/page', async (c) => {
    try {
      const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(c.req.query('page_size') || '30', 10) || 30));
      return c.json(await loadPeoplePage(requireDb(c), { page, pageSize, query: c.req.query('q')?.slice(0, 200) }));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.get('/people/options', async (c) => {
    try {
      return c.json(await listPeopleOptions(requireDb(c)));
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.post('/people', async (c) => {
    try {
      const body = await c.req.json<Partial<Person>>();
      if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, {
        name: [200, true], aliases: [2000], avatar_url: [2048], description: [20000], identity: [2000],
        platform_accounts: [2000], quotes: [20000], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      const avatarUrlError = validateExternalUrlField(body as Record<string, unknown>, 'avatar_url');
      if (avatarUrlError) return c.json({ error: avatarUrlError }, 400);
      const now = new Date().toISOString();
      const person: Person = {
        id: body.id || createId('person'), name: body.name.trim(), aliases: body.aliases || '',
        avatar_url: body.avatar_url || '', description: body.description || '', identity: body.identity || '',
        platform_accounts: body.platform_accounts || '', quotes: body.quotes || '', notes: body.notes || '',
        created_at: body.created_at || now, updated_at: now,
      };
      await insertPerson(requireDb(c), person);
      return c.json(person, 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/people/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, {
        name: [200, true], aliases: [2000], avatar_url: [2048], description: [20000], identity: [2000],
        platform_accounts: [2000], quotes: [20000], notes: [20000],
      });
      if (textError) return c.json({ error: textError }, 400);
      const avatarUrlError = validateExternalUrlField(body, 'avatar_url');
      if (avatarUrlError) return c.json({ error: avatarUrlError }, 400);
      const person = await updatePerson(requireDb(c), c.req.param('id'), body);
      return person ? c.json(person) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/people/:id', async (c) => {
    try {
      await deletePerson(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.get('/relationships', async (c) => {
    try {
      const data = await loadBootstrap(requireDb(c), undefined, {
        includeTopics: false, includePeople: false, includeRelationships: true, includePublished: false, includeTags: false,
      });
      return c.json(data.relationships);
    } catch (error) {
      return jsonError(c, error);
    }
  });

  app.post('/relationships', async (c) => {
    try {
      const body = await c.req.json<Partial<PersonRelationship>>();
      if (!body.person_a_id || !body.person_b_id || !body.relationship?.trim()) {
        return c.json({ error: 'Both people and relationship are required' }, 400);
      }
      if (body.person_a_id === body.person_b_id) return c.json({ error: 'A person cannot relate to itself' }, 400);
      const textError = validateTextFields(body as Record<string, unknown>, { relationship: [200, true], description: [20000] });
      if (textError) return c.json({ error: textError }, 400);
      const relationship: PersonRelationship = {
        id: body.id || createId('rel'), person_a_id: body.person_a_id, person_b_id: body.person_b_id,
        relationship: body.relationship.trim(), description: body.description || '',
        created_at: body.created_at || new Date().toISOString(),
      };
      await insertRelationship(requireDb(c), relationship);
      return c.json(await loadRelationship(requireDb(c), relationship.id), 201);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.patch('/relationships/:id', async (c) => {
    try {
      const body = await c.req.json<Record<string, unknown>>();
      const textError = validateTextFields(body, { relationship: [200, true], description: [20000] });
      if (textError) return c.json({ error: textError }, 400);
      if (body.person_a_id !== undefined && body.person_a_id === body.person_b_id) return c.json({ error: 'A person cannot relate to itself' }, 400);
      const relationship = await updateRelationship(requireDb(c), c.req.param('id'), body);
      return relationship ? c.json(relationship) : c.json({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonError(c, error, 400);
    }
  });

  app.delete('/relationships/:id', async (c) => {
    try {
      await deleteRelationship(requireDb(c), c.req.param('id'));
      return c.json({ success: true });
    } catch (error) {
      return jsonError(c, error);
    }
  });
}
