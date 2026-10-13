import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeWorkflowDb, DEFAULT_IDS, initWorkflowDb } from "../db/index";
import { setEncryptionKey } from "../db/encryption";
import { upsertConnection } from "../db/repos/app-connection";
import {
  CredentialResolver,
  pipo_PREFIX,
  type pipoConnectionSource,
  type ResolvedConnection,
} from "./adapter";

// Pin the connection-encryption key: without it the module resolves the
// developer's real key file (and generates one into their live data dir).
beforeEach(() => {
  initWorkflowDb(":memory:");
  setEncryptionKey(Buffer.alloc(32, 0x13));
});

afterEach(() => {
  closeWorkflowDb();
  setEncryptionKey(null);
});

// Lightweight test stubs. The live sources (`pipoGoogleConnectionSource`,
// `pipoTelegramConnectionSource`) have their own dedicated test files that
// exercise the per-source contracts. These tests only care that the resolver
// dispatches correctly to whatever Source it's handed.
function stubSource(id: string, externalId: string, value: ResolvedConnection | null): pipoConnectionSource {
  return {
    id,
    canResolve: (eid) => eid === externalId,
    resolve: async () => value,
  };
}

describe("CredentialResolver", () => {
  test("dispatches pipo:* externalIds to a registered pipo source", async () => {
    const r = new CredentialResolver();
    r.register(
      stubSource("telegram", `${pipo_PREFIX}telegram`, {
        type: "SECRET_TEXT",
        value: { secret_text: "live-bot-token" },
      }),
    );
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "telegram-bot",
      externalId: `${pipo_PREFIX}telegram`,
    });
    expect(got).toEqual({ type: "SECRET_TEXT", value: { secret_text: "live-bot-token" } });
  });

  test("returns null when a pipo source cannot resolve (not yet authenticated)", async () => {
    const r = new CredentialResolver();
    r.register(stubSource("google", `${pipo_PREFIX}gmail`, null));
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "gmail",
      externalId: `${pipo_PREFIX}gmail`,
    });
    expect(got).toBeNull();
  });

  test("returns null when no pipo source claims the externalId", async () => {
    const r = new CredentialResolver();
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "anything",
      externalId: `${pipo_PREFIX}unknown`,
    });
    expect(got).toBeNull();
  });

  test("falls back to the app_connection repo for non-pipo externalIds", async () => {
    upsertConnection({
      externalId: "user-supplied",
      displayName: "Notion",
      type: "OAUTH2",
      pieceName: "notion",
      pieceVersion: "1.0.0",
      value: { access_token: "abc", token_type: "Bearer" },
    });
    const r = new CredentialResolver();
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "notion",
      externalId: "user-supplied",
    });
    expect(got?.type).toBe("OAUTH2");
    expect(got?.value).toMatchObject({ access_token: "abc" });
  });

  test("does not consult the DB for pipo:* externalIds (isolation)", async () => {
    // Even if a row exists with externalId "pipo:gmail", the resolver should
    // route through the pipo source path and not return DB values. This
    // guarantees the DB cannot shadow live-managed pipo credentials.
    upsertConnection({
      externalId: `${pipo_PREFIX}gmail`,
      displayName: "ghost",
      type: "OAUTH2",
      pieceName: "gmail",
      pieceVersion: "1.0.0",
      value: { access_token: "stale-from-db" },
    });
    const r = new CredentialResolver();
    r.register(
      stubSource("google", `${pipo_PREFIX}gmail`, {
        type: "OAUTH2",
        value: { access_token: "live-token" },
      }),
    );
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "gmail",
      externalId: `${pipo_PREFIX}gmail`,
    });
    expect(got?.value.access_token).toBe("live-token");
  });

  test("multiple sources: first matching wins", async () => {
    const r = new CredentialResolver();
    let calls = 0;
    const dummy: pipoConnectionSource = {
      id: "dummy",
      canResolve: (id) => id === `${pipo_PREFIX}custom`,
      resolve: async () => {
        calls++;
        return { type: "NO_AUTH", value: {} };
      },
    };
    r.register(dummy);
    r.register(
      stubSource("telegram", `${pipo_PREFIX}telegram`, {
        type: "SECRET_TEXT",
        value: { secret_text: "tg" },
      }),
    );
    const a = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "x",
      externalId: `${pipo_PREFIX}custom`,
    });
    const b = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "telegram-bot",
      externalId: `${pipo_PREFIX}telegram`,
    });
    expect(a?.type).toBe("NO_AUTH");
    expect(b?.value.secret_text).toBe("tg");
    expect(calls).toBe(1);
  });

  test("unregister removes a source by id", async () => {
    const r = new CredentialResolver();
    const source = stubSource("discord", `${pipo_PREFIX}discord`, {
      type: "SECRET_TEXT",
      value: { secret_text: "dc" },
    });
    r.register(source);
    r.unregister("discord");
    const got = await r.resolve({
      projectId: DEFAULT_IDS.project,
      pieceName: "discord",
      externalId: `${pipo_PREFIX}discord`,
    });
    expect(got).toBeNull();
  });
});
