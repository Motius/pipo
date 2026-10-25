/**
 * Learned commands: trigger phrases that replay a recorded action with no LLM
 * call (why: latency and cost — the person taught pipo the step once, and the
 * phrase alone is the instruction after that). The vault counterpart of the
 * skills system's "record once, replay structurally": skills replay
 * SURFACE steps, this layer makes any recorded skill or single builtin tool
 * reachable by a spoken phrase through the voice fast path.
 *
 * SAFETY. A learned command stores WHAT to do, not WHO may do it. Whether the
 * phrase replays free or falls back to the normal LLM turn (where the
 * authority engine gates every tool) is decided at REPLAY time from live data
 * — the skill rows can change between teach and replay, so every gate check
 * re-reads the store. See src/daemon/learned-command-runner.ts.
 *
 * Counters (run_count / success_count) are outside any integrity hash the way
 * record_skill's run counters are outside the skill MAC: recording an outcome
 * must never need the key.
 */

import { getDb, generateId } from './schema.ts';

/** What the phrase replays. A threaded skill or exactly one builtin tool. */
export type LearnedAction =
  | { type: 'skill'; skill: string; args?: Record<string, string> }
  | { type: 'tool'; tool: string; args: Record<string, unknown> };

export type LearnedCommand = {
  id: string;
  trigger: string;
  action: LearnedAction;
  /** Pin to one sidecar when taught against one; null = run on whichever machine the phrase arrives. */
  target: string | null;
  createdBy: string;
  runCount: number;
  successCount: number;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type LearnedRow = {
  id: string;
  phrase: string;
  command_json: string;
  target: string | null;
  created_by: string;
  run_count: number;
  success_count: number;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
};

export function ensureLearnedCommandsSchema(db: import('bun:sqlite').Database): void {
  // The column is `phrase`, not `trigger`: TRIGGER is reserved in SQLite and an
  // unquoted column name of that spelling corrupts the INSERT's parameter
  // binding (the row lands with trigger NULL and the other columns shifted).
  db.run(`CREATE TABLE IF NOT EXISTS learned_commands (
    id TEXT PRIMARY KEY,
    phrase TEXT NOT NULL UNIQUE,
    command_json TEXT NOT NULL,
    target TEXT,
    created_by TEXT NOT NULL DEFAULT 'tool',
    run_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    last_run_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_learned_commands_phrase ON learned_commands(phrase)');
}

function rowToCommand(row: LearnedRow): LearnedCommand {
  return {
    id: row.id,
    trigger: row.phrase,
    action: JSON.parse(row.command_json) as LearnedAction,
    target: row.target,
    createdBy: row.created_by,
    runCount: row.run_count,
    successCount: row.success_count,
    lastRunAt: row.last_run_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Normalize a phrase for trigger comparison: lowercase, strip every
 * punctuation run and collapse whitespace. STT output differs run to run
 * mostly in casing and trailing punctuation; normalization must absorb
 * exactly those, and nothing more.
 */
export function normalizePhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function listLearnedCommands(): LearnedCommand[] {
  const rows = getDb().prepare('SELECT * FROM learned_commands ORDER BY phrase').all() as LearnedRow[];
  return rows.map(rowToCommand);
}

export function getLearnedCommandByTrigger(rawTrigger: string): LearnedCommand | undefined {
  const trigger = normalizePhrase(rawTrigger);
  const row = getDb().prepare('SELECT * FROM learned_commands WHERE phrase = ?').get(trigger) as LearnedRow | undefined;
  return row ? rowToCommand(row) : undefined;
}

export function getLearnedCommandById(id: string): LearnedCommand | undefined {
  const row = getDb().prepare('SELECT * FROM learned_commands WHERE id = ?').get(id) as LearnedRow | undefined;
  return row ? rowToCommand(row) : undefined;
}

export type UpsertLearnedCommand = {
  trigger: string;
  action: LearnedAction;
  target?: string | null;
  createdBy?: string;
};

/**
 * Insert by trigger, or update the action/target when the same trigger is
 * re-taught. Normalizing here (not just on lookup) guarantees the trigger
 * column is always the canonical form, so the UNIQUE constraint does the
 * collision work.
 */
export function upsertLearnedCommand(input: UpsertLearnedCommand): LearnedCommand {
  const db = getDb();
  const trigger = normalizePhrase(input.trigger);
  if (!trigger) throw new Error('A learned command needs a non-empty trigger phrase');
  const actionJson = JSON.stringify(input.action);
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM learned_commands WHERE phrase = ?').get(trigger) as { id: string } | undefined;
  if (existing) {
    db.run(`
      UPDATE learned_commands
      SET command_json = ?, target = ?, created_by = ?, updated_at = ?
      WHERE id = ?
    `, [actionJson, input.target ?? null, input.createdBy ?? 'tool', now, existing.id]);
    return getLearnedCommandById(existing.id)!;
  }
  const id = generateId();
  db.run(`
    INSERT INTO learned_commands (id, phrase, command_json, target, created_by, run_count, success_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
  `, [id, trigger, actionJson, input.target ?? null, input.createdBy ?? 'tool', now, now]);
  return getLearnedCommandById(id)!;
}

export function deleteLearnedCommand(id: string): boolean {
  const res = getDb().prepare('DELETE FROM learned_commands WHERE id = ?').run(id);
  return res.changes > 0;
}

/** Outcome counters: outside any integrity hash, same trade as the skill run counters. */
export function recordLearnedRun(id: string, success: boolean): void {
  getDb().prepare(`
    UPDATE learned_commands
    SET run_count = run_count + 1,
        success_count = success_count + ?,
        last_run_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(success ? 1 : 0, Date.now(), Date.now(), id);
}
