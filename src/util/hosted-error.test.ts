import { describe, expect, test } from 'bun:test';
import { CONTENT_POLICY_MARKER, hostedProxyError, hostedRealtimeError, isBudgetExhaustion } from './hosted-error.ts';

describe('hostedProxyError', () => {
  test('the generic branch never carries the proxy body (hostname stays out of chat copy)', () => {
    // Typical CDN 502 page: the hostname sits in the first line, so even a
    // 120-char truncation leaked it (pr2 review #5).
    const err = hostedProxyError(
      'pipo AI API',
      502,
      '<html><title>502 Bad Gateway</title>error at proxy host llm.pipo.host: upstream timeout</html>',
    );
    expect(err.message).toContain('(502)');
    expect(err.message).not.toContain('llm.pipo.host');
    expect(err.message).not.toContain('502 Bad Gateway');
    expect(err.kind).toBe('generic');
  });

  test('budget copy quotes a reset time ONLY when handed one (never parsed from the body)', () => {
    // The 429 budget body carries no reset field (confirmed 2026-08-19); the
    // caller fetches /key/info and passes the parsed Date in.
    const timed = hostedProxyError(
      'pipo AI API',
      429,
      'ExceededBudget: Budget has been exceeded! Current cost: 0.0051, Max budget: 0.005',
      new Date('2026-08-19T12:00:00+00:00'),
    );
    expect(timed.message).toContain('used up for this window (resumes 12:00 UTC)');
    expect(timed.kind).toBe('quota_exhausted');

    // No timestamp handed in → no time claimed, even if the body smuggles
    // something date-shaped (the old parser would have quoted it).
    const bare = hostedProxyError(
      'pipo AI API',
      429,
      'ExceededBudget: budget has been exceeded, budget_reset_at: 2026-08-18 18:00:00',
    );
    expect(bare.message).toContain('used up for this window.');
    expect(bare.message).not.toMatch(/resumes \d/);

    // An invalid Date degrades identically.
    const invalid = hostedProxyError('pipo AI API', 429, 'budget exceeded', new Date('nonsense'));
    expect(invalid.message).not.toMatch(/resumes \d/);
  });

  test('403 maps to model-not-in-plan even without model text (team_model_access_denied)', () => {
    const err = hostedProxyError('pipo AI API', 403, '{"error":{"code":"team_model_access_denied"}}');
    expect(err.message).toContain('(403)');
    expect(err.message).toContain('not included in your plan');
    expect(err.kind).toBe('model_not_in_plan');
  });

  test('model-denial TEXT still precedes the auth branch (historical 401 shape)', () => {
    const err = hostedProxyError('pipo AI API', 401, 'key not allowed to access model uj-video');
    expect(err.message).toContain('not included in your plan');
  });

  test('401 without model text or a restriction is the credential/plan copy', () => {
    const err = hostedProxyError('pipo AI API', 401, 'Authentication Error: key is blocked');
    expect(err.message).toMatch(/\(401\).*active plan is required/);
    expect(err.kind).toBe('inactive');
  });

  test('an ordinary 429 rate limit is NOT budget copy (stays retryable-generic)', () => {
    const err = hostedProxyError('pipo AI API', 429, 'rate limited, retry shortly');
    expect(err.message).toContain('(429)');
    expect(err.message).not.toContain('used up');
    expect(err.kind).toBe('generic');
  });
});

