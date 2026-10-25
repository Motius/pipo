/**
 * Learned command tools: learn_command (teach a phrase the voice fast path
 * replays with no LLM call) and manage_learned_commands (list / forget).
 *
 * WHY A TOOL AND NOT JUST THE VOICE PATH. The phrase is taught ONCE, usually
 * right after a bigger ask succeeded ("do it like that every time I say X").
 * The model is the one that knows which steps did the work, so it is the
 * model that saves the phrase; the fast path then keeps the phrase out of
 * every following turn entirely.
 *
 * WHAT MAY BE TAUGHT. Only actions the fast path would replay honestly:
 * a runnable skill (software-level verification of steps is the skill row's
 * own MAC) or one builtin tool, and only ones whose CURRENT classification
 * carries read/write impact — the same split as the free-replay gate
 * (src/agents/learned-command-runner.ts). Teaching a phrase that preserves a
 * governed action fails loudly instead of storing a soft bypass.
 */

import type { ToolDefinition, ToolGate } from './registry.ts';
import { TOOL_ACTION_MAP } from '../../authority/tool-action-map.ts';
import { getSidecarManager } from './sidecar-route.ts';
import { getSkillByName } from '../../vault/skills.ts';
import {
  deleteLearnedCommand, listLearnedCommands, upsertLearnedCommand, type LearnedAction,
} from '../../vault/learned-commands.ts';
import { decideReplay } from '../../agents/learned-command-decision.ts';

function resolveSidecarTarget(raw: unknown): string | { error: string } {
  const target = typeof raw === 'string' ? raw.trim() : '';
  if (!target) return '';
  const manager = getSidecarManager();
  if (!manager) return { error: 'no sidecar system is connected to resolve targets against' };
  const hit = manager.listSidecars().find((s) => s.id === target || s.name === target);
  return hit ? hit.id : { error: `no connected sidecar named "${target}"` };
}

function parseArgs(raw: unknown): Record<string, unknown> | { error: string } {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return { error: '`args` must be a JSON object string' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: '`args` must be a JSON object' };
    }
    return parsed as Record<string, unknown>;
  } catch {
    return { error: '`args` must be a JSON object string' };
  }
}

function teachRefuses(a: LearnedAction): string | null {
  if (a.type === 'tool') {
    if (!TOOL_ACTION_MAP[a.tool]) {
      return `Tool "${a.tool}" is not one of pipo's builtin tools, so no phrase is stored. List the tools you know and pick one.`;
    }
  } else {
    const skill = getSkillByName(a.skill);
    if (!skill) return `No stored skill is named "${a.skill}". record it first (record_skill), then learn_command the phrase.`;
  }
  // The live classification is the same read the replay will run; teaching a
  // phrase that would NEVER replay free is a lie to the person. The probe row
  // carries a random trigger so it can never collide with a real stored
  // phrase (an upsert onto an existing trigger would rewrite that row), and
  // the finally-block removes it either way.
  const probeTrigger = `pipo-teach-probe ${Math.random().toString(36).slice(2)}`;
  const cmd = upsertLearnedCommand({ trigger: probeTrigger, action: a });
  try {
    const decision = decideReplay(cmd);
    if (decision.kind === 'fallover') {
      return `Phrase not stored: ${decision.reason}. Such an action still runs through the normal turn with its approval cards; only local read/write actions are stored as free phrases.`;
    }
    return null;
  } finally {
    deleteLearnedCommand(cmd.id);
  }
}

