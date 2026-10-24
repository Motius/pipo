import { describe, expect, test } from 'bun:test';
import { createManageAgentsTool } from './agents.ts';
import { AgentTaskManager } from '../../agents/task-manager.ts';

/**
 * The steer chain test: a REAL task manager with a runner seam the test
 * controls, driven through the manage_agents tool the model actually calls.
 * Everything else (orchestrator, specialists, llm) is a stub — the steer
 * path only reads taskManager and params.
 */
function steerHarness() {
  const pendingResolves: Array<(value: unknown) => void> = [];
  let lastOpts: { pollSteer?: () => string[] } | undefined;
  const runSubAgentFn = ((opts: { pollSteer?: () => string[] }) => {
    lastOpts = opts;
    return new Promise((resolve) => pendingResolves.push(resolve));
  }) as unknown as ConstructorParameters<typeof AgentTaskManager>[0];
  const taskManager = new AgentTaskManager(runSubAgentFn);
  const tool = createManageAgentsTool({
    taskManager,
    orchestrator: { getAgent: () => null, getAllAgents: () => [], terminateAgent: () => {} },
    llmManager: {},
    specialists: new Map(),
  } as never);
  const finishAll = () => {
    for (const resolve of pendingResolves.splice(0)) {
      resolve({
        success: true, response: 'done', toolsUsed: [],
        tokensUsed: { input: 0, output: 0 }, terminationReason: 'complete', messages: [],
      });
    }
  };
  return {
    tool,
    execute: (params: Record<string, unknown>) => (tool.execute as (p: Record<string, unknown>) => Promise<string>)(params),
    launch: () => taskManager.launch({
      agent: { id: 'a1', agent: { role: { id: 'r', name: 'Researcher' } } },
      task: 'write the report',
      context: '',
      llmManager: {},
      toolRegistry: {},
    } as never),
    drained: () => lastOpts?.pollSteer?.() ?? [],
    finishAll,
  };
}

describe('manage_agents steer action', () => {
  test('queues a correction for a running task and the runner drains it', async () => {
    const h = steerHarness();
    const taskId = h.launch();
    const out = await h.execute({
      action: 'steer', task_id: taskId, message: 'skip the second table, the person only needs the first',
    });
    expect(out).toContain('"steered":true');
    expect(out).toContain('before its next step');
    // The note reaches the runner's channel — the whole point of the action.
    expect(h.drained()).toEqual(['skip the second table, the person only needs the first']);
  });

  test('is honest about missing params, unknown tasks and finished tasks', async () => {
    const h = steerHarness();
    expect(await h.execute({ action: 'steer' })).toContain('"task_id" is required for steer');
    expect(await h.execute({ action: 'steer', task_id: 'x' })).toContain('"message" is required for steer');
    expect(await h.execute({ action: 'steer', task_id: 'nope', message: 'hi' })).toContain('"nope" not found');

    // A finished task: steering it is pointless and the answer says which one it was.
    const id = h.launch();
    await h.finishAll();
    expect(await h.execute({ action: 'steer', task_id: id, message: 'too late' }))
      .toContain('already completed');
  });

  test('unknown actions still list steer among the valid ones', async () => {
    const h = steerHarness();
    expect(await h.execute({ action: 'teleport' })).toContain('steer');
  });
});
