import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { closeDb, initDatabase } from '../vault/schema.ts';
import { createWatcher, getWatcher, MIN_WATCH_POLL_MS } from '../vault/watchers.ts';
import { extractWindowTitles, type WatcherDeps, WatcherService } from './watcher-service.ts';

describe('extractWindowTitles', () => {
  test('parses the object shape, the bare-array shape, and nothing else', () => {
    expect(extractWindowTitles(JSON.stringify({ windows: [{ title: 'Codex' }, { title: 'zsh' }] })))
      .toEqual(['Codex', 'zsh']);
    expect(extractWindowTitles(JSON.stringify([{ pid: 2, title: 'plain array shape' }])))
      .toEqual(['plain array shape']);
    expect(extractWindowTitles('windows:\n- pid 3, title "prose shape"')).toEqual([]); // "can't tell", not a match
    expect(extractWindowTitles('')).toEqual([]);
    expect(extractWindowTitles('not json at all')).toEqual([]);
  });
});

/**
 * A clock the tests drive (ms counter), a stubbed sidecar, and a running
 * record of who fired. `setRead` swaps the answer the next reads return.
 */
/** A clock the tests drive (real-date base so expiry math stays honest). */
function buildHarness(initialNow = Date.now()) {
  const fired: Array<{ id: string; note: string }> = [];
  const followups: Array<unknown> = [];
  const state = { now: initialNow };
  let readImpl: (sidecarId: string, kind: string) => string | Promise<string> = () => '';

  const deps: WatcherDeps = {
    readState: (sidecarId, kind) => readImpl(sidecarId, kind),
    onFired: (w, note) => { fired.push({ id: w.id, note }); },
    onFollowup: (w) => { followups.push(w.followup ?? ''); },
    now: () => state.now,
  };
  const setRead = (impl: (sidecarId: string, kind: string) => string | Promise<string>) => { readImpl = impl; };
  const advance = (ms: number) => { state.now += ms; };
  return { deps, fired, followups, setRead, advance };
}

describe('WatcherService', () => {
  beforeEach(() => { initDatabase(':memory:'); });
  afterEach(() => { closeDb(); });

  test('a matching window title fires once, delivers the note, and runs the follow-up', async () => {
    const w = createWatcher({
      kind: 'window_title', predicate: { match: 'build finished' }, sidecarId: 'dev',
      followup: 'summarize what Codex finished', pollMs: MIN_WATCH_POLL_MS,
    });
    void w;
    const h = buildHarness();
    h.setRead(() => JSON.stringify({ windows: [{ title: 'other build' }] }));
    const svc = new WatcherService(h.deps, { tickMs: 1000 });

    const first = await svc.tick();
    expect(first.fired).toBe(0);
    expect(h.fired).toHaveLength(0);

    h.setRead(() => JSON.stringify({ windows: [{ title: 'Codex — build finished' }] }));
    h.advance(MIN_WATCH_POLL_MS + 1000); // the next due pass reads the new stub
    const tick = await svc.tick();
    expect(tick.fired).toBe(1);
    expect(h.fired).toHaveLength(1);
    expect(h.fired[0]!.note).toContain('build finished');
    expect(getWatcher(w.id)?.status).toBe('fired');
    await new Promise((r) => setTimeout(r, 0));
    expect(h.followups).toEqual(['summarize what Codex finished']);

    // A fire is terminal: later polls of the same condition do not re-fire.
    h.advance(MIN_WATCH_POLL_MS + 1000);
    const again = await svc.tick();
    expect(again.fired).toBe(0);
    expect(h.fired).toHaveLength(1);
    expect(h.followups).toHaveLength(1);
  });

  test('a broken read never stops the others, and the broken watch stays active', async () => {
    const a = createWatcher({ kind: 'window_title', predicate: { match: 'Bang' }, sidecarId: 'home', pollMs: MIN_WATCH_POLL_MS });
    const b = createWatcher({ kind: 'clipboard', predicate: { match: 'done' }, sidecarId: 'home', pollMs: MIN_WATCH_POLL_MS });
    void b;
    const h = buildHarness();
    h.setRead((_sidecarId, kind) => {
      if (kind === 'clipboard') throw new Error('clipboard RPC broken');
      return JSON.stringify({ windows: [{ title: 'Bang!' }] });
    });
    const svc = new WatcherService(h.deps, { tickMs: 1000 });

    const tick = await svc.tick();
    expect(tick.fired).toBe(1);
    expect(tick.active).toBe(1); // the clipboard watch is still active
    expect(getWatcher(a.id)?.status).toBe('fired');
    expect(getWatcher(b.id)?.status).toBe('active');

    // Fix the stub; the clipboard watch fires on its next due pass.
    h.advance(MIN_WATCH_POLL_MS);
    h.setRead(() => 'pipo ok — all done');
    const next = await svc.tick();
    expect(next.fired).toBe(1);
    expect(getWatcher(b.id)?.status).toBe('fired');
  });

  test('each watch is read at its own cadence, never faster than its poll', async () => {
    let reads = 0;
    createWatcher({ kind: 'clipboard', predicate: { match: 'never' }, sidecarId: 'home', pollMs: 3000 });
    const h = buildHarness();
    h.setRead(() => { reads++; return 'nothing yet'; });
    const svc = new WatcherService(h.deps, { tickMs: 1000 });

    await svc.tick();
    expect(reads).toBe(1);
    h.advance(1000); // only 1s of the 3s cadence has elapsed
    await svc.tick();
    expect(reads).toBe(1);
    h.advance(2100);
    await svc.tick();
    expect(reads).toBe(2);
  });

  test('a watch whose expiry has passed stops being checked and reads as expired', async () => {
    const w = createWatcher({ kind: 'clipboard', predicate: { match: 'zzz-unreachable' }, sidecarId: 'home', ttlMs: 60_000 });
    void w;
    const h = buildHarness();
    h.setRead(() => 'everything else but the watch'); // matches nothing: if read, stays active
    const svc = new WatcherService(h.deps, { tickMs: 1000 });

    const pre = await svc.tick();
    expect(pre.active).toBe(1);
    expect(pre.fired).toBe(0);

    h.advance(61_000);
    const post = await svc.tick();
    expect(post.expired).toBe(1);
    expect(post.active).toBe(0);
    expect(h.fired).toHaveLength(0); // expired rows are never read again
  });
});
