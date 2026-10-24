import { describe, expect, test } from 'bun:test';
import { AgentTaskManager, MAX_RUNNING_TASKS, TaskCapacityError } from './task-manager.ts';

/** A runner whose tasks finish only when the test says so. */
function controllableRunner() {
  const pending: Array<(value: unknown) => void> = [];
  const run = (() => new Promise((resolve) => pending.push(resolve))) as unknown as ConstructorParameters<
    typeof AgentTaskManager
  >[0];
  const finishOne = () =>
    pending.shift()?.({
      success: true,
      response: 'done',
      toolsUsed: [],
      tokensUsed: { input: 0, output: 0 },
      terminationReason: 'complete',
      messages: [],
    });
  return { run, finishOne };
}

const launchOptions = (id: string) =>
  ({
    agent: { id, agent: { role: { name: `agent ${id}`, id: 'role' } } },
    task: 'do the thing',
    context: '',
    llmManager: {},
    toolRegistry: {},
  }) as unknown as Parameters<AgentTaskManager['launch']>[0];

describe('AgentTaskManager running-task cap', () => {
  test(`refuses a task past ${MAX_RUNNING_TASKS} running, leaves no record of it, and a finish frees a slot`, async () => {
    const runner = controllableRunner();
    const manager = new AgentTaskManager(runner.run);
    for (let i = 0; i < MAX_RUNNING_TASKS; i++) manager.launch(launchOptions(`a${i}`));
    expect(manager.runningCount()).toBe(MAX_RUNNING_TASKS);
    expect(manager.canLaunch()).toBe(false);

    expect(() => manager.launch(launchOptions('extra'))).toThrow(TaskCapacityError);
    expect(manager.listTasks()).toHaveLength(MAX_RUNNING_TASKS);

    runner.finishOne();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(manager.runningCount()).toBe(MAX_RUNNING_TASKS - 1);
    expect(manager.canLaunch()).toBe(true);
    expect(() => manager.launch(launchOptions('extra'))).not.toThrow();
  });
});

describe('AgentTaskManager.steerTask', () => {
  /**
   * The runner seam the steer tests read through: it captures the
   * `pollSteer` option launch() hands to the runner — that closure IS the
   * channel under test — and never resolves until the test says so, which
   * keeps the task running while the assertions drain it.
   */
  function steerCapturingRunner() {
    const pendingResolves: Array<(value: unknown) => void> = [];
    let lastOpts: { pollSteer?: () => string[] } | undefined;
    const run = ((opts: { pollSteer?: () => string[] }) => {
      lastOpts = opts;
      return new Promise((resolve) => pendingResolves.push(resolve));
    }) as unknown as ConstructorParameters<typeof AgentTaskManager>[0];
    return {
      run,
      drained: () => lastOpts?.pollSteer?.() ?? [],
      finishQueued: async () => {
        for (const resolve of pendingResolves.splice(0)) {
          resolve({
            success: true, response: 'done', toolsUsed: [],
            tokensUsed: { input: 0, output: 0 }, terminationReason: 'complete', messages: [],
          });
        }
        await Promise.resolve();
      },
    };
  }

  test('queues a note and drains it exactly once through the pollSteer channel', async () => {
    const runner = steerCapturingRunner();
    const manager = new AgentTaskManager(runner.run);
    const id = manager.launch(launchOptions('a'));
    expect(manager.steerTask(id, '  skip the second table  ')).toBe('queued');
    expect(manager.steerTask(id, 'and use /v2 endpoints')).toBe('queued');

    // First boundary: both notes leave together, in order.
    expect(runner.drained()).toEqual(['skip the second table', 'and use /v2 endpoints']);
    // Draining clears: the next boundary reads an empty channel.
    expect(runner.drained()).toEqual([]);
  });

  test('the queue is per task, and steering a finished or blank note is refused', async () => {
    const runner = steerCapturingRunner();
    const manager = new AgentTaskManager(runner.run);
    const id = manager.launch(launchOptions('a'));
    expect(manager.steerTask('no-such-id', 'x')).toBe('unknown');
    expect(manager.steerTask(id, '   ')).toBe('unknown'); // blank note, nothing to steer with

    await runner.finishQueued();
    expect(manager.getTask(id)?.status).toBe('completed');
    expect(manager.steerTask(id, 'too late')).toBe('completed');
    // And the raced-then-finished slot stays empty: a stale drain is [].
    expect(runner.drained()).toEqual([]);
  });
});
