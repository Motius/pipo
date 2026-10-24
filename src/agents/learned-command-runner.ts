/**
 * Learned-command replay runner — executes a zero-LLM replay of a taught
 * phrase. The POLICY (may this phrase replay at all?) lives in the sibling
 * decision module (./learned-command-decision.ts); this file carries the
 * effectful side: resolving the recorded action against the live tool
 * registry and the structural skill runtime, then counting the attempt.
 *
 * Separation exists for two reasons. Layering: the runner needs
 * BUILTIN_TOOLS, and the agent-facing tool file (`learn_command`) checks the
 * decision at teach time — a tool importing this file would cycle back
 * through builtin.ts and its own registration. And honesty: teach-time and
 * replay-time must call the SAME decision function, which they do — both
 * paths go through decideReplay here-exported from the decision module.
 */

import { BUILTIN_TOOLS } from '../actions/tools/builtin.ts';
import { getSidecarManager, autoTargetForCapability } from '../actions/tools/sidecar-route.ts';
import { captureSurface } from '../structural/surface.ts';
import { RPC_TIMEOUT } from '../actions/tools/skills.ts';
import { getSkillByName } from '../vault/skills.ts';
import {
  getLearnedCommandByTrigger, recordLearnedRun, type LearnedCommand,
} from '../vault/learned-commands.ts';
import { decideReplay, summaryOf, type ReplayDecision } from './learned-command-decision.ts';
import { runSkill, type SkillRunResult } from '../skills/runtime.ts';

export { decideReplay, REACHED_FORBIDDEN, type ReplayDecision } from './learned-command-decision.ts';

export type ReplayOutcome = { ok: boolean; message: string };

/**
 * Execute a free replay. Returns a confirmation sentence for the voice path.
 * Callers must satisfy themselves with decideReplay FIRST, because a
 * fall-over belongs to the normal turn, which only the caller owns.
 */
export async function replayLearnedCommand(
  cmd: LearnedCommand,
  currentSidecarId: string,
): Promise<ReplayOutcome> {
  const decision: ReplayDecision = decideReplay(cmd);
  if (decision.kind !== 'free') {
    // Counting includes refused replays: the score stays honest about
    // phrases that stopped working.
    recordLearnedRun(cmd.id, false);
    return { ok: false, message: decision.reason };
  }
  try {
    const note = await runFree(cmd, currentSidecarId);
    recordLearnedRun(cmd.id, note.ok);
    return note;
  } catch (err) {
    recordLearnedRun(cmd.id, false);
    console.warn('[LearnedCommands] replay failed:', err);
    return { ok: false, message: 'The learned command ran, but did not complete — check the log.' };
  }
}

async function runFree(cmd: LearnedCommand, currentSidecarId: string): Promise<ReplayOutcome> {
  const a = cmd.action;
  const target = cmd.target ?? currentSidecarId;
  if (a.type === 'tool') {
    const tool = toolDefinition(a.tool);
    if (!tool) return { ok: false, message: `the recorded tool "${a.tool}" no longer exists` };
    const forwarded: Record<string, unknown> = { ...a.args };
    // Replay where the phrase is spoken unless the phrase itself pins a
    // machine — a taught command means "the same thing I showed you", and the
    // natural machine for "the same" is the one in front of the person when
    // they say it.
    if (target && tool.parameters && Object.hasOwn(tool.parameters, 'target') && !Object.hasOwn(forwarded, 'target')) {
      forwarded.target = target;
    }
    const result = await tool.execute(forwarded);
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    const ok = !/^error/i.test(text.slice(0, 5));
    return { ok, message: ok ? `Done: ${summaryOf(cmd)}` : `The learned command failed: ${text.slice(0, 160)}` };
  }

  // Skill replay over the structural path. decideReplay already excluded
  // browser-surface skills; the deps below serve desktop-surface steps only,
  // matching the live deps run_skill builds (src/actions/tools/skills.ts).
  const skill = getSkillByName(a.skill);
  if (!skill) return { ok: false, message: `the skill "${a.skill}" no longer exists` };
  const result: SkillRunResult = await runSkill(skill, (a.args ?? {}) as Record<string, string>, replayDeps(target));
  const ok = result.ok;
  return { ok, message: ok
    ? `Done: ${summaryOf(cmd)}`
    : `The skill "${a.skill}" ran but did not verify: step ${result.steps[result.steps.length - 1]?.index ?? '~'}` };
}

function toolDefinition(name: string) {
  return BUILTIN_TOOLS.find((t) => t.name === name);
}

function replayDeps(explicitTarget?: string) {
  const manager = getSidecarManager();
  if (!manager) throw new Error('Sidecar system not initialized');
  const kindTarget = (kind: 'desktop' | 'browser'): string => {
    const t = explicitTarget || autoTargetForCapability(kind);
    if (!t) throw new Error(`no connected sidecar with the "${kind}" capability`);
    return t;
  };
  // A dispatch accepts a name or an id; resolve like the skill tools do.
  const sidecarIdFor = (nameOrId: string): string =>
    manager.listSidecars().find((s) => s.id === nameOrId || s.name === nameOrId)?.id ?? nameOrId;
  const dispatch = async (kind: 'desktop' | 'browser', method: string, params: Record<string, unknown>) =>
    manager.dispatchRPC(sidecarIdFor(kindTarget(kind)), method, params, RPC_TIMEOUT);
  return {
    snapshot: async (kind: 'desktop' | 'browser') => {
      const { surface } = await captureSurface({ kind, target: kindTarget(kind), full: false });
      return { nodes: surface.nodes, title: surface.root.title };
    },
    act: async (kind: 'desktop' | 'browser', sessionId: unknown, action: string | undefined, value: string | undefined) => {
      if (kind === 'browser') {
        if (action === 'set_value') await dispatch(kind, 'browser_ax_set_value', { backend_node_id: sessionId, value });
        else await dispatch(kind, 'browser_ax_click', { backend_node_id: sessionId });
        return;
      }
      await dispatch(kind, 'click_element', { element_id: sessionId, action, value });
    },
    raw: async (kind: 'desktop' | 'browser', action: string, value: string | undefined) => {
      // Same shape liveDeps uses: navigate is inherently a browser step,
      // launch_app a desktop one, press_keys follows the step's surface.
      if (action === 'navigate') await dispatch('browser', 'browser_navigate', { url: value });
      else if (action === 'press_keys') {
        await dispatch(kind, kind === 'browser' ? 'browser_press_key' : 'press_keys', { keys: value });
      } else if (action === 'launch_app') await dispatch('desktop', 'launch_app', { executable: value });
      // 'wait' step: nothing to dispatch, the runtime paces itself.
    },
  };
}

/** Whole pipeline used by the voice fast path: match, decide, replay, report.
 *  `null` means nothing is learned for the phrase (the chain moves on). */
export async function replayIfLearned(
  phrase: string,
  currentSidecarId: string,
): Promise<ReplayOutcome | null> {
  const cmd = getLearnedCommandByTrigger(phrase);
  if (!cmd) return null;
  const decision = decideReplay(cmd);
  if (decision.kind !== 'free') return { ok: false, message: decision.reason };
  return replayLearnedCommand(cmd, currentSidecarId);
}
