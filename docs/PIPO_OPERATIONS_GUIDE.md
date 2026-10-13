# Pipo — Migration, Operations, Scaling & Go-to-Market Guide

**Repository:** `https://github.com/Motius/pipo.git`  
**Upstream source:** the public upstream repository supplied for this migration  
**Migration workspace:** `/home/ubuntu/pipo-clone`  
**Prepared:** 7 October 2026

## Executive summary

Pipo is a clean rebrand and product-surface migration of the upstream always-on autonomous AI daemon. The repository now uses the Pipo identity throughout source code, package metadata, CLI commands, config directories, UI copy, documentation, sidecar packaging, Docker metadata, workflow pieces, tests, filenames, and generated UI assets. The dashboard and ambient pebble use the premium Pipo aesthetic established for the earlier website: dark graphite surfaces, warm signal orange, restrained mint execution states, electric green completion states, system-sans typography, IBM Plex Mono for technical labels, crisp borders, and a round signal pebble.

This package is a source checkout prepared for local development and controlled publication. The local Git remote is set to `https://github.com/Motius/pipo.git`; no remote push or release publication was performed from this workspace.

## What is included

The source tree retains the upstream product’s actual application surface rather than replacing it with a marketing mockup:

- **Bun/TypeScript daemon:** persistent process, CLI lifecycle, configuration, LLM routing, voice, awareness, authority, goals, workflows, integrations, storage, and WebSocket communication.
- **React dashboard:** the v2 shell, rooms, command palette, thread/composer, workflow editor, agents, settings, billing surfaces, onboarding, notifications, and responsive product UI.
- **Ambient UI:** cursor-following round Pipo pebble, voice states, talk bubble, background-task rail, hotkeys, and reduced-motion behavior.
- **Go sidecar:** desktop awareness and automation companion, custom titlebar, platform packaging, autostart, browser/webview integration, and token enrollment.
- **Workflow pieces:** Pipo-native agent, ask, context, notify, regex, test, tool, trigger, and validate pieces plus the engine build pipeline.
- **Operational documentation:** installation, configuration, self-hosting, sidecar setup, provider integrations, telemetry, security, privacy-oriented controls, and development references.

## How to get the ZIP

The deliverable ZIP is a portable source snapshot. Download it from the accompanying artifact link, save it locally, and unpack it:

```bash
unzip pipo-premium-migration.zip
cd pipo-clone
```

For a team-owned repository, the preferred long-term path is to publish the checkout to the configured remote after reviewing the diff and legal ownership:

```bash
git remote -v
git status --short
git add -A
git commit -m "Rebrand the upstream daemon as Pipo"
git push -u origin pipo-rebrand:main
```

Do not push until the Motius repository access, ownership, branch policy, license posture, and package namespace decisions are confirmed.

## Local requirements

The primary runtime is **Bun 1.x or newer**. The daemon targets macOS, Linux, and WSL; native Windows daemon usage should use WSL2 or Docker. The sidecar has separate Go and platform-toolchain requirements. A local LLM provider or cloud LLM credential is required for meaningful assistant behavior, but credentials should be supplied through the setup flow or a secret manager rather than committed to the repository.

Recommended tools:

- Bun >= 1.0
- Git
- Docker Desktop or Docker Engine for container runs
- Go for sidecar builds
- Xcode command-line tools for macOS packaging
- Visual Studio Build Tools / Windows SDK for Windows packaging
- A browser for the local dashboard at `http://localhost:1846`

## Install and run locally

Install the locked dependency graph:

```bash
bun install --frozen-lockfile
```

Build the dashboard, ambient UI, generated workflow pieces, and engine bundle:

```bash
bun run prepublishOnly
```

Start the daemon in the foreground during development:

```bash
bun run start
```

After first boot, open `http://localhost:1846`. The onboarding flow configures an LLM provider, voice preferences, profile context, and initial permissions. For iterative UI work, use:

```bash
bun run dev
```

The globally linkable CLI is named `pipo`:

```bash
bun link
pipo start
pipo status
pipo doctor
pipo logs -f
pipo stop
```

The `pipo` command stores user data under `~/.pipo` by default. Keep that directory outside the source checkout and back it up according to the sensitivity of the connected apps and workflows.

