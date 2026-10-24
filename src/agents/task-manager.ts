/**
 * Agent Task Manager — Background Async Task Runner
 *
 * Manages sub-agent tasks as background Promises. When a task is launched,
 * runSubAgent() fires without blocking — the caller gets a task ID and can
 * check status / collect results later.
 */

import { runSubAgent, type SubAgentResult, type ProgressCallback, type RunSubAgentOptions } from './sub-agent-runner.ts';
import type { AgentInstance } from './agent.ts';
import type { LLMManager } from '../llm/manager.ts';
import type { ToolRegistry } from '../actions/tools/registry.ts';

export type AsyncTaskStatus = 'running' | 'completed' | 'failed';

export type AsyncTask = {
  id: string;
  agentId: string;
  agentName: string;
  specialistId: string;
  task: string;
  status: AsyncTaskStatus;
  startedAt: number;
  completedAt: number | null;
  result: SubAgentResult | null;
  /**
   * Concise ambient-display summary of `result.response`, populated by the
   * daemon shortly after completion via a one-shot LLM call. Used by the
   * sub-pebble bubble to show a glance-readable version of long responses.
   * Null until the summary lands (or if summarization failed).
   */
  summary: string | null;
};

export type LaunchOptions = {
  agent: AgentInstance;
  task: string;
  context: string;
  llmManager: LLMManager;
  toolRegistry: ToolRegistry;
  onProgress?: ProgressCallback;
  onComplete?: (task: AsyncTask) => void;
  /** Authority gate for the background sub-agent; passed straight to runSubAgent. */
  authority?: Pick<RunSubAgentOptions, 'authorityEngine' | 'auditTrail' | 'emergencyController' | 'temporaryGrants' | 'profile' | 'taintGating'>;
  /** Provider kinds for the tool-relevance eligibility gate; passed straight to runSubAgent. */
  toolFilterProviders?: RunSubAgentOptions['toolFilterProviders'];
};

export type TaskLifecycleEvent = 'launch' | 'complete' | 'fail';
export type TaskLifecycleListener = (event: TaskLifecycleEvent, task: AsyncTask) => void;

/**
 * How many background agent tasks may run at once. Each is its own sub-agent
 * loop of up to 100 LLM calls, and nothing else bounds how many a turn or the
 * dashboard can start, so an unbounded fan-out is exactly the traffic shape a
 * hosted per-key rate limit exists to stop. Five is well past what a person
 * follows at once.
 */
export const MAX_RUNNING_TASKS = 5;

/** launch() refused because MAX_RUNNING_TASKS are already running. */
export class TaskCapacityError extends Error {
  constructor() {
    super(`${MAX_RUNNING_TASKS} agent tasks are already running. Wait for one to finish.`);
    this.name = 'TaskCapacityError';
  }
}

export class AgentTaskManager {
  private tasks = new Map<string, AsyncTask>();
  private listeners = new Set<TaskLifecycleListener>();
  /**
   * Steering notes waiting to be handed to a running sub-agent, keyed by
   * task ID. Written by steerTask(); drained (and cleared) by the
   * `pollSteer` closure handed to runSubAgent at launch, at the runner's
   * tool-turn boundary. Entries for finished tasks are dropped on
   * completion, so a steer raced against the finish never resurrects.
   */
  private pendingSteer = new Map<string, string[]>();

  /** `runSubAgentFn` is a test seam; production gets the real runner. */
  constructor(private readonly runSubAgentFn: typeof runSubAgent = runSubAgent) {}

  /**
   * Tasks currently running. A task whose agent was terminated still counts:
   * the sub-agent loop has no abort and keeps calling the model until it
   * finishes, and bounding that traffic is what the cap is for.
   */
  runningCount(): number {
    let n = 0;
    for (const task of this.tasks.values()) if (task.status === 'running') n++;
    return n;
  }

  /** Whether launch() would accept another task right now. */
  canLaunch(): boolean {
    return this.runningCount() < MAX_RUNNING_TASKS;
  }

  /**
   * Subscribe to lifecycle events (launch / complete / fail) for every task
   * that flows through this manager. Returns an unsubscribe function.
   * Used by the daemon's ambient UI to spawn / update / close sub-pebble
   * overlays as background work runs.
   */
  subscribeLifecycle(listener: TaskLifecycleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: TaskLifecycleEvent, task: AsyncTask): void {
    for (const listener of this.listeners) {
      try {
        listener(event, task);
      } catch (err) {
        console.error('[TaskManager] lifecycle listener error:', err);
      }
    }
  }

