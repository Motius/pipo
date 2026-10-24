/**
 * `pipo budget` — what this install has actually spent, from the local
 * llm_usage ledger.
 *
 * Ground truth, not a promise: the numbers are the daemon's own records, so
 * the report is honest while a meter outside would be a second source to
 * reconcile. Prices are deliberately absent — a self-hosted install sees
 * many models at changing rates, and a $ figure without dated per-token
 * evidence would be invented. The report speaks in tokens, calls and time;
 * the reader multiplies by their own rates.
 *
 * The CLI opens the database READONLY. The daemon runs it in WAL mode
 * (schema.ts), so a running daemon is not disturbed and no snapshot dance
 * like export's is needed for a read that matches at most one instant.
 */

import { existsSync } from 'node:fs';
import { Database } from 'bun:sqlite';
import { loadConfig } from '../config/loader.ts';
import { setUsageDatabase, getBudgetReport, type BudgetReport } from '../llm/usage.ts';

interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** 1_234_567 → "1.23M"; keeps aligned columns across orders of magnitude. */
const tokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const ms = (n: number | null): string =>
  n === null ? '—' : n >= 60_000 ? `${(n / 60_000).toFixed(1)} min` : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;

const JSON_ONLY = '--json';

export async function cmdBudget(args: string[], io: CliIo = defaultIo): Promise<number> {
  let days = 7;
  const daysIdx = args.indexOf('--days');
  if (daysIdx !== -1) {
    const parsed = Number(args[daysIdx + 1]);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 3650) {
      io.err('usage: pipo budget [--days 1..3650] [--json]');
      return 2;
    }
    days = Math.round(parsed);
  }
  const asJson = args.includes(JSON_ONLY);

  try {
    const config = await loadConfig();
    const dbPath = config.daemon.db_path;
    if (!existsSync(dbPath)) {
      if (asJson) io.out(JSON.stringify({ available: false, reason: 'no-database' }));
      else io.err(`error: no database at ${dbPath} — the daemon has not run yet`);
      return 1;
    }
    const db = new Database(dbPath, { readonly: true });
    try { db.exec('PRAGMA busy_timeout=4000'); } catch { /* default timeout is fine */ }
    setUsageDatabase(db);
    const report = getBudgetReport(days);
    db.close();
    setUsageDatabase(() => null);

    if (asJson) {
      io.out(JSON.stringify(report, null, 2));
      return 0;
    }
    printReport(report, days, io);
    return 0;
  } catch (err) {
    io.err(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function printReport(r: BudgetReport, days: number, io: CliIo): void {
  if (!r.available) {
    io.err('error: usage ledger is not available in this database');
    return;
  }
  if (r.calls === 0) {
    io.out(`No LLM usage recorded in the last ${days} day${days === 1 ? '' : 's'}.`);
    return;
  }

  io.out(`LLM budget — last ${days} day${days === 1 ? '' : 's'}`);
  io.out('');
  io.out(`  Calls            ${r.calls}${r.errors > 0 ? `   (${r.errors} errored)` : ''}`);
  io.out(`  Tokens in        ${tokens(r.input_tokens)}  + cache read ${tokens(r.cache_read_input_tokens)}`);
  io.out(`  Tokens out       ${tokens(r.output_tokens)}  + cache write ${tokens(r.cache_creation_input_tokens)}`);
  io.out(`  Model time       ${ms(r.total_latency_ms)} total · ${ms(r.avg_latency_ms)} average per call`);
  if (r.ask) {
    io.out(`  Typical ask      ${tokens(r.ask.median_input_tokens)} in / ${tokens(r.ask.median_output_tokens)} out · ${ms(r.ask.median_latency_ms)}  (median of ${r.ask.sampled})`);
  }
  io.out('');

  io.out('  By feature (subsystem) — spend order:');
  for (const row of r.by_subsystem.slice(0, 12)) {
    const pct = r.input_tokens + r.output_tokens > 0
      ? ` ${Math.round((100 * (row.input_tokens + row.output_tokens)) / (r.input_tokens + r.output_tokens))}%`
      : '';
    io.out(`    ${row.key.padEnd(24)} ${tokens(row.calls)} calls  ${tokens(row.input_tokens)} in / ${tokens(row.output_tokens)} out${pct}`);
  }

  const models = r.by_provider_model.slice(0, 8);
  if (models.length > 0) {
    io.out('');
    io.out('  By model — spend order:');
    for (const row of models) {
      io.out(`    ${row.key.padEnd(40)} ${tokens(row.calls)} calls  ${tokens(row.input_tokens)} in / ${tokens(row.output_tokens)} out  ${ms(row.calls > 0 ? Math.round(row.total_latency_ms / row.calls) : null)}`);
    }
  }

  io.out('');
  io.out('  Prices are not baked in on purpose — multiply tokens by your own');
  io.out('  provider rates. A hosted install can also check: pipo ai status');
}
