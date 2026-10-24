/**
 * Watcher tool: manage_watchers — create, list and cancel the cheap
 * deterministic "watch until" watches.
 *
 * WHY ONE TOOL. A watch is a single row with a single predicate; the model
 * needs exactly three verbs against it. Creating one costs nothing (an INSERT
 * into the vault) and costs nothing per poll either (see the watcher service:
 * every read is an already-built sidecar RPC, no model in the loop), so the
 * honest advice to the model is: prefer a watch over a polling workflow
 * whenever the condition is a window title or the clipboard.
 *
 * Kinds are deliberately narrow — window_title and clipboard are the two
 * states a connected sidecar can answer deterministically and continuously.
 * File/process scheduling belongs to workflow triggers; OCR/screenshot
 * conditions need a model per read and are NOT a cheap watch.
 */

import type { ToolDefinition } from './registry.ts';
import { autoTargetForCapability, getSidecarManager } from './sidecar-route.ts';
import {
  cancelWatcher, createWatcher, listWatchers, WATCHER_KINDS,
  type WatcherKind,
} from '../../vault/watchers.ts';
import { WatcherService } from '../../daemon/watcher-service.ts';

/** Map a watcher kind to the sidecar capability that answers its reads. */
function capabilityForKind(kind: WatcherKind): 'windows' | 'clipboard' {
  return kind === 'window_title' ? 'windows' : 'clipboard';
}

function describeKind(kind: string): string | null {
  if (!WATCHER_KINDS.includes(kind as WatcherKind)) {
    return `Error: kind must be one of: ${WATCHER_KINDS.join(', ')}.`;
  }
  return null;
}

