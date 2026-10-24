/**
 * Learned-command replay DECISION — whether a taught phrase may replay with
 * no LLM call. Pure policy: only vault reads and the classifiers the
 * run_skill authority gate already trust; none of the machinery that EXECUTES
 * a replay (that lives in the sibling runner, which needs the tool registry).
 *
 * THE RULE. A learned command stores what to do, never who may do it, and the
 * skill rows and tool map can change between teach and replay, so the answer
 * is computed fresh from live state on every look:
 *   - A stored single-builtin-tool replay is free only for tools whose
 *     current authority category has `read` or `write` IMPACT — the same
 *     split the voice approval gate already makes (src/roles/authority.ts):
 *     local reads and local writes replay immediately, anything that reaches
 *     outside (email, browser) or destroys (delete, payments, exec) falls
 *     back to the normal turn, where the authority engine gates and, where
 *     needed, asks.
 *   - A stored skill is free only while the skill row is intact (its MAC
 *     verifies) and the classifier's whole reachable footprint is the
 *     control_app floor plus read-like categories. The moment the classifier
 *     sees Send, Pay, a settings page or a delete, the phrase drops to the
 *     normal path — never to a bypass. Browser-surface skills always drop
 *     too: navigate steps carry the URL policy and page-effect review that
 *     belong to the governed path.
 */

import { getSkillByName } from '../vault/skills.ts';
import type { LearnedCommand, LearnedAction } from '../vault/learned-commands.ts';
import { resolveSkillEffect } from '../skills/effects.ts';
import { resolveArgs } from '../skills/types.ts';
import { impactFromCategory as impactOf, type ActionCategory } from '../roles/authority.ts';
import { TOOL_ACTION_MAP } from '../authority/tool-action-map.ts';

export type ReplayDecision =
  | { kind: 'free'; where: string; summary: string }
  | { kind: 'fallover'; reason: string };

/** Impact classes a zero-LLM replay may carry: the same split the voice
 *  approval gate makes (src/roles/authority.ts). Anything outward or
 *  destructive goes back through the governed turn. */
const REPLAYABLE_IMPACTS = new Set(['read', 'write']);

/**
 * Categories that, once REACHED by a skill's steps, end the free-replay
 * question: a run whose footprint includes a business effect runs through the
 * governed turn with its approval cards, even though send_message's IMPACT
 * ('write') would otherwise pass.
 */
export const REACHED_FORBIDDEN: ReadonlySet<ActionCategory> = new Set<ActionCategory>([
  'send_message', 'send_email', 'make_payment', 'delete_data',
  'modify_settings', 'execute_command', 'install_software', 'terminate_agent',
]);

export function summaryOf(cmd: LearnedCommand): string {
  const a = cmd.action;
  if (a.type === 'tool') {
    return `runs ${a.tool}${argsPreview(a.args)}`;
  }
  return `runs skill ${a.skill}${a.args ? argsPreview(a.args as Record<string, unknown>) : ''}`;
}

function argsPreview(args: Record<string, unknown> | undefined): string {
  const entries = Object.entries(args ?? {});
  if (entries.length === 0) return '';
  const flat = entries.map(([k, v]) => `${k}=${String(v).slice(0, 40)}`).join(', ');
  return ` (${flat.slice(0, 100)})`;
}

export function whereFor(cmd: LearnedCommand): string {
  return cmd.target ?? '';
}

/**
 * The live worst impact of a learned action, classified from current disk
 * state. `replayable` is the full free-replay verdict:
 *   - every category the run reaches has `read`/`write` impact (no external,
 *     no destructive);
 *   - and for skills, none of them reaches a business effect (send, pay,
 *     delete, settings changes, command execution). A run whose whole
 *     footprint is the control_app floor (launch, click, type) is what
 *     "instant" means here.
 */
export function worstImpact(action: LearnedAction): { replayable: boolean; detail: string } {
  if (action.type === 'tool') {
    const category = TOOL_ACTION_MAP[action.tool];
    if (!category) {
      return { replayable: false, detail: `"${action.tool}" is not an authority-classified builtin` };
    }
    const impact = impactOf(category);
    return {
      replayable: REPLAYABLE_IMPACTS.has(impact),
      detail: `reaches ${category} (${impact})`,
    };
  }
  const skill = getSkillByName(action.skill);
  if (!skill) return { replayable: false, detail: 'skill no longer exists' };
  if (skill.integrity !== 'ok') return { replayable: false, detail: `skill integrity is "${skill.integrity}"` };
  if (skill.steps.some((s) => (s.surface ?? 'desktop') === 'browser')) {
    return { replayable: false, detail: 'skill has browser-surface steps' };
  }
  // The same classification the run_skill authority gate trusts, over live
  // steps. `resolveSkillEffect` is pure (see src/skills/effects.ts).
  const args = resolveArgs(skill.params, (action.args ?? {}) as Record<string, string>);
  const effect = resolveSkillEffect(skill, args);
  if (effect.invalid) return { replayable: false, detail: 'skill does not classify cleanly' };
  const crossed = effect.categories.filter((c) => !REPLAYABLE_IMPACTS.has(impactOf(c)) || REACHED_FORBIDDEN.has(c));
  if (crossed.length > 0) {
    return { replayable: false, detail: `steps reach ${crossed.join(', ')}, which asks before it runs` };
  }
  return { replayable: true, detail: effect.intent };
}

/**
 * Decide: may this learned action replay with no LLM call?
 *
 * `fallover` means: run the normal turn instead — the phrase matched but the
 * action's current classification does not let a zero-LLM replay through.
 * fallover is the safe direction, and it is also what a wrap-around
 * (deleted skill, changed tool map) produces.
 */
export function decideReplay(cmd: LearnedCommand): ReplayDecision {
  const { replayable, detail } = worstImpact(cmd.action);
  if (replayable) {
    return { kind: 'free', where: whereFor(cmd), summary: summaryOf(cmd) };
  }
  return {
    kind: 'fallover',
    reason: `learned command can't replay free (${detail})`,
  };
}
