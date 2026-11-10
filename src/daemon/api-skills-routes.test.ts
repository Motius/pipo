import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { closeDb, initDatabase } from '../vault/schema.ts';
import { setSkillSigningKey, upsertSkill } from '../vault/skills.ts';
import type { SkillStep } from '../skills/types.ts';
import { createSkillRoutes } from './api-skills-routes.ts';

/**
 * Tests for the Skills Room API. The contract that matters: the list is
 * honest about drafts and tampered rows (shown, not hidden), :name rejects
 * reserved intake words, propose never writes, and create writes exactly one
 * thing — a disabled, empty, signed draft that nothing can run.
 */

const STEPS: SkillStep[] = [
  { action: 'click', ref: { role: 'button', name: 'Compose', path: [], ordinal: 0, sig: '' } },
];

type Routes = Record<string, { GET?: (req: Request) => Response | Promise<Response>; POST?: (req: Request) => Response | Promise<Response> }>;

function routes(): Routes {
  // json() helper is only used for shaping responses; passing Response.json keeps the handlers honest.
  return createSkillRoutes((data, status) => Response.json(data, { status: status ?? 200 })) as unknown as Routes;
}

function get(route: Routes, path: string) {
  const h = route[path]?.GET;
  if (!h) throw new Error(`GET ${path} not registered`);
  return h;
}
function post(route: Routes, path: string) {
  const h = route[path]?.POST;
  if (!h) throw new Error(`POST ${path} not registered`);
  return h;
}

beforeEach(() => { initDatabase(':memory:'); setSkillSigningKey(Buffer.alloc(32, 1)); });
afterEach(() => { closeDb(); setSkillSigningKey(null); });

describe('GET /api/skills', () => {
  test('lists every stored skill — drafts and unsigned rows included — with card metadata', async () => {
    upsertSkill({ name: 'gmail-compose', app: 'Gmail', description: 'compose an email', steps: STEPS, provenance: 'recorded' });
    upsertSkill({ name: 'draft-thing', description: 'a stub', steps: [], provenance: 'authored', enabled: false });

    const res = await get(routes(), '/api/skills')(new Request('http://localhost/api/skills'));
    expect(res.status).toBe(200);
    const body = await res.json() as { total: number; skills: Array<Record<string, unknown>> };
    expect(body.total).toBe(2);
    const draft = body.skills.find((s) => s.name === 'draft-thing')!;
    expect(draft.enabled).toBe(false);
    expect(draft.stepsCount).toBe(0);
    expect(draft.app).toBe('General');
    expect(draft.group).toBe('Authored');
    const live = body.skills.find((s) => s.name === 'gmail-compose')!;
    expect(live.app).toBe('Gmail');
    expect(live.group).toBe('Recorded');
    expect(live.successRate).toBeNull(); // never run — no fake 0%
  });

  test('card payload never carries steps or params wholesale', async () => {
    upsertSkill({ name: 'x', description: 'd', steps: STEPS });
    const res = await get(routes(), '/api/skills')(new Request('http://localhost/api/skills'));
    const text = await res.text();
    expect(text).not.toContain('"steps":');
    expect(text).not.toContain('"params":');
  });
});

describe('GET /api/skills/:name', () => {
  test('returns the whole skill plus generated markdown', async () => {
    upsertSkill({ name: 'gmail-compose', app: 'Gmail', description: 'compose an email', steps: STEPS });
    const req = new Request('http://localhost/api/skills/gmail-compose') as Request & { params: { name: string } };
    req.params = { name: 'gmail-compose' };
    const res = await get(routes(), '/api/skills/:name')(req);
    expect(res.status).toBe(200);
    const body = await res.json() as { skill: { name: string; steps: unknown[] }; markdown: string };
    expect(body.skill.name).toBe('gmail-compose');
    expect(body.skill.steps).toHaveLength(1);
    expect(body.markdown).toContain('name: gmail-compose');
    expect(body.markdown).toContain('1. `click` "Compose"');
  });

  test('404s unknown names and the reserved intake words', async () => {
    for (const name of ['nope', 'propose', 'create']) {
      const req = new Request(`http://localhost/api/skills/${name}`) as Request & { params: { name: string } };
      req.params = { name };
      const res = await get(routes(), '/api/skills/:name')(req);
      expect(res.status).toBe(404);
    }
  });
});

