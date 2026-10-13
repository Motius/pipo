/**
 * `@pipopieces/piece-pipo-trigger` -- bridges pipo events into workflows
 * and exposes one workflow as the input to another.
 *
 *   trigger: on_event       (polling: subscribe to a pipo event type)
 *   action:  run_workflow   (start another saved workflow; the user picks
 *                            the target via the editor's flow_ref widget,
 *                            value stored as the destination flow id)
 *
 * Both surfaces call back to the daemon. The trigger uses a stateless poll
 * pattern (the daemon keeps a short-lived recent-events buffer; the trigger
 * persists its `since` cursor via `context.store`).
 */

import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { onEventTrigger } from "./lib/triggers/on-event";
import { runWorkflowAction } from "./lib/actions/run-workflow";

export const pipoTriggerPiece = createPiece({
  displayName: "pipo: Trigger",
  description:
    "Bridge pipo events into workflows (on_event trigger) and run saved workflows from inside other workflows (run_workflow action).",
  auth: PieceAuth.None(),
  minimumSupportedRelease: "0.0.0",
  logoUrl: "",
  authors: ["pipo"],
  actions: [runWorkflowAction],
  triggers: [onEventTrigger],
});