describe('hostedProxyError: provider-policy outcomes', () => {
  test("the safety gate's marker is a content-policy block whatever the status, and the body stays out", () => {
    const body = `{"error":{"message":"Blocked: ${CONTENT_POLICY_MARKER} (quoted user text here)"}}`;
    for (const status of [400, 422]) {
      const err = hostedProxyError('pipo AI API', status, body);
      expect(err.kind).toBe('content_policy');
      expect(err.message).toContain(`(${status})`);
      expect(err.message).toContain('blocked by the pipo AI content policy');
      expect(err.message).not.toContain('quoted user text');
    }
    // A plain 400 without the marker is still an ordinary invalid request.
    expect(hostedProxyError('pipo AI API', 400, 'invalid parameter').kind).toBe('generic');
  });

  test('a blocked key reads as restricted only when the meter says so, with where to appeal', () => {
    const banned = hostedProxyError('pipo AI API', 401, 'key is blocked', null, {
      reason: 'account_banned',
      contact: 'support@pipo.test',
    });
    expect(banned.kind).toBe('restricted');
    expect(banned.message).toMatch(/\(401\): pipo AI is no longer available on this account\. To appeal, contact support@pipo\.test\./);

    const suspended = hostedProxyError('pipo AI API', 401, 'key is blocked', null, {
      reason: 'account_suspended',
      contact: null,
    });
    expect(suspended.message).toContain('unavailable while this account is suspended. To appeal, contact support.');

    const policy = hostedProxyError('pipo AI API', 401, 'key is blocked', null, {
      reason: 'content_policy',
      contact: 'https://pipo.dev/appeal',
    });
    expect(policy.message).toContain('restricted on this account for a usage-policy violation');

    // The restriction never turns a non-401 into restricted copy: a budget or
    // model answer is still the more precise sentence.
    const budget = hostedProxyError('pipo AI API', 429, 'budget exceeded', null, {
      reason: 'content_policy',
      contact: null,
    });
    expect(budget.kind).toBe('quota_exhausted');
  });

  test('the appeal contact is re-bounded before it reaches a chat bubble', () => {
    const err = hostedProxyError('pipo AI API', 401, 'key is blocked', null, {
      reason: 'content_policy',
      contact: `support@x.test\n<script>alert(1)</script>${'x'.repeat(400)}`,
    });
    expect(err.message).not.toContain('\n');
    expect(err.message).not.toContain('<');
    expect(err.message.length).toBeLessThan(400);
  });
});

describe('hostedProxyError: logging', () => {
  test('a content-policy block is logged without the body, which can quote the blocked text', () => {
    const original = console.warn;
    const lines: string[] = [];
    console.warn = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      hostedProxyError('pipo AI API', 400, `{"error":{"message":"${CONTENT_POLICY_MARKER}: quoted secret text"}}`);
    } finally {
      console.warn = original;
    }
    expect(lines.join('\n')).toContain('blocked by the content policy');
    expect(lines.join('\n')).not.toContain('quoted secret text');
  });
});

describe('isBudgetExhaustion', () => {
  test('matches the LiteLLM budget family and nothing else', () => {
    expect(isBudgetExhaustion('ExceededBudget: budget has been exceeded for this key')).toBe(true);
    expect(isBudgetExhaustion('{"error":{"code":"budget_exceeded","message":"over budget"}}')).toBe(true);
    expect(isBudgetExhaustion('rate limited, retry shortly')).toBe(false);
    expect(isBudgetExhaustion('model not allowed')).toBe(false);
  });
});

describe('hostedRealtimeError', () => {
  /** Run fn with console.warn captured, so the log channel can be asserted. */
  function captureWarn<T>(fn: () => T): { value: T; logged: string[] } {
    const warn = console.warn;
    const logged: string[] = [];
    console.warn = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
    try {
      return { value: fn(), logged };
    } finally {
      console.warn = warn;
    }
  }

  test('the upstream provider text never reaches the copy, only the log', () => {
    const upstream =
      'You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.';
    const { value, logged } = captureWarn(() => hostedRealtimeError(upstream));
    expect(value).not.toContain('credits');
    expect(value).not.toContain('platform.openai.com');
    expect(value).toContain('try again shortly');
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('no credits remaining');
  });

  test('secrets echoed in the event are redacted out of the log line', () => {
    const { logged } = captureWarn(() =>
      hostedRealtimeError('Incorrect API key provided: Bearer sk-uj-abcdefghijklmnopqrstuvwxyz0123456789'),
    );
    expect(logged[0]).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
  });

  test('an empty event logs nothing and still gets the copy', () => {
    const { value, logged } = captureWarn(() => hostedRealtimeError(''));
    expect(logged).toHaveLength(0);
    expect(value).toContain('try again shortly');
  });
});
