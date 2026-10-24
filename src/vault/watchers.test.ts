import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { closeDb, initDatabase } from './schema.ts';
import {
  DEFAULT_WATCH_POLL_MS, MIN_WATCH_POLL_MS, predicateMatches, cancelWatcher, createWatcher, fireWatcher,
  getWatcher, listActiveWatchers, listWatchers, terminalWatchers,
} from './watchers.ts';

describe('Vault - Watchers', () => {
  beforeEach(() => { initDatabase(':memory:'); });
  afterEach(() => { closeDb(); });

  test('create sets the active status, clamps the poll, and stores the predicate normalized', () => {
    const fast = createWatcher({ kind: 'window_title', predicate: { match: 'Codex' }, sidecarId: 'dev' });
    expect(fast.status).toBe('active');
    expect(fast.pollMs).toBe(DEFAULT_WATCH_POLL_MS);
    expect(fast.predicate.match).toBe('Codex');
    expect(fast.predicate.regex).toBeUndefined();

    const slow = createWatcher({ kind: 'clipboard', predicate: { match: 'x' }, sidecarId: 'dev', pollMs: 1 });
    expect(slow.pollMs).toBe(MIN_WATCH_POLL_MS);
  });

  test('a watcher with neither a match nor a regex is refused', () => {
    expect(() => createWatcher({ kind: 'window_title', predicate: { match: '' }, sidecarId: 'dev' }))
      .toThrow(/needs something to look for/);
  });

  test('a broken regex is refused at create time, not at check time', () => {
    expect(() => createWatcher({ kind: 'window_title', predicate: { match: '', regex: '[' }, sidecarId: 'dev' }))
      .toThrow(/Invalid watcher regex/);
  });

  test('predicateMatches: case-insensitive contains, plus optional regex', () => {
    const w = createWatcher({ kind: 'window_title', predicate: { match: 'codex' }, sidecarId: 'dev' });
    expect(predicateMatches(w, 'Codex — build finished')).toBe(true);
    expect(predicateMatches(w, 'testing unrelated')).toBe(false);
    expect(predicateMatches(w, '')).toBe(false);

    const rx = createWatcher({ kind: 'clipboard', predicate: { match: '', regex: 'shots? taken' }, sidecarId: 'dev' });
    expect(predicateMatches(rx, '835 shots taken today')).toBe(true);
    expect(predicateMatches(rx, 'nothing here')).toBe(false);
  });

  test('firing is once-only: the second fire is a no-op on an inactive row', () => {
    const w = createWatcher({ kind: 'window_title', predicate: { match: 'done' }, sidecarId: 'dev' });
    const first = fireWatcher(w.id, 'Codex title now contains "done"');
    expect(first?.status).toBe('fired');
    expect(first?.resultNote).toContain('Codex');
    expect(first?.firedAt).toBeGreaterThan(0);
    expect(listActiveWatchers()).toHaveLength(0);

    const second = fireWatcher(w.id, 'again');
    expect(second?.resultNote).toContain('Codex');
  });

  test('cancel only works while active', () => {
    const w = createWatcher({ kind: 'clipboard', predicate: { match: 'pipo' }, sidecarId: 'home' });
    expect(cancelWatcher(w.id)).toBe(true);
    expect(getWatcher(w.id)?.status).toBe('cancelled');
    expect(cancelWatcher(w.id)).toBe(false);
  });

  test('terminalWatchers expires only the stale active rows and lists them once', () => {
    createWatcher({ kind: 'window_title', predicate: { match: 'a' }, sidecarId: 'dev', ttlMs: 60_000 });
    createWatcher({ kind: 'window_title', predicate: { match: 'b' }, sidecarId: 'dev', ttlMs: 60_000 });
    // Normal TTL is clamped to >= a minute; to expire now, backdate the rows directly.
    const db = require('./schema.ts').getDb();
    db.run('UPDATE watchers SET expires_at = ? WHERE expires_at >= ?', 0, 0);

    const expired = terminalWatchers();
    expect(expired).toHaveLength(2);
    expect(expired.every((w) => w.status === 'active')).toBe(true); // returned BEFORE the write reads them back
    expect(listWatchers('expired')).toHaveLength(2);
    expect(listActiveWatchers()).toHaveLength(0);
    expect(terminalWatchers()).toHaveLength(0);
  });

  test('any other kind is refused at the enum check', () => {
    expect(() => createWatcher({ kind: 'process' as 'window_title', predicate: { match: 'x' }, sidecarId: 'dev' }))
      .toThrow(/Unknown watcher kind/);
  });
});