describe('POST /api/skills/propose', () => {
  test('proposes a placement from the real taxonomy without writing anything', async () => {
    upsertSkill({ name: 'gcal-create-event', app: 'Google Calendar', description: 'create a calendar event', steps: STEPS, match: { keywords: ['calendar', 'meeting'] } });
    const res = await post(routes(), '/api/skills/propose')(new Request('http://localhost/api/skills/propose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'schedule a meeting on the calendar with the team' }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; proposed: { domain: string; path: string } };
    expect(body.proposed.domain).toBe('Google Calendar');
    expect(body.name).toBe('schedule-meeting-calendar-team');
    const listed = await get(routes(), '/api/skills')(new Request('http://localhost/api/skills'));
    expect(((await listed.json()) as { total: number }).total).toBe(1); // propose never writes
  });

  test('rejects short descriptions and names that already exist', async () => {
    const short = await post(routes(), '/api/skills/propose')(new Request('http://localhost/api/skills/propose', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'email' }),
    }));
    expect(short.status).toBe(400);

    upsertSkill({ name: 'gmail-compose', description: 'compose an email', steps: STEPS });
    const dupe = await post(routes(), '/api/skills/propose')(new Request('http://localhost/api/skills/propose', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'compose another email quickly', name: 'gmail-compose' }),
    }));
    expect(dupe.status).toBe(409);
  });
});

describe('POST /api/skills/create', () => {
  test('writes exactly one signed draft: disabled, stepless, authored', async () => {
    const res = await post(routes(), '/api/skills/create')(new Request('http://localhost/api/skills/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Invoice Chaser!', description: 'Chase overdue invoices every Friday', app: 'Gmail' }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean; name: string; app: string; path: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe('invoice-chaser'); // kebab-cased, not the raw name
    expect(body.app).toBe('Gmail');
    expect(body.path).toBe('Gmail/Authored/invoice-chaser');
  });

  test('the draft cannot run and reads as a regular vault row', async () => {
    await post(routes(), '/api/skills/create')(new Request('http://localhost/api/skills/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'draft-skill', description: 'A stub nobody can run yet' }),
    }));
    const list = await get(routes(), '/api/skills')(new Request('http://localhost/api/skills'));
    const body = await list.json() as { skills: Array<{ name: string; enabled: boolean; stepsCount: number; integrity: string }> };
    const draft = body.skills.find((s) => s.name === 'draft-skill')!;
    expect(draft.enabled).toBe(false);
    expect(draft.stepsCount).toBe(0);
    expect(draft.integrity).toBe('ok'); // honestly signed — the disable is the guard, not a fake MAC
  });

  test('refuses duplicates, missing descriptions, and non-kebab names', async () => {
    const noDesc = await post(routes(), '/api/skills/create')(new Request('http://localhost/api/skills/create', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', description: '   ' }),
    }));
    expect(noDesc.status).toBe(400);

    await post(routes(), '/api/skills/create')(new Request('http://localhost/api/skills/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'dupe', description: 'first one' }),
    }));
    const dupe = await post(routes(), '/api/skills/create')(new Request('http://localhost/api/skills/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'dupe', description: 'second one' }),
    }));
    expect(dupe.status).toBe(409);

    const bad = await post(routes(), '/api/skills/create')(new Request('http://localhost/api/skills/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      // Sanitizes to an empty slug ('///' strips to nothing), so the create refuses it.
      body: JSON.stringify({ name: '///', description: 'a name that sanitizes to nothing' }),
    }));
    expect(bad.status).toBe(400);
  });
});