export const manageWatchersTool: ToolDefinition = {
  name: 'manage_watchers',
  description: [
    'Create, list or cancel a cheap background watch: "tell me when this build finishes".',
    'A watch polls one machine-state read (a window title, or the clipboard) every few seconds — deterministic, no model call, free while it waits.',
    'When the condition holds, the person gets a notification, and any follow-up prompt you record here is handed straight back to the brain as a new turn.',
    'Prefer this over a polling workflow for "when X happens" asks: a watch stores one row and never spends tokens polling. Watches fire once and expire on their own (default 8h).',
  ].join(' '),
  category: 'general',
  parameters: {
    action: {
      type: 'string',
      description: 'What to do with watchers.',
      required: true,
      enum: ['watch', 'list', 'cancel'],
    },
    kind: {
      type: 'string',
      description: 'State to watch (required for "watch"): "window_title" reads the titles of open windows on a machine; "clipboard" reads that clipboard\'s text content.',
      required: false,
      enum: [...WATCHER_KINDS],
    },
    match: {
      type: 'string',
      description: 'Case-insensitive substring the watched text must contain (required for watch unless regex is given). E.g. the app name whose title shows "build finished".',
      required: false,
    },
    regex: {
      type: 'string',
      description: 'Alternative to match: a regular expression the watched text must satisfy.',
      required: false,
    },
    target: {
      type: 'string',
      description: 'Sidecar name/ID whose window titles or clipboard to watch. Omit for the best connected match.',
      required: false,
    },
    poll_seconds: {
      type: 'string',
      description: 'Seconds between checks (3-900, default 5). Rarely worth changing.',
      required: false,
    },
    ttl_hours: {
      type: 'string',
      description: 'Hours before the watch expires (default 8). Long waits belong in a workflow, not a watch.',
      required: false,
    },
    followup: {
      type: 'string',
      description: 'Optional follow-up prompt to run as a new turn when the watch fires (e.g. "summarize what the build produced and read it back").',
      required: false,
    },
    watcher_id: {
      type: 'string',
      description: 'Watcher ID to cancel (required for "cancel"; from list).',
      required: false,
    },
  },
  execute: async (params) => {
    const action = typeof params.action === 'string' ? params.action : '';

    if (action === 'list') {
      const all = listWatchers();
      const active = all.filter((w) => w.status === 'active');
      if (all.length === 0) {
        return 'No watches exist yet. Create one with action "watch" — usually after the person asks to be told when something finishes.';
      }
      const rows = all.map((w) => {
        const pred = w.predicate.regex ? `/${w.predicate.regex}/` : `"${w.predicate.match}"`;
        const tail = w.status === 'active'
          ? `checking every ${Math.round(w.pollMs / 1000)}s`
          : `${w.status}${w.resultNote ? `: ${w.resultNote.slice(0, 80)}` : ''}`;
        return `- [${w.id.slice(0, 8)}] ${w.kind} on ${w.sidecarId}:${pred} — ${tail}${w.followup ? `; follow-up planned` : ''}`;
      });
      return [
        `${active.length} active of ${all.length} watch${all.length === 1 ? '' : 'es'}:`,
        ...rows,
      ].join('\n');
    }

    if (action === 'cancel') {
      const id = typeof params.watcher_id === 'string' ? params.watcher_id.trim() : '';
      if (!id) return 'Error: cancel needs watcher_id (from list).';
      // Accept a prefix: ids are shown truncated in list output.
      const found = listWatchers().filter((w) => w.id === id || w.id.startsWith(id));
      if (found.length === 0) return `Error: no watcher matches "${id}". Use list first.`;
      let cancelled = 0;
      for (const w of found) if (cancelWatcher(w.id)) cancelled++;
      return cancelled > 0
        ? `Cancelled ${cancelled} watch${cancelled === 1 ? '' : 'es'}.`
        : `${found.length === 1 ? 'That watch was' : 'Those watches were'} already finished (${found.map((w) => w.status).join(', ')}); nothing to cancel.`;
    }

    if (action !== 'watch') {
      return 'Error: action must be "watch", "list" or "cancel".';
    }

    const kind = typeof params.kind === 'string' ? params.kind : '';
    const kindErr = describeKind(kind);
    if (kindErr) return kindErr;

    const match = typeof params.match === 'string' ? params.match.trim() : '';
    const regex = typeof params.regex === 'string' ? params.regex.trim() : '';
    if (!match && !regex) {
      return 'Error: a watch needs something to look for — give "match" (substring) or "regex".';
    }
    if (regex) {
      try { new RegExp(regex); } catch (err) {
        return `Error: invalid regex: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Target: an explicit name/ID resolved against the live list, else the
    // first connected sidecar with the capability — a watch is useless if
    // nothing can ever answer its reads.
    const manager = getSidecarManager();
    const requested = typeof params.target === 'string' ? params.target.trim() : '';
    let target: string | null = null;
    if (requested) {
      const hit = manager?.listSidecars().find((s) => s.id === requested || s.name === requested);
      if (!hit) return `Error: no connected sidecar named "${requested}". Use list_sidecars to see the machines.`;
      target = hit.id;
    } else {
      target = autoTargetForCapability(capabilityForKind(kind as WatcherKind));
      if (!target) {
        return `Error: no connected sidecar can answer a ${kind} watch (needs the ${capabilityForKind(kind as WatcherKind)} capability). Start a sidecar first.`;
      }
    }

    const pollRaw = Number(params.poll_seconds);
    const pollMs = Number.isFinite(pollRaw) && pollRaw > 0 ? Math.round(pollRaw * 1000) : undefined;
    const ttlRaw = Number(params.ttl_hours);
    const ttlMs = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.round(ttlRaw * 3_600_000) : undefined;

    const w = createWatcher({
      kind: kind as WatcherKind,
      predicate: { match, regex: regex || undefined },
      sidecarId: target,
      pollMs,
      ttlMs,
      followup: typeof params.followup === 'string' && params.followup.trim() ? params.followup.trim() : null,
      createdBy: 'model',
    });

    const name = manager?.listSidecars().find((s) => s.id === target)?.name ?? target;
    return [
      `Watching now on ${name}: ${WatcherService.describe(w)}.`,
      `Expires ${new Date(w.expiresAt).toISOString()}.`,
      w.followup ? `When it fires I will be handed: "${w.followup}".` : 'When it fires the person gets a notification.',
      'It fires once and then stops checking.',
    ].join(' ');
  },
};

export const WATCHER_TOOLS: ToolDefinition[] = [manageWatchersTool];
