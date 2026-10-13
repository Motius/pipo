//go:build !pipodebug

package main

// Release builds always talk to the production hosted origin: config/env
// overrides of the handshake base URL are ignored so a tampered sidecar.yaml
// or environment cannot redirect the JWT handoff. Build with
// `-tags pipodebug` to enable overrides for dev/staging.
const hostedOverrideAllowed = false