## Docker runbook

Build a local image:

```bash
docker build -t pipo:local .
```

Run it with persistent data:

```bash
docker volume create pipo-data
docker run -d --name pipo \
  -p 1846:1846 \
  -v pipo-data:/data \
  pipo:local
```

Open `http://localhost:1846` and complete setup. The daemon container does not automatically control the host desktop, clipboard, or browser. Install and enroll a Pipo sidecar on each computer where desktop awareness or native automation is needed.

For production, place TLS and authentication at a reverse proxy, restrict the dashboard to trusted networks, use a dedicated data volume, rotate credentials, and send logs to a managed sink. Never expose a setup-mode daemon directly to the public internet.

## Configuration and management

Use the generated configuration example as the starting point:

```bash
cp config.example.yaml ~/.pipo/config.yaml
```

Keep secrets out of Git. Review provider credentials, browser permissions, screen-awareness permissions, workflow authority, telemetry, log paths, sidecar enrollment tokens, and network exposure before enabling automation.

Useful lifecycle commands:

```bash
pipo start                 # foreground daemon
pipo start -d              # background daemon
pipo start --port 1846    # explicit dashboard port
pipo status                # process and health state
pipo doctor                # environment and connectivity diagnostics
pipo logs -f              # follow the configured log stream
pipo autostart             # install or refresh login service
pipo autostart --status
pipo autostart --uninstall
pipo restart
pipo stop
```

For a clean uninstall, stop the daemon, remove its autostart definition, uninstall the package, and only then remove `~/.pipo` after confirming that backups and workflow exports are no longer needed.

## Sidecar management

A sidecar runs on a laptop or desktop and connects back to the Pipo daemon. Use one daemon as the authority and enroll separate sidecars for separate computers. Treat each sidecar token as a credential:

1. Build or install the sidecar for the target platform.
2. Start the daemon and open the sidecar enrollment page.
3. Approve the device and retain the token only in the sidecar’s protected configuration.
4. Verify screen, browser, clipboard, microphone, and native-app permissions individually.
5. Test a read-only workflow before permitting writes or external sends.
6. Revoke and re-enroll a sidecar when a device is lost or a token is exposed.

The companion source is under `sidecar/`. Its Makefile covers local builds, platform packaging, installer generation, and npm wrapper artifacts.

## How to scale responsibly

### First scale: more capability, not more daemons

Start with one daemon and multiple sidecars. Add workflow pieces, provider routing, role definitions, durable log shipping, and a monitored reverse proxy before adding process replicas. The daemon owns local coordination and state; running two daemons against one local data directory is unsafe.

### Second scale: isolate workloads

Separate the user-facing dashboard from long-running workflow execution when workload volume grows. Give heavy workflow execution dedicated worker capacity, bound concurrency per integration, and set explicit timeouts and retry budgets. Use queue-backed execution only after documenting idempotency for every side effect.

### Third scale: externalize durable state

Move database and object storage to managed services before horizontal replication. Define migration, backup, restore, encryption, retention, and disaster-recovery procedures. Keep secrets in a managed vault. Route structured logs and audit events to a centralized system with redaction and access controls.

### Reliability controls

- One authoritative daemon per data root.
- Idempotency keys for outbound actions.
- Approval gates for email, payments, deletion, account changes, and public publishing.
- Rate limits and circuit breakers for each provider.
- Health endpoints and readiness checks separate from liveness.
- Backups tested by restoring into an isolated environment.
- Canary releases for workflow and sidecar updates.
- Explicit rollback versions for both daemon and sidecar.

## What to add next

### Product additions

- A first-run premium dashboard tour tied to real setup state.
- Workspace-level roles, device groups, and policy templates.
- Audit search with export and retention controls.
- Workflow versioning, approvals, dry-run mode, and replayable test fixtures.
- Provider health and cost routing dashboard.
- Team sharing with scoped secrets and environment promotion.
- Native Mac visual polish: menu-bar status, keyboard-first navigation, and signed notarized app distribution.

### Engineering additions

