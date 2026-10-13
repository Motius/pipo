/**
 * `pipoGoogleConnectionSource` -- bridges pipo's existing Google OAuth
 * file (`~/.pipo/google-tokens.json`) into the workflow runtime's
 * `CredentialResolver`. When a piece asks for `pipo:google` (or any
 * `pipo:google:*` sub-id), the source returns the live access token
 * (refreshed on demand by `GoogleAuth.getAccessToken`) so users who already
 * authenticated pipo with Google see a "pipo Google" connection in the
 * workflow piece picker without re-authenticating per piece.
 *
 * The piece sees an `OAUTH2`-shaped value:
 *   { access_token, refresh_token, scope?, token_type, expiry_date? }
 *
 * Pieces typically only read `access_token`. We surface the full set so any
 * piece that introspects more (refresh dance, scope checks) sees consistent
 * values.
 */

import type { GoogleAuth } from "../../integrations/google-auth";
import type {
  pipoConnectionSource,
  ResolvedConnection,
} from "./adapter";

export const pipo_GOOGLE_PREFIX = "pipo:google";

export class pipoGoogleConnectionSource implements pipoConnectionSource {
  readonly id = "google";

  private readonly getAuth: () => GoogleAuth | null;

  /**
   * Accepts either a `GoogleAuth` instance or a getter. The daemon passes a
   * getter reading its live `googleAuth` binding so settings hot reload
   * (connecting Google mid-run, rotating the OAuth client) is picked up
   * without re-registering the source; a bare instance is kept for tests
   * and simple embedders.
   */
  constructor(auth: GoogleAuth | (() => GoogleAuth | null)) {
    this.getAuth = typeof auth === "function" ? auth : () => auth;
  }

  canResolve(externalId: string): boolean {
    return externalId === pipo_GOOGLE_PREFIX || externalId.startsWith(`${pipo_GOOGLE_PREFIX}:`);
  }

  async resolve(_externalId: string): Promise<ResolvedConnection | null> {
    const auth = this.getAuth();
    if (!auth || !auth.isAuthenticated()) {
      // Not configured or not yet authenticated -- piece will see
      // "connection not found". Surface as null (vs throw) so other
      // sources / repo lookups can still run.
      return null;
    }
    // Trigger refresh-if-expired before reading the snapshot so the
    // returned access_token + expiry_date are consistent.
    const accessToken = await auth.getAccessToken();
    const tokens = auth.getTokens();
    return {
      type: "OAUTH2",
      value: {
        access_token: accessToken,
        refresh_token: tokens?.refresh_token ?? "",
        token_type: tokens?.token_type ?? "Bearer",
        ...(tokens?.expiry_date ? { expiry_date: tokens.expiry_date } : {}),
      },
    };
  }
}
