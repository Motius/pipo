/**
 * Skill catalog helpers for the dashboard Skills Room.
 *
 * Ported from the FounderOS skills-catalog concept (lib/skills-catalog.ts)
 * and adapted to pipo's vault model: instead of SKILL.md frontmatter on disk,
 * skills live in the vault `skills` table (src/vault/skills.ts), where the
 * hierarchy is Domain = the app a skill operates on and Group = its
 * provenance (recorded / authored / marketplace). Everything here is pure and
 * deterministic (no fs, no db) so it is unit-testable; the API routes in
 * src/daemon/api-skills-routes.ts call these with `listSkills(false)` output.
 */

import type { Skill } from './types.ts';

/** Display domain: the app a skill operates on; unnamed apps land in General. */
export function skillDomain(s: Pick<Skill, 'app'>): string {
  const app = s.app.trim();
  return app === '' ? 'General' : app;
}

/** Display group: how the skill came to be — the vault's provenance field. */
export function skillGroup(s: Pick<Skill, 'provenance'>): string {
  switch (s.provenance) {
    case 'recorded': return 'Recorded';
    case 'marketplace': return 'Marketplace';
    default: return 'Authored';
  }
}

/** "Domain/Group" path for a skill, the shape the hierarchy tree splits on. */
export function skillPath(s: Pick<Skill, 'app' | 'provenance'>): string {
  return `${skillDomain(s)}/${skillGroup(s)}`;
}

/** 0–100 success rate, or null when the skill has never run (no fake 0%). */
export function successRate(s: Pick<Skill, 'runCount' | 'successCount'>): number | null {
  if (s.runCount <= 0) return null;
  return Math.round((100 * s.successCount) / s.runCount);
}

/* ── New-skill intake ──
   The same two-phase flow FounderOS ships: describe → propose a placement
   from the REAL taxonomy (token overlap, deterministic tie-breaks) → create
   a draft. In pipo the draft is a vault row: enabled=false, steps=[] — listed
   everywhere, runnable nowhere, until it is edited or re-recorded. */

/** Directory-safe kebab-case: lowercase, ascii, hyphen-joined, no path chars. */
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isKebabCase(input: string): boolean {
  return KEBAB_RE.test(input);
}

export function toKebabCase(input: string, maxLen = 60): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (post-NFKD combining marks)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, maxLen).replace(/-+$/, '');
}

const NAME_STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'that', 'this', 'it', 'is', 'are', 'be', 'on', 'in',
  'with', 'my', 'our', 'i', 'want', 'wants', 'wanted', 'need', 'needs', 'should', 'would', 'can', 'you',
  'skill', 'new', 'when', 'about', 'into', 'from', 'me', 'us', 'so', 'do', 'does',
]);

/** First few meaningful words of a description, kebab-cased, as a fallback name. */
export function deriveSkillName(description: string, maxWords = 5): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NAME_STOPWORDS.has(w));
  const base = words.slice(0, maxWords).join('-') || 'draft-skill';
  return toKebabCase(base, 40) || 'draft-skill';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NAME_STOPWORDS.has(w));
}

export type PlacementGuess = { domain: string; group: string };

/**
 * Where a new skill's description best fits the REAL taxonomy: token overlap
 * between the description and each existing Domain/Group bucket's corpus
 * (its own name plus every skill's name, description, app, and match
 * keywords in it). Deterministic — ties break alphabetically. Pure, so no
 * vault read here; the caller passes `listSkills(false)`'s output. Returns
 * up to 3 candidates, best first ([0] is "proposed", the rest alternates).
 */
export function proposePlacement(description: string, catalog: Skill[]): PlacementGuess[] {
  const qTokens = new Set(tokenize(description));

  const corpora = new Map<string, Set<string>>(); // "Domain/Group" -> tokens
  for (const skill of catalog) {
    const groupPath = skillPath(skill);
    const set = corpora.get(groupPath) ?? new Set<string>();
    for (const t of tokenize(skill.name)) set.add(t);
    for (const t of tokenize(skill.description)) set.add(t);
    for (const t of tokenize(skill.app)) set.add(t);
    for (const k of skill.match.keywords ?? []) for (const t of tokenize(k)) set.add(t);
    for (const t of tokenize(groupPath.replace('/', ' '))) set.add(t);
    corpora.set(groupPath, set);
  }

  if (corpora.size === 0) return [{ domain: 'General', group: 'Authored' }];

  const scored = [...corpora.entries()].map(([groupPath, tokens]) => {
    const i = groupPath.indexOf('/');
    const domain = i === -1 ? groupPath : groupPath.slice(0, i);
    const group = i === -1 ? groupPath : groupPath.slice(i + 1);
    let score = 0;
    for (const t of qTokens) if (tokens.has(t)) score++;
    return { domain, group, score };
  });

  scored.sort((a, b) => b.score - a.score || a.domain.localeCompare(b.domain) || a.group.localeCompare(b.group));
  return scored.slice(0, 3).map(({ domain, group }) => ({ domain, group }));
}

/**
 * Render a stored skill as SKILL.md-style markdown for the reader drawer —
 * the same "frontmatter + prose" shape FounderOS shows, generated from the
 * vault row so the two never drift. Frontmatter carries name/description/
 * app; the body documents params, steps, and matching. Honest: integrity and
 * run stats appear as stored, never embellished.
 */
export function renderSkillMarkdown(s: Skill): string {
  const lines: string[] = [
    '---',
    `name: ${s.name}`,
    `description: ${s.description.replace(/\s+/g, ' ')}`,
    `app: ${s.app || '(any)'}`,
    `provenance: ${s.provenance}`,
    `version: ${s.version}`,
    `enabled: ${s.enabled}`,
    '---',
    '',
    s.description || '_No description._',
    '',
    '## Parameters',
    '',
  ];

  if (s.params.length === 0) {
    lines.push('_No parameters._', '');
  } else {
    lines.push('| name | type | required | description |', '| --- | --- | --- | --- |');
    for (const p of s.params) {
      const desc = p.description.replace(/\|/g, '\\|');
      lines.push(`| \`${p.name}\` | ${p.type} | ${p.required ? 'yes' : 'no'} | ${desc} |`);
    }
    lines.push('');
  }

  lines.push('## Steps', '');
  if (s.steps.length === 0) {
    lines.push('_No steps yet — this is a draft. Flesh it out or re-record it by demonstration._', '');
  } else {
    s.steps.forEach((step, i) => {
      const target = step.ref?.name ? ` "${step.ref.name}"` : '';
      const value = step.value ? ` → \`${step.value}\`` : '';
      const note = step.note ? ` — ${step.note}` : '';
      lines.push(`${i + 1}. \`${step.action}\`${target}${value}${note}`);
    });
    lines.push('');
  }

  lines.push('## Matching', '');
  const domains = s.match.domains ?? [];
  const processes = s.match.processNames ?? [];
  const keywords = s.match.keywords ?? [];
  if (domains.length) lines.push(`- domains: ${domains.map((d) => `\`${d}\``).join(', ')}`);
  if (processes.length) lines.push(`- processes: ${processes.map((p) => `\`${p}\``).join(', ')}`);
  if (keywords.length) lines.push(`- keywords: ${keywords.map((k) => `\`${k}\``).join(', ')}`);
  if (!domains.length && !processes.length && !keywords.length) lines.push('- _no match hints stored_');
  lines.push('');

  return lines.join('\n');
}
