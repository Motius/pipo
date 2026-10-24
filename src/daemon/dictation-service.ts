/**
 * Dictation mode — the daemon-side state that turns a spoken summon into a
 * typed insertion instead of an agent turn.
 *
 * "Start dictation" arms the mode per sidecar. Every pebble audio session
 * that completes while the mode is active still runs STT, but the transcript
 * is typed into the machine's focused window via the sidecar's `type_text`
 * RPC — no model call at all, the same zero-LLM contract as the learned
 * command fast path. "Stop dictation" disarms it; until then every summon
 * inserts, which is what "I am in dictation mode" promises.
 *
 * The verbs live in matchDictationIntent so the pebble fast path and the
 * dashboard share one parser.
 */

export class DictationController {
  private readonly active = new Map<string, number>();

  /** Arm dictation for one sidecar. Returns true when it was newly armed. */
  start(sidecarId: string, now = Date.now()): boolean {
    const was = this.active.has(sidecarId);
    this.active.set(sidecarId, now);
    return !was;
  }

  /** Disarm. Returns true when the mode was actually on. */
  stop(sidecarId: string): boolean {
    return this.active.delete(sidecarId);
  }

  isActive(sidecarId: string): boolean {
    return this.active.has(sidecarId);
  }

  /** Disarm everything; for shutdown. Returns how many were armed. */
  stopAll(): number {
    const n = this.active.size;
    this.active.clear();
    return n;
  }
}

const START_RE = /\b(start|begin|turn on|enable)\b[^\n]{0,24}\b(dictat\w*|transcrib\w*|typing mode)\b|\bdictate\b\s*(mode)?\s*(now|on)?\s*$/;
const STOP_RE = /\b(stop|end|turn off|disable|exit)\b[^\n]{0,24}\b(dictat\w*|typing mode)\b|\bstop dictating\b/;

/**
 * `start` / `stop` / null. Deliberately narrow: the verbs must name dictation
 * explicitly, so a normal ask that merely CONTAINS the word ("how do I start
 * dictation in Word?") falls through to the model. The bare imperative
 * "dictate" alone counts as start — it has no readable other purpose as a
 * whole utterance.
 */
export function matchDictationIntent(text: string): 'start' | 'stop' | null {
  const t = text.toLowerCase().trim();
  // A question ABOUT dictation is not a dictation command; checked first so
  // "how do I stop dictating?" is an ask, not a mode change.
  if (/\b(how|what|why|can you explain|demo|example)\b/.test(t)) return null;
  if (STOP_RE.test(t)) return 'stop';
  if (START_RE.test(t)) return 'start';
  return null;
}
