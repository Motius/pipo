import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { closeDb, getDb, initDatabase } from '../vault/schema.ts';
import { setSkillSigningKey, upsertSkill } from '../vault/skills.ts';
import { upsertLearnedCommand, getLearnedCommandByTrigger, recordLearnedRun } from '../vault/learned-commands.ts';
import { decideReplay, replayLearnedCommand } from './learned-command-runner.ts';
import type { SkillStep } from '../skills/types.ts';

const LAUNCH_STEPS: SkillStep[] = [
  { action: 'launch_app', value: 'Spotify', postcondition: { kind: 'window_appeared' } },
];
const SEND_STEPS: SkillStep[] = [
  { action: 'click', ref: { role: 'button', name: 'Send', path: [], ordinal: 0, sig: 'x' }, effect: 'send_message' },
];
const BROWSER_STEPS: SkillStep[] = [
  { action: 'navigate', value: 'https://example.com', surface: 'browser' },
];

describe('learned-command replay decisions', () => {
  beforeEach(() => { initDatabase(':memory:'); setSkillSigningKey(Buffer.alloc(32, 1)); });
  afterEach(() => { closeDb(); setSkillSigningKey(null); });

  test('a tool whose category is local read/write replays free', () => {
    const cmd = upsertLearnedCommand({ trigger: 'read clipboard', action: { type: 'tool', tool: 'get_clipboard', args: {} } });
    expect(decideReplay(cmd)).toEqual({
      kind: 'free', where: '', summary: 'runs get_clipboard',
    });
  });

  test('a destructive tool (run_command) falls over — never a bypass', () => {
    const cmd = upsertLearnedCommand({ trigger: 'exec', action: { type: 'tool', tool: 'run_command', args: { command: 'rm -rf /' } } });
    const d = decideReplay(cmd);
    expect(d.kind).toBe('fallover');
  });

  test('an unmapped tool name is unknown, never free', () => {
    const cmd = upsertLearnedCommand({ trigger: 'ogre', action: { type: 'tool', tool: 'not_a_tool', args: {} } });
    expect(decideReplay(cmd).kind).toBe('fallover');
  });

  test('a local, classifiable desktop skill replays free', () => {
    upsertSkill({ name: 'open-spotify', steps: LAUNCH_STEPS });
    const cmd = upsertLearnedCommand({ trigger: 'open spotify', action: { type: 'skill', skill: 'open-spotify' } });
    const d = decideReplay(cmd);
    expect(d.kind).toBe('free');
    if (d.kind === 'free') expect(d.summary).toContain('open-spotify');
  });

  test('a skill whose classifier sees a business effect falls over', () => {
    upsertSkill({ name: 'send-mail', steps: SEND_STEPS });
    const cmd = upsertLearnedCommand({ trigger: 'send it', action: { type: 'skill', skill: 'send-mail' } });
    expect(decideReplay(cmd).kind).toBe('fallover');
  });

  test('a browser-surface skill falls over without bypassing the URL policy', () => {
    upsertSkill({ name: 'check-page', steps: BROWSER_STEPS });
    const cmd = upsertLearnedCommand({ trigger: 'check the page', action: { type: 'skill', skill: 'check-page' } });
    const d = decideReplay(cmd);
    expect(d.kind).toBe('fallover');
  });

  test('a skill deleted or tampered after teaching falls over from live state', () => {
    upsertSkill({ name: 'evolve', steps: LAUNCH_STEPS });
    const cmd = upsertLearnedCommand({ trigger: 'evolve layout', action: { type: 'skill', skill: 'evolve' } });
    expect(decideReplay(cmd).kind).toBe('free');

    // Rewrite the stored steps under the row — the store reads tampered.
    const evil: SkillStep[] = [{ action: 'click', ref: { role: 'button', name: 'Delete all', path: [], ordinal: 0, sig: '' } }];
    getDb().prepare('UPDATE skills SET steps_json = ? WHERE id = ?').run(JSON.stringify(evil), upsertSkill({ name: 'evolve', steps: LAUNCH_STEPS }).id);
    expect(decideReplay(getLearnedCommandByTrigger('evolve layout')!).kind).toBe('fallover');

    // And a row that vanished entirely:
    const row = getDb().prepare('SELECT id FROM skills ORDER BY id LIMIT 1').get() as { id: string };
    getDb().prepare('DELETE FROM skills WHERE id = ?').run(row.id);
    const d = decideReplay(getLearnedCommandByTrigger('evolve layout')!);
    expect(d.kind).toBe('fallover');
    if (d.kind === 'fallover') expect(d.reason).toContain('no longer exists');
  });

  test('replayLearnedCommand runs the recorded builtin tool and counts the attempt', async () => {
    const cmd = upsertLearnedCommand({ trigger: 'list sidecars', action: { type: 'tool', tool: 'list_sidecars', args: {} } });
    const noManager = await replayLearnedCommand(cmd, 'missing-machine');
    expect(noManager.ok).toBe(true); // list_sidecars without a manager answers with a plain list, not an error
    expect(getLearnedCommandByTrigger('list sidecars')!.runCount).toBe(1);
  });

  test('run counters reflect failed replays too', async () => {
    const cmd = upsertLearnedCommand({ trigger: 'ogre', action: { type: 'tool', tool: 'not_a_tool', args: {} } });
    const out = await replayLearnedCommand(cmd, 'machine');
    expect(out.ok).toBe(false);
    expect(getLearnedCommandByTrigger('ogre')!.runCount).toBe(1);
    expect(getLearnedCommandByTrigger('ogre')!.successCount).toBe(0);
  });

  test('recordLearnedRun is discriminating: a failed one-outcome row reads so elsewhere', () => {
    const cmd = upsertLearnedCommand({ trigger: 'spacer', action: { type: 'tool', tool: 'get_clipboard', args: {} } });
    recordLearnedRun(cmd.id, false);
    recordLearnedRun(cmd.id, true);
    const got = getLearnedCommandByTrigger('spacer')!;
    expect(got.successCount).toBe(1);
    expect(got.runCount).toBe(2);
  });
});
