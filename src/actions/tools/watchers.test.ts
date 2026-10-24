import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { closeDb, initDatabase } from '../../vault/schema.ts';
import { listWatchers } from '../../vault/watchers.ts';
import { manageWatchersTool } from './watchers.ts';
import { getSidecarManager, setSidecarManagerRef } from './sidecar-route.ts';
import type { SidecarManager } from '../../sidecar/manager.ts';

const priorManager = getSidecarManager();
afterAll(() => { setSidecarManagerRef(priorManager as unknown as SidecarManager); });

function fakeManager(): SidecarManager {
  return {
    listSidecars: () => [
      { id: 'sc1', name: 'dev-laptop', connected: true, capabilities: ['windows', 'clipboard'], unavailable_capabilities: [] },
      { id: 'sc2', name: 'home-pc', connected: true, capabilities: ['clipboard'], unavailable_capabilities: [] },
    ],
  } as unknown as SidecarManager;
}

describe('manage_watchers tool', () => {
  beforeEach(() => { initDatabase(':memory:'); setSidecarManagerRef(fakeManager()); });
  afterEach(() => { closeDb(); });

  it('creates a watch by resolving a named target and answers with a description', async () => {
    const out = await manageWatchersTool.execute!({
      action: 'watch', kind: 'window_title', match: 'build finished', target: 'dev-laptop',
    }) as string;
    expect(out).toContain('Watching now on dev-laptop: window_title on sc1: "build finished" (every 5s)');
    expect(out).toContain('fires once');
    const rows = listWatchers();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sidecarId).toBe('sc1');
    expect(rows[0]!.createdBy).toBe('model');
  });

  it('auto-picks the first connected sidecar with the answering capability', async () => {
    const out = await manageWatchersTool.execute!({
      action: 'watch', kind: 'clipboard', match: 'deploy log', followup: 'read the deploy log back',
    }) as string;
    expect(out).toContain('Watching now on dev-laptop');
    expect(listWatchers()[0]!.sidecarId).toBe('sc1');
    expect(listWatchers()[0]!.followup).toBe('read the deploy log back');
  });

  it('needs something to look for and refuses a broken regex', async () => {
    expect(await manageWatchersTool.execute!({ action: 'watch', kind: 'window_title' }))
      .toContain('Error: a watch needs something to look for');
    expect(await manageWatchersTool.execute!({ action: 'watch', kind: 'clipboard', regex: '[unclosed' }))
      .toContain('Error: invalid regex:');
    expect(listWatchers()).toHaveLength(0);
  });

  it('refuses an unknown kind and an unknown target without writing', async () => {
    expect(await manageWatchersTool.execute!({ action: 'watch', kind: 'process', match: 'x' }))
      .toContain('Error: kind must be one of');
    expect(await manageWatchersTool.execute!({ action: 'watch', kind: 'clipboard', match: 'x', target: 'ghost-pc' }))
      .toContain('Error: no connected sidecar named');
    expect(listWatchers()).toHaveLength(0);
  });

  it('lists every watch with its status and note', async () => {
    void (await manageWatchersTool.execute!({ action: 'watch', kind: 'window_title', match: 'installer', target: 'sc1' }));
    const out = await manageWatchersTool.execute!({ action: 'list' }) as string;
    expect(out).toContain('1 active of 1 watch');
    expect(out).toContain('window_title on sc1:"installer"');
  });

  it('cancels by (prefix of) id and is honest when there is nothing to cancel', async () => {
    void (await manageWatchersTool.execute!({ action: 'watch', kind: 'clipboard', match: 'pipo', target: 'sc2' }));
    const id = listWatchers()[0]!.id;
    const out = await manageWatchersTool.execute!({ action: 'cancel', watcher_id: id.slice(0, 6) }) as string;
    expect(out).toContain('Cancelled 1 watch');
    expect(listWatchers()[0]!.status).toBe('cancelled');
    // Cancel is a lifecycle stop, not a delete: the row stays for the audit.
    expect((await manageWatchersTool.execute!({ action: 'list' }) as string)).toContain('cancelled');
    expect(await manageWatchersTool.execute!({ action: 'cancel', watcher_id: id }))
      .toContain('already finished');
    expect(await manageWatchersTool.execute!({ action: 'cancel', watcher_id: 'zzz123' }))
      .toContain('Error: no watcher matches');
  });
});
