/**
 * WatcherService — the daemon's "watch until" loop.
 *
 * Design: one interval tick, N reads. Every active watcher is looked at no
 * faster than its own poll cadence (per-watcher `checkedAt`, not a global
 * rhythm), never concurrently with itself, and the loop stays alive when one
 * read throws — a sidecar going offline mid-watch must not stop the others.
 *
 * Every state read is an already-built sidecar RPC (`list_windows`,
 * `get_clipboard`): deterministic, no model anywhere in the loop, so a watch
 * costs nothing while it waits. The daemon injects `readState` at wiring time
 * so the service is unit-testable without a connected sidecar.
 */

import {
  DEFAULT_WATCH_TTL_MS, predicateMatches, fireWatcher, listActiveWatchers, terminalWatchers,
  type Watcher, type WatcherKind,
} from '../vault/watchers.ts';

export type WatcherDeps = {
  /**
   * Ask one watch question of one machine, returning the sidecar's raw
   * response text. Throwing or returning garbage means "can't tell right
   * now" — the tick silently moves on.
   */
  readState: (sidecarId: string, kind: WatcherKind) => Promise<string> | string;
  /** Deliver the firing. The daemon parks its notification/delivery here. */
  onFired: (watcher: Watcher, note: string) => void | Promise<void>;
  /** Optional brain re-entry for a watcher that carries a follow-up prompt. */
  onFollowup?: (watcher: Watcher) => void | Promise<void>;
  now?: () => number;
};

const WINDOW_KINDS: readonly WatcherKind[] = ['window_title'];

/**
 * The `list_windows` responses have taken a couple of shapes over time (JSON
 * object with a `windows` array, or a bare array). Guard both, and come back
 * with nothing recognisable rather than throwing — an unparseable answer is
 * "can't tell", the same as an RPC failure, not a watch value.
 */
export function extractWindowTitles(raw: string): string[] {
  const trimmed = String(raw ?? '').trim();
  const jsonStart = trimmed.indexOf('[');
  const objStart = trimmed.indexOf('{');
  const start = jsonStart === -1 ? objStart : (objStart !== -1 ? Math.min(jsonStart, objStart) : -1);
  if (start > 500) return [];
  try {
    const parsed = JSON.parse(trimmed.slice(start)) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { windows?: unknown[] }).windows))
        ? (parsed as { windows: unknown[] }).windows
        : [];
    return list
      .map((entry) => typeof entry === 'object' && entry !== null ? (entry as { title?: unknown }).title : entry)
      .filter((title): title is string => typeof title === 'string');
  } catch {
    return [];
  }
}

export class WatcherService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly checkedAt = new Map<string, number>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly deps: WatcherDeps,
    private readonly opts: { tickMs?: number; ttlMs?: number } = {},
  ) {}

  /** Arm the loop. Staleness is handled inside the tick so a start() is idempotent. */
  start(): void {
    if (this.timer) return;
    const tickMs = Math.max(this.opts.tickMs ?? 2_000, 250);
    this.timer = setInterval(() => { void this.tick(); }, tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass: expire stale rows, then check each active watch that is due. */
  async tick(): Promise<WatchedTickResult> {
    const nowMs = this.deps.now?.() ?? Date.now();
    const expired = terminalWatchers(nowMs);
    let remainingActives = listActiveWatchers();
    let fired = 0;
    for (const w of [...remainingActives]) {
      const due = (this.checkedAt.get(this.key(w)) ?? 0) + w.pollMs;
      if (due > nowMs) continue;
      if (this.inFlight.has(w.id)) continue;
      this.inFlight.add(w.id);
      this.checkedAt.set(this.key(w), nowMs);
      try {
        if (await this.checkWatch(w, nowMs)) fired++;
      } catch (err) {
        // One broken read never stops the others: log and move to the next watch.
        console.warn('[Watchers] read failed for', w.kind, 'watch on', w.sidecarId, err);
      } finally {
        this.inFlight.delete(w.id);
      }
    }
    remainingActives = listActiveWatchers();
    return { active: remainingActives.length, fired, expired: expired.length };
  }

  private key(w: Watcher): string { return w.id; }

  private async checkWatch(w: Watcher, nowMs: number): Promise<boolean> {
    let matched = false;
    let note = '';
    if (WINDOW_KINDS.includes(w.kind)) {
      const response = await this.deps.readState(w.sidecarId, 'window_title');
      const titles = extractWindowTitles(response);
      matched = titles.some((title) => predicateMatches(w, title));
      if (matched) note = `window title matched: ${titles.filter((t) => predicateMatches(w, t)).join(' | ')}`;
    } else {
      const response = await this.deps.readState(w.sidecarId, 'clipboard');
      matched = predicateMatches(w, String(response ?? ''));
      if (matched) note = `clipboard matched: ${String(response ?? '').slice(0, 120)}`;
    }
    if (!matched) return false;
    this.fire(w, note);
    return true;
  }

  private fire(w: Watcher, note: string): void {
    const fired = fireWatcher(w.id, note);
    if (!fired) return; // already terminal; the store held the row back
    void Promise.resolve(this.deps.onFired(fired, note)).then(
      () => fired.followup && this.deps.onFollowup && void this.deps.onFollowup(fired),
      (err) => {
        console.warn('[Watchers] delivery failed for watch', fired.id, err);
        void Promise.resolve(this.deps.onFollowup?.(fired));
      },
    );
  }

  /** Formatted description used by notifications, cards and the tools' list output. */
  static describe(w: Watcher): string {
    const pred = w.predicate.regex ? `/${w.predicate.regex}/` : `"${w.predicate.match}"`;
    return `${w.kind} on ${w.sidecarId}: ${pred} (every ${Math.round(w.pollMs / 1000)}s)`;
  }
}

export type WatchedTickResult = {
  active: number;
  fired: number;
  expired: number;
};

export const WATCH_DEFAULT_TTL_MS = DEFAULT_WATCH_TTL_MS;
