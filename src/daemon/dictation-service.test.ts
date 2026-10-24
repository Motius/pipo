import { describe, expect, test } from 'bun:test';
import { DictationController, matchDictationIntent } from './dictation-service.ts';

describe('DictationController', () => {
  test('arms per sidecar, reports re-arming, and disarms exactly once', () => {
    const d = new DictationController();
    expect(d.isActive('sc1')).toBe(false);
    expect(d.start('sc1')).toBe(true);
    expect(d.isActive('sc1')).toBe(true);
    expect(d.start('sc1')).toBe(false); // already armed, idempotent

    expect(d.stop('sc1')).toBe(true);
    expect(d.isActive('sc1')).toBe(false);
    expect(d.stop('sc1')).toBe(false);
  });

  test('each sidecar arms independently', () => {
    const d = new DictationController();
    d.start('sc1');
    expect(d.isActive('sc2')).toBe(false);
    d.start('sc2');
    expect(d.stopAll()).toBe(2);
    expect(d.isActive('sc1')).toBe(false);
    expect(d.isActive('sc2')).toBe(false);
  });
});

describe('matchDictationIntent', () => {
  test('starts on the natural imperatives', () => {
    expect(matchDictationIntent('start dictation')).toBe('start');
    expect(matchDictationIntent('Start dictate mode')).toBe('start');
    expect(matchDictationIntent('begin dictation mode')).toBe('start');
    expect(matchDictationIntent('turn on typing mode')).toBe('start');
    expect(matchDictationIntent('dictate')).toBe('start');
  });

  test('stops on the matching verbs', () => {
    expect(matchDictationIntent('stop dictation')).toBe('stop');
    expect(matchDictationIntent('stop dictating')).toBe('stop');
    expect(matchDictationIntent('end dictate mode')).toBe('stop');
    expect(matchDictationIntent('turn off typing mode')).toBe('stop');
  });

  test('questions about dictation are asks, not commands', () => {
    expect(matchDictationIntent('how do I start dictation in Word?')).toBeNull();
    expect(matchDictationIntent('what does dictate mode do?')).toBeNull();
    expect(matchDictationIntent('why does stop dictating hurt?')).toBeNull();
  });

  test('everything else is a normal turn', () => {
    expect(matchDictationIntent('open Spotify')).toBeNull();
    expect(matchDictationIntent('write me a poem')).toBeNull();
    expect(matchDictationIntent('')).toBeNull();
  });
});
