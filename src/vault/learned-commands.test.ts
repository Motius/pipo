import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { closeDb, initDatabase } from './schema.ts';
import {
  deleteLearnedCommand, getLearnedCommandById, getLearnedCommandByTrigger, listLearnedCommands,
  normalizePhrase, recordLearnedRun, upsertLearnedCommand,
} from './learned-commands.ts';

describe('Vault - Learned commands', () => {
  beforeEach(() => { initDatabase(':memory:'); });
  afterEach(() => { closeDb(); });

  test('normalizePhrase absorbs the differences STT produces run to run', () => {
    expect(normalizePhrase('Open Spotify')).toBe('open spotify');
    expect(normalizePhrase('Hello!?  ===...world--')).toBe('hello world');
    expect(normalizePhrase('evening_layout')).toBe('evening layout');
    expect(normalizePhrase('')).toBe('');
  });

  test('upsert inserts by trigger then updates the action, keeping one row', () => {
    const a = upsertLearnedCommand({ trigger: 'Open Spotify', action: { type: 'tool', tool: 'desktop_launch_app', args: { executable: 'Spotify' } } });
    expect(a.trigger).toBe('open spotify');
    expect(a.runCount).toBe(0);

    const b = upsertLearnedCommand({ trigger: 'open spotify!', action: { type: 'tool', tool: 'desktop_launch_app', args: { executable: 'Spotify' } } });
    expect(b.id).toBe(a.id);
    expect(listLearnedCommands()).toHaveLength(1);
    const fetched = getLearnedCommandByTrigger('open spotify.')!;
    expect(fetched.action).toEqual({ type: 'tool', tool: 'desktop_launch_app', args: { executable: 'Spotify' } });
  });

  test('an empty trigger after normalization is refused', () => {
    expect(() => upsertLearnedCommand({ trigger: '!!!', action: { type: 'tool', tool: 'get_clipboard', args: {} } }))
      .toThrow(/non-empty trigger/);
  });

  test('delete removes exactly the one row', () => {
    const a = upsertLearnedCommand({ trigger: 'giveme', action: { type: 'tool', tool: 'get_clipboard', args: {} } });
    expect(getLearnedCommandById(a.id)!.id).toBe(a.id);
    expect(deleteLearnedCommand(a.id)).toBe(true);
    expect(getLearnedCommandById(a.id)).toBeUndefined();
    expect(deleteLearnedCommand(a.id)).toBe(false);
  });

  test('target can pin a sidecar, and absent reads as null', () => {
    const a = upsertLearnedCommand({ trigger: 'work check', action: { type: 'tool', tool: 'list_sidecars', args: {} }, target: 'work-laptop' });
    expect(a.target).toBe('work-laptop');
    const b = upsertLearnedCommand({ trigger: 'home check', action: { type: 'tool', tool: 'list_sidecars', args: {} } });
    expect(b.target).toBeNull();
  });

  test('recordLearnedRun accumulates outcome counters without touching trigger matching', () => {
    const a = upsertLearnedCommand({ trigger: 'morning brief', action: { type: 'skill', skill: 'morning-brief' } });
    recordLearnedRun(a.id, true);
    recordLearnedRun(a.id, false);
    recordLearnedRun(a.id, true);
    const got = getLearnedCommandById(a.id)!;
    expect(got.runCount).toBe(3);
    expect(got.successCount).toBe(2);
    expect(got.lastRunAt).toBeGreaterThan(0);
    expect(getLearnedCommandByTrigger('morning brief!')!.id).toBe(a.id);
  });
});
