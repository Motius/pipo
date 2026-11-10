/**
 * Skills Room API routes (FounderOS port): the catalog the dashboard Skills
 * Room reads, plus the "describe a new skill" intake.
 *
 *   GET  /api/skills            — every stored skill (drafts included) as
 *                                 card metadata; the Room groups by app.
 *   GET  /api/skills/:name      — one skill, whole: params, steps, match,
 *                                 run stats, and the generated SKILL.md the
 *                                 reader drawer renders.
 *   POST /api/skills/propose    — read-only placement proposal for the
 *                                 intake composer (token overlap over the
 *                                 real taxonomy; see src/skills/catalog.ts).
 *   POST /api/skills/create     — writes a real draft: enabled=false,
 *                                 steps=[], provenance=authored, signed by
 *                                 the same MAC every vault row carries. A
 *                                 draft is listed everywhere and runnable
 *                                 nowhere until it is filled in.
 *
 * The list route deliberately includes disabled and unsigned rows (the same
 * "honest about what's stored" rule listSkills documents): the Room shows
 * integrity + enabled as status chips instead of hiding them.
 */

import { getSkillByName, listSkills, upsertSkill } from '../vault/skills.ts';
import {
  deriveSkillName, isKebabCase, proposePlacement, renderSkillMarkdown,
  skillDomain, skillGroup, successRate, toKebabCase,
} from '../skills/catalog.ts';
import type { Skill } from '../skills/types.ts';

/** Names the intake endpoints own; a GET :name on them must 404, not match. */
const RESERVED_NAMES = new Set(['propose', 'create']);

/** Card shape for the Room: metadata only — steps stay behind the :name fetch. */
function skillToCard(s: Skill) {
  return {
    id: s.id,
    name: s.name,
    app: skillDomain(s),
    group: skillGroup(s),
    description: s.description,
    enabled: s.enabled,
    integrity: s.integrity,
    provenance: s.provenance,
    version: s.version,
    paramsCount: s.params.length,
    stepsCount: s.steps.length,
    runCount: s.runCount,
    successRate: successRate(s),
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
  };
}

export function createSkillRoutes(json: (data: unknown, status?: number) => Response) {
  return {
    '/api/skills': {
      GET: () => {
        const skills = listSkills(false); // drafts and unsigned rows included — the Room shows them honestly
        return json({
          skills: skills.map(skillToCard),
          total: skills.length,
        });
      },
    },

    '/api/skills/:name': {
      GET: (req: Request & { params: { name: string } }) => {
        const name = req.params.name;
        if (RESERVED_NAMES.has(name)) return json({ error: 'skill not found' }, 404);
        const skill = getSkillByName(name);
        if (!skill) return json({ error: 'skill not found' }, 404);
        return json({ skill, markdown: renderSkillMarkdown(skill) });
      },
    },

    '/api/skills/propose': {
      POST: async (req: Request) => {
        let body: { description?: unknown; name?: unknown };
        try {
          body = await req.json() as { description?: unknown; name?: unknown };
        } catch {
          return json({ error: 'Invalid JSON' }, 400);
        }
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (description.length < 8) {
          return json({ error: 'Describe it in a bit more detail — at least a sentence.' }, 400);
        }
        const rawName = typeof body.name === 'string' && body.name.trim() !== ''
          ? toKebabCase(body.name)
          : deriveSkillName(description);
        if (!rawName || !isKebabCase(rawName)) {
          return json({ error: 'skill name must be kebab-case (letters, numbers, hyphens)' }, 400);
        }
        if (getSkillByName(rawName)) {
          return json({ error: `a skill named "${rawName}" already exists` }, 409);
        }
        const placements = proposePlacement(description, listSkills(false));
        const proposed = placements[0] ?? { domain: 'General', group: 'Authored' };
        return json({
          name: rawName,
          proposed: { ...proposed, path: `${proposed.domain}/${proposed.group}/${rawName}` },
          alternates: placements.slice(1).map((p) => ({ ...p, path: `${p.domain}/${p.group}/${rawName}` })),
        });
      },
    },

    '/api/skills/create': {
      POST: async (req: Request) => {
        let body: { name?: unknown; description?: unknown; app?: unknown };
        try {
          body = await req.json() as { name?: unknown; description?: unknown; app?: unknown };
        } catch {
          return json({ error: 'Invalid JSON' }, 400);
        }
        const name = typeof body.name === 'string' ? toKebabCase(body.name) : '';
        if (!name || !isKebabCase(name)) {
          return json({ error: 'skill name must be kebab-case (letters, numbers, hyphens)' }, 400);
        }
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description) return json({ error: 'description is required' }, 400);
        const app = typeof body.app === 'string' && body.app.trim() !== '' && body.app.trim() !== 'General'
          ? body.app.trim()
          : '';

        if (getSkillByName(name)) {
          return json({ error: `a skill named "${name}" already exists` }, 409);
        }

        try {
          // The one write: a real, signed vault row that cannot run —
          // enabled=false keeps it out of every runnable list, and the empty
          // steps give the runtime nothing to replay even if it were enabled.
          const skill = upsertSkill({
            name,
            app,
            description,
            match: {},
            params: [],
            steps: [],
            provenance: 'authored',
            enabled: false,
          });
          return json({ ok: true, name: skill.name, app: skillDomain(skill), path: `${skillDomain(skill)}/${skillGroup(skill)}/${skill.name}` }, 201);
        } catch (err) {
          console.error('[Skills] Draft creation failed:', err);
          return json({ error: 'could not create the draft skill' }, 500);
        }
      },
    },
  };
}