export const learnCommandTool: ToolDefinition = {
  name: 'learn_command',
  description: [
    'Bind a short trigger phrase to a single action you can replay later with NO model call (fast, free): a stored skill by name, or one builtin tool with fixed arguments.',
    'Only local read/write actions can be taught; actions that email, browse, pay, delete or execute commands are refused as phrases — they keep running through the normal turn with their approvals.',
    'Use it when the person says to remember a shortcut ("when I say x, do y") after such an action just succeeded.',
    'The phrase replays exactly the action recorded — later changes to that skill/tool change what the phrase does.',
  ].join(' '),
  category: 'general',
  parameters: {
    trigger: { type: 'string', description: 'The exact phrase to watch for, as the person would say it. Keep it short and on its own ("morning layout", not "when I say morning layout do the thing").', required: true },
    action_kind: { type: 'string', description: 'What the phrase replays: "skill" (a recorded skill) or "tool" (one builtin tool).', required: true, enum: ['skill', 'tool'] },
    skill: { type: 'string', description: 'Stored skill name (when action_kind is "skill").', required: false },
    tool: { type: 'string', description: 'Builtin tool name (when action_kind is "tool").', required: false },
    args: { type: 'string', description: 'JSON object of fixed arguments for the skill or tool, if it takes any (e.g. {"executable":"Spotify"}).', required: false },
    target: { type: 'string', description: 'Sidecar name/ID to pin the replay to. Omit: the phrase runs where it is said.', required: false },
  },
  execute: async (params) => {
    const trigger = typeof params.trigger === 'string' ? params.trigger.trim() : '';
    if (!trigger) return 'Error: learn_command needs the trigger phrase to bind.';
    if (trigger.length > 80) return 'Error: a learned phrase is a voice trigger — keep it under 80 characters.';

    const kind = params.action_kind as string;
    const target = resolveSidecarTarget(params.target);
    if (typeof target === 'object') return `Error: ${target.error}`;

    let action: LearnedAction;
    if (kind === 'skill') {
      const skill = typeof params.skill === 'string' ? params.skill.trim() : '';
      if (!skill) return 'Error: action_kind "skill" needs the stored skill name in `skill`.';
      const parsedArgs = parseArgs(params.args);
      if ('error' in parsedArgs) return `Error: ${parsedArgs.error}`;
      const args: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsedArgs)) args[k] = String(v);
      action = { type: 'skill', skill, args };
    } else if (kind === 'tool') {
      const tool = typeof params.tool === 'string' ? params.tool.trim() : '';
      if (!tool) return 'Error: action_kind "tool" needs the builtin tool name in `tool`.';
      const parsedArgs = parseArgs(params.args);
      if ('error' in parsedArgs) return `Error: ${parsedArgs.error}`;
      action = { type: 'tool', tool, args: parsedArgs as Record<string, unknown> };
    } else {
      return 'Error: action_kind must be "skill" or "tool".';
    }

    const refusal = teachRefuses(action);
    if (refusal) return `Error: ${refusal}`;

    const saved = upsertLearnedCommand({ trigger, action, target: target || null, createdBy: 'model' });
    const kindDesc = saved.action.type === 'skill'
      ? `the skill "${saved.action.skill}"`
      : `the tool "${saved.action.tool}"`;
    const pin = saved.target ? ` It replays on ${saved.target}, wherever that phrase is heard.` : '';
    return [
      saved.runCount > 0 ? `Re-taught the phrase "${saved.trigger}" — it now runs ${kindDesc}.${pin}` : `Learned: say "${saved.trigger}" and pipo replays ${kindDesc} with no model call.${pin}`,
      priorListing(),
    ].filter(Boolean).join('\n');
  },
};

function priorListing(): string {
  const others = listLearnedCommands().filter((c) => c.trigger);
  if (others.length === 0) return '';
  return `Stored phrases now: ${others.map((c) => `"${c.trigger}"`).join(', ')}.`;
}

export const manageLearnedCommandsTool: ToolDefinition = {
  name: 'manage_learned_commands',
  description: 'List the phrases learned for the free replay fast path, or forget one. Forgetting takes the phrase, and nothing else, out of the fast path; the skill or tool it ran is untouched.',
  category: 'general',
  parameters: {
    action: { type: 'string', description: '"list" or "forget".', required: true, enum: ['list', 'forget'] },
    trigger: { type: 'string', description: 'The phrase to forget (required for "forget").', required: false },
  },
  // A gate can raise, never lower (registry.ts): forgetting a phrase is a
  // removal, so the card names exactly which phrase leaves the fast path and
  // gets delete_data on top of this tool's read_data floor.
  authorityGate: (params): ToolGate | null => {
    if (params.action !== 'forget') return null;
    const trigger = typeof params.trigger === 'string' ? params.trigger.trim() : '';
    return {
      actionCategory: 'delete_data',
      subject: { phrase: trigger },
      intent: trigger
        ? `Forget the learned phrase "${trigger}" (remove it from the no-model fast path)`
        : 'Forget a learned phrase',
    };
  },
  execute: async (params) => {
    const action = typeof params.action === 'string' ? params.action : '';
    if (action === 'forget') {
      const trigger = typeof params.trigger === 'string' ? params.trigger.trim() : '';
      if (!trigger) return 'Error: forget needs the trigger phrase to remove.';
      const saved = listLearnedCommands().find((c) => c.trigger === trigger.toLowerCase());
      if (!saved) return `Error: no learned phrase "${trigger}". Use list to see what is stored.`;
      deleteLearnedCommand(saved.id);
      return `Forgot the phrase "${saved.trigger}"; ${saved.action.type === 'skill' ? 'the skill is untouched' : 'the tool is untouched'}.`;
    }
    const cmds = listLearnedCommands();
    if (cmds.length === 0) return 'No phrases are stored yet. Teach one with learn_command after an action the person wants on tap.';
    return [
      `${cmds.length} learned phrase${cmds.length === 1 ? '' : 's'}:`,
      ...cmds.map((c) => {
        const action = c.action.type === 'skill'
          ? `skill ${c.action.skill}`
          : `tool ${c.action.tool}`;
        const uses = c.runCount > 0 ? `, used ${c.runCount}x` : '';
        return `- "${c.trigger}" -> ${action} (${c.target ?? 'wherever said'})${uses}`;
      }),
    ].join('\n');
  },
};

export const LEARNED_COMMAND_TOOLS: ToolDefinition[] = [learnCommandTool, manageLearnedCommandsTool];
