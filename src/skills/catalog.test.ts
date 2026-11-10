import { describe, expect, test } from 'bun:test';
import {
  deriveSkillName, isKebabCase, proposePlacement, renderSkillMarkdown,
  skillDomain, skillGroup, skillPath, successRate, toKebabCase,
} from './catalog.ts';
import type { Skill, SkillStep } from './types.ts';

/** Minimal vault-shaped skill for the pure helpers (no db involved). */
function fakeSkill(over: Partial<Skill> = {}): Skill {
  const steps: SkillStep[] = over.steps ?? [
    { action: 'click', ref: { role: 'button', name: 'Compose', path: [], ordinal: 0, sig: '' } },
    { action: 'set_value', ref: { role: 'textbox', name: 'Subject', path: [], ordinal: 0, sig: '' }, value: '{{subject}}' },
  ];
  return {
    id: over.id ?? 'sk-1',
    name: over.name ?? 'gmail-compose',
    app: over.app ?? 'Gmail',
    description: over.description ?? 'Compose and send an email in Gmail (web)',
    match: over.match ?? { domains: ['mail.google.com'], keywords: ['email', 'gmail'] },
    params: over.params ?? [{ name: 'to', type: 'string', description: 'Recipient', required: true }],
    steps,
    provenance: over.provenance ?? 'recorded',
    version: over.version ?? 1,
    enabled: over.enabled ?? true,
    integrity: over.integrity ?? 'ok',
    successCount: over.successCount ?? 0,
    runCount: over.runCount ?? 0,
    verifiedAt: over.verifiedAt,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('skill catalog — hierarchy projection', () => {
  test('domain falls back to General for an unnamed app', () => {
    expect(skillDomain({ app: 'Gmail' })).toBe('Gmail');
    expect(skillDomain({ app: '' })).toBe('General');
    expect(skillDomain({ app: '  ' })).toBe('General');
  });

  test('group mirrors provenance', () => {
    expect(skillGroup({ provenance: 'recorded' })).toBe('Recorded');
    expect(skillGroup({ provenance: 'authored' })).toBe('Authored');
    expect(skillGroup({ provenance: 'marketplace' })).toBe('Marketplace');
  });

  test('path joins domain/group', () => {
    expect(skillPath({ app: 'Gmail', provenance: 'recorded' })).toBe('Gmail/Recorded');
    expect(skillPath({ app: '', provenance: 'authored' })).toBe('General/Authored');
  });

  test('successRate is null at zero runs, honest otherwise', () => {
    expect(successRate({ runCount: 0, successCount: 0 })).toBeNull();
    expect(successRate({ runCount: 3, successCount: 2 })).toBe(67);
    expect(successRate({ runCount: 4, successCount: 4 })).toBe(100);
  });
});

describe('skill catalog — intake naming', () => {
  test('toKebabCase strips accents, punctuation, and path characters', () => {
    expect(toKebabCase('Invoice Chaser!')).toBe('invoice-chaser');
    expect(toKebabCase('  Créer un rapport  ')).toBe('creer-un-rapport');
    expect(toKebabCase('../../etc/passwd')).toBe('etc-passwd');
    expect(toKebabCase('---')).toBe('');
  });

  test('isKebabCase gates the create path', () => {
    expect(isKebabCase('invoice-chaser')).toBe(true);
    expect(isKebabCase('Invoice Chaser')).toBe(false);
    expect(isKebabCase('')).toBe(false);
  });

  test('deriveSkillName drops stopwords and falls back honestly', () => {
    expect(deriveSkillName('I want to chase invoices every week')).toBe('chase-invoices-every-week');
    expect(deriveSkillName('a a the')).toBe('draft-skill');
  });
});

describe('skill catalog — proposePlacement', () => {
  test('scores token overlap against the real taxonomy, best first', () => {
    const catalog = [
      fakeSkill({ name: 'gmail-compose', app: 'Gmail', description: 'compose and send an email', match: { keywords: ['email', 'compose'] } }),
      fakeSkill({ name: 'gcal-create-event', app: 'Google Calendar', description: 'create a calendar event', match: { keywords: ['calendar', 'meeting'] } }),
    ];
    const guesses = proposePlacement('send a calendar invite for a meeting with the team', catalog);
    expect(guesses.length).toBeGreaterThan(0);
    expect(guesses[0]!.domain).toBe('Google Calendar');
  });

  test('an empty catalog proposes General/Authored', () => {
    expect(proposePlacement('anything at all', [])).toEqual([{ domain: 'General', group: 'Authored' }]);
  });

  test('ties break alphabetically and the result is capped at 3', () => {
    const catalog = [
      fakeSkill({ name: 'a-thing', app: 'Zed', description: 'zzz' }),
      fakeSkill({ name: 'b-thing', app: 'Alpha', description: 'zzz' }),
      fakeSkill({ name: 'c-thing', app: 'Mid', description: 'zzz' }),
      fakeSkill({ name: 'd-thing', app: 'Extra', description: 'zzz' }),
    ];
    const guesses = proposePlacement('zzz', catalog);
    expect(guesses.length).toBe(3);
    expect(guesses[0]!.domain).toBe('Alpha');
  });
});

describe('skill catalog — renderSkillMarkdown', () => {
  test('frontmatter carries the honest row state; body documents params and steps', () => {
    const md = renderSkillMarkdown(fakeSkill({
      enabled: false,
      steps: [],
      params: [{ name: 'to', type: 'string', description: 'Recipient | owner', required: true }],
    }));
    expect(md).toContain('name: gmail-compose');
    expect(md).toContain('enabled: false');
    expect(md).toContain('app: Gmail');
    expect(md).toContain('`to`');
    expect(md).toContain('Recipient \\| owner'); // table pipes escaped
    expect(md).toContain('No steps yet — this is a draft');
  });

  test('steps render with action, target, and templated values', () => {
    const md = renderSkillMarkdown(fakeSkill());
    expect(md).toContain('1. `click` "Compose"');
    expect(md).toContain('2. `set_value` "Subject" → `{{subject}}`');
    expect(md).toContain('- domains: `mail.google.com`');
  });
});