  /**
   * Launch a sub-agent task in the background. Returns task ID immediately.
   */
  launch(opts: LaunchOptions): string {
    const { agent, task, context, llmManager, toolRegistry, onProgress, onComplete, authority, toolFilterProviders } = opts;
    // The authoritative check, before anything is recorded: callers ask
    // canLaunch() first for a friendly answer, but this is what holds.
    if (!this.canLaunch()) throw new TaskCapacityError();

    const taskId = crypto.randomUUID();
    const asyncTask: AsyncTask = {
      id: taskId,
      agentId: agent.id,
      agentName: agent.agent.role.name,
      specialistId: agent.agent.role.id,
      task,
      status: 'running',
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      summary: null,
    };

    this.tasks.set(taskId, asyncTask);
    this.emit('launch', asyncTask);

    // Fire runSubAgent without awaiting — runs in background
    this.runSubAgentFn({
      agent,
      task,
      context,
      llmManager,
      toolRegistry,
      onProgress,
      toolFilterProviders,
      /**
       * The steer channel: the runner drains this at every provider-call
       * boundary. It reads and clears the per-task slot, so a pending note
       * is delivered exactly once, even if the loop cadence is slow — the
       * runner re-invokes this each iteration until the queue is empty.
       */
      pollSteer: () => {
        const pending = this.pendingSteer.get(taskId);
        if (!pending || pending.length === 0) return [];
        this.pendingSteer.set(taskId, []);
        return pending;
      },
      ...(authority ?? {}),
    }).then((result) => {
      // A steer that raced the finish is dropped with the slot: its person
      // gets steered nothing, but a queued slot can never resurface on a
      // LATER task for the same agent (task IDs are unique, but the slot
      // is memory all the same).
      this.pendingSteer.delete(taskId);
      asyncTask.status = 'completed';
      asyncTask.completedAt = Date.now();
      asyncTask.result = result;
      console.log(`[TaskManager] Task ${taskId} completed (${asyncTask.agentName})`);
      this.emit('complete', asyncTask);
      onComplete?.(asyncTask);
    }).catch((err) => {
      this.pendingSteer.delete(taskId);
      asyncTask.status = 'failed';
      asyncTask.completedAt = Date.now();
      asyncTask.result = {
        success: false,
        response: `Task failed: ${err instanceof Error ? err.message : String(err)}`,
        toolsUsed: [],
        tokensUsed: { input: 0, output: 0 },
        terminationReason: 'error',
        messages: [],
      };
      console.error(`[TaskManager] Task ${taskId} failed (${asyncTask.agentName}):`, err);
      this.emit('fail', asyncTask);
      onComplete?.(asyncTask);
    });

    return taskId;
  }

  /**
   * Get a task by its ID.
   */
  getTask(taskId: string): AsyncTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Hand a mid-run instruction to a RUNNING background sub-agent.
   *
   * Why queue instead of abort-and-relaunch: the sub-agent may be deep in
   * useful work (research fetched, files partially written), and the person
   * steering usually wants a correction folded INTO that work, not a restart
   * that throws it away. The note is delivered by the runner at its next
   * tool-turn boundary, so nothing interrupts a in-flight tool batch — a
   * `rm -rf` is not held in abeyance by this, and steering is deliberately
   * NOT an authority event: it says nothing about what the agent may do,
   * only what it should aim at.
   *
   * Returns
   *   'queued'    — the note reaches the sub-agent's next provider call.
   *   'unknown'   — no such task ID.
   *   'completed' / 'failed' — the run already ended; the caller gets the
   *                 honest answer and nothing is buffered.
   */
  steerTask(taskId: string, message: string): 'queued' | 'unknown' | 'completed' | 'failed' {
    const trimmed = message.trim();
    if (!trimmed) return 'unknown';
    const task = this.tasks.get(taskId);
    if (!task) return 'unknown';
    if (task.status !== 'running') return task.status;
    const slot = this.pendingSteer.get(taskId) ?? [];
    slot.push(trimmed);
    this.pendingSteer.set(taskId, slot);
    console.log(`[TaskManager] Steer queued for task ${taskId.slice(0, 8)}: ${trimmed.slice(0, 80)}`);
    return 'queued';
  }

  /**
   * Attach a post-hoc summary to an already-completed task. The daemon
   * fires this after running the task's response through a one-shot LLM
   * summarizer so the sub-pebble bubble can show a digestible version of
   * long outputs.
   */
  setSummary(taskId: string, summary: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.summary = summary;
  }

  /**
   * Find the current/most recent task for an agent.
   */
  getAgentTask(agentId: string): AsyncTask | undefined {
    let latest: AsyncTask | undefined;
    for (const task of this.tasks.values()) {
      if (task.agentId === agentId) {
        if (!latest || task.startedAt > latest.startedAt) {
          latest = task;
        }
      }
    }
    return latest;
  }

  /**
   * Check if an agent is currently running a task.
   */
  isAgentBusy(agentId: string): boolean {
    for (const task of this.tasks.values()) {
      if (task.agentId === agentId && task.status === 'running') {
        return true;
      }
    }
    return false;
  }

  /**
   * List all tasks, optionally filtered by status.
   */
  listTasks(filter?: { status?: AsyncTaskStatus }): AsyncTask[] {
    const all = Array.from(this.tasks.values());
    if (filter?.status) {
      return all.filter(t => t.status === filter.status);
    }
    return all;
  }

  /**
   * Remove completed/failed tasks older than maxAge (default 60 min). The
   * longer retention lets the ambient sub-pebble surface late task summaries;
   * the trade-off is more completed records (with result/summary strings) held
   * in the map at steady state.
   */
  cleanup(maxAgeMs = 60 * 60_000): number {
    let removed = 0;
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.status !== 'running' && task.completedAt && now - task.completedAt > maxAgeMs) {
        this.tasks.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
