import type { WorkflowEffectContext } from '../../runtime/effect-context';
import type { RouteContext } from './shared';

/** Identity headers come from piece execution context, never propsValue. */
export function workflowEffectContext(ctx: RouteContext): WorkflowEffectContext {
  let executionPath;
  const raw = ctx.req.headers.get('x-pipo-execution-path');
  if (raw) { try { executionPath = JSON.parse(raw); } catch { throw new Error('Invalid workflow execution path'); } }
  return { runId: ctx.claims.runId, projectId: ctx.claims.projectId, sandboxId: ctx.claims.sandboxId,
    stepName: ctx.req.headers.get('x-pipo-step-name') ?? undefined, executionPath };
}