- Contract tests for every Pipo-native workflow piece.
- Cross-platform CI for Bun, macOS, Linux, WSL, and Go sidecar builds.
- Release signing and provenance attestations.
- SBOM generation and dependency vulnerability monitoring.
- Load tests for workflow concurrency and WebSocket fan-out.
- A documented database migration policy and restore drill.
- Browser automation fixtures that run without real user credentials.

### Brand and design additions

- Replace the placeholder favicon with the final Pipo mark across dashboard, installer, docs, and release assets.
- Keep dark graphite as the default; expose light mode as an intentional alternate, not an accidental system flash.
- Use orange only for product signal and action emphasis; reserve green for confirmed completion.
- Preserve the round pebble silhouette across React, native sidecar, installer, and marketing surfaces.

## Verification performed for this package

The following checks were run in the migration workspace:

| Check | Result |
|---|---|
| `bun install --frozen-lockfile` | Passed |
| `bun run build:ui` | Passed; Bun emitted non-fatal Tailwind at-rule warnings |
| `bun run check:package` | Passed; 2 required paths present in the Bun tarball |
| `bun run check:no-ee` | Passed; no Activepieces EE-licensed code found |
| `bun run prepublishOnly` | Passed; UI, workflow pieces, and engine bundle built |
| Original identity audit | Passed; no original identity in source, generated UI, or filenames |
| Focused CLI/WebSocket/log tests | Passed except one host-specific systemd-analyze warning case |
| Full upstream test suite | Started and produced extensive passing output, but the sandbox prompt window terminated the long run before a final aggregate summary |

The one focused failure was environmental: `systemd-analyze` returned a warning from the sandbox’s unrelated `/etc/systemd/system/envd.service` about deprecated `CPUShares`, while the generated Pipo unit itself was valid. Re-run the full suite on a normal development host for a final aggregate result.

## Marketing and launch plan

### Positioning

Lead with the concise promise: **Pipo is your company workflow brain — AI for judgement, code for repetition.** The differentiator is not a chat box with tools; it is a persistent, permission-aware system that can observe context, reason about work, and execute repeatable workflows across connected machines.

### Initial audiences

1. Founder-led teams that need an executive operations layer.
2. Agencies and studios with repeatable research, reporting, and client workflows.
3. Technical operators who want self-hosted automation with explicit authority controls.
4. Power users who want one assistant across a laptop, desktop, and home server.

### Launch sequence

- **Proof:** publish the premium site, a 90-second product walkthrough, architecture diagram, security page, and sidecar demo.
- **Pilot:** recruit 10–20 design partners and measure time saved, successful workflow completion, approval friction, and retention.
- **Trust:** publish threat model, permissions matrix, data-handling policy, backup guide, and incident-response contact.
- **Distribution:** launch on GitHub, relevant self-hosting communities, founder/operator newsletters, and targeted product demos.
- **Conversion:** offer a free self-hosted core, paid managed hosting or team controls, and premium implementation for workflow design.

### Content that sells without overpromising

Show before/after workflows, not generic AI claims. Demonstrate a research brief, inbox triage with approval, cross-machine file movement, and a deterministic report pipeline. Every demo should show the authority boundary, the approval state, the audit trail, and the recovery path.

### Metrics

Track activation to first successful workflow, time to first sidecar enrollment, weekly active workflows, approval completion rate, failure recovery rate, provider cost per workflow, retained teams, and support load. Avoid vanity metrics that do not reflect completed work or user trust.

## Repository handoff checklist

Before publishing the rebrand:

- Confirm Motius owns or is authorized to use the upstream code and license.
- Confirm the final package scopes (`@pipo/brain`, `@pipo/sidecar`) and registry ownership.
- Confirm the GitHub repository exists and the local remote is correct.
- Review generated diffs for source-map, fixture, or line-ending noise.
- Add CI secrets only through repository secret storage.
- Configure release signing, container publishing, npm publishing, and GitHub releases.
- Run the full test suite on a supported host without the sandbox’s systemd warning.
- Publish a security contact, privacy policy, terms, license, and disclaimer.
- Keep the ZIP as an archival handoff, not as the long-term source of truth.

## Final operating principle

Pipo should feel premium because it is calm, legible, permission-aware, and dependable under pressure—not because it hides complexity. Keep the visual system restrained, keep automation observable, and keep every consequential action reviewable.
