/**
 * `@pipopieces/piece-pipo-context` -- read-only access to pipo state.
 * Vault entities, recent awareness activity, commitments. Use for pulling
 * pipo-side data into a flow run as input for downstream nodes.
 *
 * Each action calls back to a dedicated `/v1/pipo/context/...` endpoint.
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { vaultSearchAction } from "./lib/actions/vault-search";
import { vaultGetEntityAction } from "./lib/actions/vault-get-entity";
import { awarenessRecentAction } from "./lib/actions/awareness-recent";
import { commitmentsListAction } from "./lib/actions/commitments-list";

export const pipoContextPiece = createPiece({
  displayName: "pipo: Context",
  description:
    "Read from pipo state: vault entities, recent awareness activity, commitments. Read-only; use the relevant write tools for mutation.",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["pipo"],
  actions: [
    vaultSearchAction,
    vaultGetEntityAction,
    awarenessRecentAction,
    commitmentsListAction,
  ],
  triggers: [],
});
