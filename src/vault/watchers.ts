/**
 * Watchers: cheap, deterministic "tell me when …" state watches.
 *
 * A watcher asks an already-connected machine a single read question on a
 * schedule (window titles, clipboard contents) — no LLM anywhere in the loop,
 * so a watch costs nothing while it waits, the same trade Atticus's watches
 * make, and the opposite of a polling workflow, whose run history grows with
 * every tick. When a watcher fires it becomes a one-shot event: the daemon
 * delivers the note to every channel it already owns (pebble, dashboard,
 * Telegram) and may hand the follow-up prompt back to the brain.
 *
 * Poll and expiry are stored WITH the row so a restart re-animates the same
 * watch with the same cadence; `status` is the only ever-changing column and
 * 'fired' is terminal — a watch fires once, even if the condition holds for
 * longer than the poll gap.
 */

import { getDb, generateId } from './schema.ts';

export type WatcherKind = 'window_title' | 'clipboard';

export type WatcherPredicate = {
  /** Substring (case-insensitive) the watched text must contain. */
  match: string;
  /** RegExp shorthand, matched against the same text. Optional. */
  regex?: string;
};

export type WatcherStatus = 'active' | 'fired' | 'cancelled' | 'expired';

export type Watcher = {
  id: string;
  kind: WatcherKind;
  predicate: WatcherPredicate;
  sidecarId: string;
  pollMs: number;
  expiresAt: number;
  /** Natural-language prompt handed to the brain when the watcher fires (optional). */
  followup: string | null;
  createdBy: string;
  status: WatcherStatus;
  /** What the watch found when it fired, for the notification and audit. */
  resultNote: string | null;
  firedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type WatcherRow = {
  id: string;
  kind: string;
  predicate: string;
  sidecar_id: string;
  poll_ms: number;
  expires_at: number;
  followup: string | null;
  created_by: string;
  status: string;
  result_note: string | null;
  fired_at: number | null;
  created_at: number;
  updated_at: number;
};

export const WATCHER_KINDS: readonly WatcherKind[] = ['window_title', 'clipboard'];

/** Poll fast enough to feel like one, slow enough to be free: 5 s is the watch cadence. */
export const DEFAULT_WATCH_POLL_MS = 5_000;
export const MIN_WATCH_POLL_MS = 3_000;
export const MAX_WATCH_POLL_MS = 15 * 60_000;
/** A watch is a today-thing, not a cron job: default 8h gives way to workday waits. */
export const DEFAULT_WATCH_TTL_MS = 8 * 60 * 60_000;

export function ensureWatcherSchema(db: import('bun:sqlite').Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS watchers (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('window_title','clipboard')),
    predicate TEXT NOT NULL,
    sidecar_id TEXT NOT NULL,
    poll_ms INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    followup TEXT,
    created_by TEXT NOT NULL DEFAULT 'tool',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','fired','cancelled','expired')),
    result_note TEXT,
    fired_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_watchers_active ON watchers(status, sidecar_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_watchers_expires ON watchers(expires_at)');
}

function rowToWatcher(row: WatcherRow): Watcher {
  return {
    id: row.id,
    kind: row.kind as WatcherKind,
    predicate: JSON.parse(row.predicate) as WatcherPredicate,
    sidecarId: row.sidecar_id,
    pollMs: row.poll_ms,
    expiresAt: row.expires_at,
    followup: row.followup,
    createdBy: row.created_by,
    status: row.status as WatcherStatus,
    resultNote: row.result_note,
    firedAt: row.fired_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listWatchers(status?: WatcherStatus): Watcher[] {
  const sql = status
    ? 'SELECT * FROM watchers WHERE status = ? ORDER BY created_at'
    : 'SELECT * FROM watchers ORDER BY created_at';
  const rows = status
    ? getDb().prepare(sql).all(status) as WatcherRow[]
    : getDb().prepare(sql).all() as WatcherRow[];
  return rows.map(rowToWatcher);
}

/** Active watches keyed for one sidecar — what a restart re-animates. */
export function listActiveWatchers(sidecarId?: string): Watcher[] {
  if (sidecarId) return listWatchers('active').filter((w) => w.sidecarId === sidecarId);
  return listWatchers('active');
}

export function getWatcher(id: string): Watcher | undefined {
  const row = getDb().prepare('SELECT * FROM watchers WHERE id = ?').get(id) as WatcherRow | undefined;
  return row ? rowToWatcher(row) : undefined;
}

export type CreateWatcher = {
  kind: WatcherKind;
  predicate: WatcherPredicate;
  sidecarId: string;
  pollMs?: number;
  ttlMs?: number;
  followup?: string | null;
  createdBy?: string;
};

export function createWatcher(input: CreateWatcher): Watcher {
  if (!WATCHER_KINDS.includes(input.kind)) {
    throw new Error(`Unknown watcher kind "${input.kind}" (kinds: ${WATCHER_KINDS.join(', ')})`);
  }
  const match = (input.predicate.match ?? '').trim();
  const regex = (input.predicate.regex ?? '').trim();
  if (!match && !regex) throw new Error('A watcher needs something to look for: give either "match" or "regex"');
  if (regex) {
    try { new RegExp(regex); } catch (err) {
      throw new Error(`Invalid watcher regex: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const poll = Math.min(Math.max(input.pollMs ?? DEFAULT_WATCH_POLL_MS, MIN_WATCH_POLL_MS), MAX_WATCH_POLL_MS);
  const ttl = Math.max(input.ttlMs ?? DEFAULT_WATCH_TTL_MS, 60_000);
  const now = Date.now();
  const id = generateId();
  getDb().run(`
    INSERT INTO watchers (id, kind, predicate, sidecar_id, poll_ms, expires_at, followup, created_by, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `, id, input.kind, JSON.stringify({ match, regex: regex || undefined }), input.sidecarId, poll, now + ttl,
  input.followup ?? null, input.createdBy ?? 'tool', now, now);
  return getWatcher(id)!;
}

/** Case-insensitive containment and/or the regex, whichever the row carries. */
export function predicateMatches(w: Watcher, text: string): boolean {
  const lower = text.toLowerCase();
  const hitMatch = w.predicate.match !== '' && lower.includes(w.predicate.match.toLowerCase());
  let hitRegex = false;
  if (w.predicate.regex) {
    try { hitRegex = new RegExp(w.predicate.regex).test(text); } catch { hitRegex = false; }
  }
  // A row may carry both; either matching means the watch sees it.
  return hitMatch || hitRegex;
}

export function terminalWatchers(now = Date.now()): Watcher[] {
  const rows = listWatchers('active').filter((w) => w.expiresAt <= now);
  for (const w of rows) {
    getDb().run(`
      UPDATE watchers SET status = 'expired', updated_at = ? WHERE id = ?
    `, now, w.id);
  }
  return rows;
}

/** A watch fires once: a second call lands a no-op (the row is no longer 'active'). */
export function fireWatcher(id: string, resultNote: string): Watcher | undefined {
  const now = Date.now();
  getDb().run(`
    UPDATE watchers
    SET status = 'fired', result_note = ?, fired_at = ?, updated_at = ?
    WHERE id = ? AND status = 'active'
  `, resultNote, now, now, id);
  return getWatcher(id);
}

export function cancelWatcher(id: string): boolean {
  const res = getDb().run(
    `UPDATE watchers SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'active'`,
    Date.now(),
    id,
  );
  return res.changes > 0;
}
