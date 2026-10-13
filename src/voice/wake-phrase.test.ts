import { describe, expect, test } from 'bun:test';
import { containsStopPhrase, containsWakePhrase, hasSpokenContent, wakeCommandFrom } from './wake-phrase.ts';

describe('containsWakePhrase', () => {
  test('matches the bare wake phrase', () => {
    expect(containsWakePhrase('pipo')).toBe(true);
    expect(containsWakePhrase('pipo')).toBe(true);
    expect(containsWakePhrase('pipo')).toBe(true);
  });

  test('matches when the wake phrase appears mid-sentence', () => {
    expect(containsWakePhrase('Hey pipo, how are you')).toBe(true);
    expect(containsWakePhrase('Tell pipo to send the email')).toBe(true);
    expect(containsWakePhrase('I told pipo already')).toBe(true);
  });

  test('respects word boundaries (does not match substrings)', () => {
    expect(containsWakePhrase('piposon')).toBe(false);
    expect(containsWakePhrase('starpipo')).toBe(false);
    expect(containsWakePhrase('antipipot')).toBe(false);
  });

  test('treats punctuation as a word boundary', () => {
    expect(containsWakePhrase('Hello, pipo.')).toBe(true);
    expect(containsWakePhrase('"pipo!"')).toBe(true);
    expect(containsWakePhrase('(pipo)')).toBe(true);
    expect(containsWakePhrase('pipo?')).toBe(true);
  });

  test('handles empty / null-ish input safely', () => {
    expect(containsWakePhrase('')).toBe(false);
    // The function takes string only, but we exercise the early-exit
    // branch by passing an empty string explicitly.
    expect(containsWakePhrase(' ')).toBe(false);
  });

  test('handles whitespace-only and unrelated text', () => {
    expect(containsWakePhrase('hello world')).toBe(false);
    expect(containsWakePhrase('the assistant said hello')).toBe(false);
    expect(containsWakePhrase('   ')).toBe(false);
  });

  test('is robust to multiline TTS input (the daemon flag-on-tts_text use case)', () => {
    expect(containsWakePhrase('First sentence.\nSecond sentence with pipo.')).toBe(true);
    expect(containsWakePhrase('Line one.\nLine two.\nLine three.')).toBe(false);
  });

  test('matches multiple occurrences (still returns true; not a count)', () => {
    expect(containsWakePhrase('pipo told pipo about pipo')).toBe(true);
  });
});

describe('containsStopPhrase', () => {
  test('matches spoken stop phrases with TTS punctuation', () => {
    expect(containsStopPhrase("Say 'pipo, stop' to interrupt me.")).toBe(true);
    expect(containsStopPhrase('pipo stop')).toBe(true);
    expect(containsStopPhrase('You can say "pipo... be quiet" anytime.')).toBe(true);
    expect(containsStopPhrase('pipo quiet')).toBe(true);
  });

  test('does not match ordinary mentions of pipo or stop', () => {
    expect(containsStopPhrase('pipo stopped the timer for you')).toBe(false);
    expect(containsStopPhrase('Ask pipo about the bus stop')).toBe(false);
    expect(containsStopPhrase('Please stop by tomorrow')).toBe(false);
    expect(containsStopPhrase('')).toBe(false);
  });
});

describe('wakeCommandFrom', () => {
  test('returns the command that follows the wake word', () => {
    expect(wakeCommandFrom('pipo play music')).toBe('play music');
    expect(wakeCommandFrom('Hey pipo, what are you working on?')).toBe('what are you working on?');
    expect(wakeCommandFrom('pipo: open the dashboard')).toBe('open the dashboard');
  });

  test('uses the LAST wake word so lead-in chatter is dropped', () => {
    expect(wakeCommandFrom("I'm at home, pipo play music")).toBe('play music');
    expect(wakeCommandFrom('I told pipo already. pipo, mute yourself')).toBe('mute yourself');
  });

  test('returns "" for a bare summon, whatever punctuation STT tacks on', () => {
    // The bug: "Hey pipo!" left a "!" behind, which was run as the whole
    // user turn and answered with three hundred lines of counting.
    expect(wakeCommandFrom('Hey pipo!')).toBe('');
    expect(wakeCommandFrom('Hey pipo?')).toBe('');
    expect(wakeCommandFrom('Hey pipo.')).toBe('');
    expect(wakeCommandFrom('pipo!!')).toBe('');
    expect(wakeCommandFrom('pipo...')).toBe('');
    expect(wakeCommandFrom('pipo')).toBe('');
    expect(wakeCommandFrom('pipo —')).toBe('');
    expect(wakeCommandFrom('"pipo?!"')).toBe('');
  });

  test('keeps a command that merely opens with punctuation', () => {
    expect(wakeCommandFrom('pipo, "play music"')).toBe('play music"');
    expect(wakeCommandFrom('pipo \u2014 5 minute timer')).toBe('5 minute timer');
  });

  test('keeps punctuation that belongs to the command, not to the gap', () => {
    // The mirror of the bug: stripping every leading symbol would quietly
    // rewrite these. Only separators come off.
    expect(wakeCommandFrom('pipo, $100 budget for the trip')).toBe('$100 budget for the trip');
    expect(wakeCommandFrom('pipo, #general is muted')).toBe('#general is muted');
    expect(wakeCommandFrom('pipo +5 minutes on the timer')).toBe('+5 minutes on the timer');
    expect(wakeCommandFrom('pipo, @dad called')).toBe('@dad called');
  });

  test('accepts non-Latin commands', () => {
    expect(wakeCommandFrom('pipo, che ore sono?')).toBe('che ore sono?');
    expect(wakeCommandFrom('pipo, 天気は?')).toBe('天気は?');
  });

  test('returns "" when there is no wake word at all', () => {
    expect(wakeCommandFrom('play music')).toBe('');
    expect(wakeCommandFrom('piposon play music')).toBe('');
    expect(wakeCommandFrom('')).toBe('');
  });
});

describe('hasSpokenContent', () => {
  test('accepts anything with a letter or a digit', () => {
    expect(hasSpokenContent('what are you working on?')).toBe(true);
    expect(hasSpokenContent('5')).toBe(true);
    expect(hasSpokenContent('...ok')).toBe(true);
    expect(hasSpokenContent('\u5929\u6c17\u306f?')).toBe(true);
  });

  test('rejects the punctuation STT invents out of silence', () => {
    expect(hasSpokenContent('.')).toBe(false);
    expect(hasSpokenContent('!')).toBe(false);
    expect(hasSpokenContent('?!')).toBe(false);
    expect(hasSpokenContent('...')).toBe(false);
    expect(hasSpokenContent('  ')).toBe(false);
    expect(hasSpokenContent('')).toBe(false);
  });
});
