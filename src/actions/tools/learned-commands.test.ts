import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { closeDb, initDatabase } from '../../vault/schema.ts';
import { setSkillSigningKey, upsertSkill } from '../../vault/skills.ts';
import { listLearnedCommands } from '../../vault/learned-commands.ts';
import { learnCommandTool, manageLearnedCommandsTool } from './learned-commands.ts';
import type { SkillStep } from '../../skills/types.ts';

const LAUNCH_STEPS: SkillStep[] = [
  { action: 'launch_app', value: 'notepad.exe', postcondition: { kind: 'window_appeared' } },
];
const BROWSER_STEPS: SkillStep[] = [
  { action: 'navigate', value: 'https://example.com', surface: 'browser' },
];

describe('learn_command tool', () => {
  beforeEach(() => { initDatabase(':memory:'); setSkillSigningKey(Buffer.alloc(32, 1)); });
  afterEach(() => { closeDb(); setSkillSigningKey(null); });
  afterAll(() => { setSkillSigningKey(null); });

  it('binds a phrase to a safe builtin tool and normalizes the trigger', async () => {
    const out = await learnCommandTool.execute!({ trigger: 'Read my clipboard', action_kind: 'tool', tool: 'get_clipboard' }) as string;
    expect(out).toContain('Learned: say');
    expect(out).toContain('get_clipboard');
    const rows = listLearnedCommands();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trigger).toBe('read my clipboard');
    expect(rows[0]!.action).toEqual({ type: 'tool', tool: 'get_clipboard', args: {} });
  });

  it('binds a phrase to a stored skill and accepts fixed args', async () => {
    upsertSkill({ name: 'note-dump', steps: LAUNCH_STEPS });
    const out = await learnCommandTool.execute!({
      trigger: 'note', action_kind: 'skill', skill: 'note-dump', args: '{}',
    }) as string;
    expect(out).toContain('note-dump');
    expect(listLearnedCommands()[0]!.action).toMatchObject({ type: 'skill', skill: 'note-dump' });
  });

  it('re-teaching the same phrase updates one row and repins it', async () => {
    void (await learnCommandTool.execute!({ trigger: 'morning', action_kind: 'tool', tool: 'get_clipboard' }));
    void (await learnCommandTool.execute!({ trigger: 'morning', action_kind: 'tool', tool: 'set_clipboard', args: '{"text":"hi"}' }));
    const rows = listLearnedCommands();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toEqual({ type: 'tool', tool: 'set_clipboard', args: { text: 'hi' } });
  });

  it('refuses unknown tools, destructive tools, missing skills and browser skills', async () => {
    expect(await learnCommandTool.execute!({ trigger: 'x', action_kind: 'tool', tool: 'not_a_tool' }))
      .toContain('not one of pipo\'s builtin tools');
    // run_command maps to execute_command: destructive, never a free phrase.
    expect(await learnCommandTool.execute!({ trigger: 'y', action_kind: 'tool', tool: 'run_command', args: '{"command":"ls"}' }))
      .toContain('Phrase not stored');
    expect(await learnCommandTool.execute!({ trigger: 'z', action_kind: 'skill', skill: 'ghost-skill' }))
      .toContain('No stored skill is named "ghost-skill"');
    expect(listLearnedCommands()).toHaveLength(0); // refusals store nothing
  });

  it('refuses a browser-surface skill phrase', async () => {
    upsertSkill({ name: 'nav', steps: BROWSER_STEPS });
    const out = await learnCommandTool.execute!({ trigger: 'nav', action_kind: 'skill', skill: 'nav' }) as string;
    expect(out).toContain('Phrase not stored');
  });

  it('shows what is already stored after each learn', async () => {
    void (await learnCommandTool.execute!({ trigger: 'first', action_kind: 'tool', tool: 'get_clipboard' }));
    const out = await learnCommandTool.execute!({ trigger: 'second', action_kind: 'tool', tool: 'get_system_info' }) as string;
    expect(out).toContain('"first"');
  });

  it('refuses an empty trigger and an unknown action_kind without writing', async () => {
    expect(await learnCommandTool.execute!({ trigger: '  ', action_kind: 'tool', tool: 'get_clipboard' }))
      .toContain('Error');
    expect(await learnCommandTool.execute!({ trigger: 'q', action_kind: 'macro', tool: 'get_clipboard' }))
      .toContain('Error');
    expect(listLearnedCommands()).toHaveLength(0);
  });
});

describe('manage_learned_commands tool', () => {
  beforeEach(() => { initDatabase(':memory:'); });
  afterEach(() => { closeDb(); });

  it('lists stored phrases with their counters and forgets by phrase', async () => {
    void (await learnCommandTool.execute!({ trigger: 'morning', action_kind: 'tool', tool: 'get_clipboard' }));
    const listing = await manageLearnedCommandsTool.execute!({ action: 'list' }) as string;
    expect(listing).toContain('"morning"');
    expect(listing).toContain('-> tool get_clipboard');

    const forgot = await manageLearnedCommandsTool.execute!({ action: 'forget', trigger: 'morning' }) as string;
    expect(forgot).toContain('Forgot the phrase "morning"');
    expect(listLearnedCommands()).toHaveLength(0);
  });

  it('forget is case-insensitive on the phrase and honest about unknown ones', async () => {
    void (await learnCommandTool.execute!({ trigger: 'Check Kit', action_kind: 'tool', tool: 'get_clipboard' }));
    const out = await manageLearnedCommandsTool.execute!({ action: 'forget', trigger: 'check kit' }) as string;
    expect(out).toContain('Forgot');
    expect(await manageLearnedCommandsTool.execute!({ action: 'forget', trigger: 'nothing-here' }))
      .toContain('no learned phrase');
    expect(await manageLearnedCommandsTool.execute!({ action: 'forget' })).toContain('Error');
  });

  it('list is honest when nothing is stored', async () => {
    expect(await manageLearnedCommandsTool.execute!({ action: 'list' }))
      .toContain('No phrases are stored yet');
  });
});
