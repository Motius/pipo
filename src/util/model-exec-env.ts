/**
 * The environment for a process the MODEL directs on the user's machine:
 * `run_command`'s shell, an app the model launches, and the Chrome the model
 * drives over CDP (#514).
 *
 * The daemon's environment, minus the daemon's OWN secrets. Everything else is
 * forwarded, on purpose.
 *
 * DENYLIST, NOT ALLOWLIST, and why that is right here when src/util/
 * subprocess-env.ts argues the opposite. That allowlist is built for a
 * toolchain running in a model-written project tree, where anything beyond
 * PATH/HOME/proxies is incidental. These children are the user's own shell and
 * desktop: nvm and virtualenvs (NVM_DIR, VIRTUAL_ENV, custom PATH entries),
 * `git push` over ssh (SSH_AUTH_SOCK), GUI apps and the browser (DISPLAY,
 * WAYLAND_DISPLAY, XAUTHORITY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR),
 * and whatever else the user's own tools read. The allowlist drops all of
 * those (it keeps locale, proxies and the XDG base dirs, and the WSL interop
 * variables only as per-site extras since #519), so it would break exactly
 * what these tools are for. What must NOT reach them is narrow and knowable:
 * what the daemon itself holds.
 *
 * WHAT IS STRIPPED, read off the code rather than guessed:
 *   - every pipo_* name except the settings in pipo_SETTINGS_ENV_NAMES.
 *     The pipo_ namespace is the daemon's own and a closed set, so it is
 *     classified name by name, and src/util/model-exec-env.test.ts fails on a
 *     pipo_ name read by non-test code in src/, bin/ or scripts/ that is
 *     not classified. A secret added later is stripped without anyone
 *     remembering to list it; a setting added later fails that test until
 *     it is listed. Test-only gates (pipo_TEST_*, pipo_SITE_BUILDER_E2E)
 *     are not listed and are stripped: running the suite through run_command
 *     means setting them in the command itself. A
 *     pattern would not do: pipo_DEBUG_RPC is a bearer secret that matches
 *     none of the secret-shaped patterns in subprocess-env.ts, and
 *     pipo_REQUIRE_ENCRYPTED_CREDENTIALS is a setting that matches one.
 *   - the provider keys in DAEMON_SECRET_ENV_NAMES that are not in that
 *     namespace. See there for where each name comes from.
 *
 * WHAT IS NOT STRIPPED: the user's own credentials -- GITHUB_TOKEN, AWS_*,
 * NPM_TOKEN and the like. Deliberately, not by omission, and on grounds of
 * function rather than containment:
 *   - `run_command` is the user's shell, gated by the authority engine. A user
 *     who exported GITHUB_TOKEN or AWS_PROFILE, or started the daemon under
 *     `aws-vault exec` / `op run` / direnv, did it so that `gh`, `aws` or
 *     `npm publish` act as them, and expects the assistant's shell to do the
 *     same. An app the model launches is likewise the user's app.
 *   - The generic secret-shaped patterns (isSecretEnvName) break the desktop
 *     session if applied outside the pipo_ namespace: /auth/i matches
 *     XAUTHORITY and SSH_AUTH_SOCK, /key/i matches GNOME_KEYRING_CONTROL.
 *   - The daemon's secrets are a different class: they are what the model is
 *     otherwise NOT handed -- the key that decrypts every workflow connection,
 *     the GitHub PAT the site builder pushes with, the debug RPC bearer.
 *
 * ENV HYGIENE, NOT ISOLATION. These children run as the daemon's uid, so a
 * single further command still reaches the same secrets:
 *   - /proc/<daemon pid>/environ holds the environment the daemon was STARTED
 *     with. For run_command the daemon is the shell's parent, so that WAS
 *     `cat /proc/$PPID/environ`. Since #546 the daemon marks itself
 *     non-dumpable at startup and that read returns EACCES -- on Linux, with
 *     the default config, and only while `daemon.allow_process_inspection` is
 *     unset and the prctl helper loaded. Treat the read as open on macOS and
 *     wherever that hardening is off. (The model-driven Chrome no longer opens
 *     file: URLs since #521, so it cannot read the file that way.)
 *     Nothing done to process.env changes it -- and, measured with Bun 1.3, a
 *     `delete process.env.X` does not even reach a Bun.spawn or node
 *     child_process spawn that omits `env`: those inherit the startup
 *     snapshot. Only an explicit env, as here, is filtered.
 *   - ~/.pipo (or pipo_HOME / pipo_SECRETS_DIR) holds the workflow
 *     encryption key and `.secrets.key` on disk by default.
 * What this does buy: `env`, `echo $X`, /proc/self/environ, and everything
 * these children start or open -- the apps a launched browser or editor
 * spawns, every grandchild, crash reporter or log line that snapshots its
 * environment -- no longer carry the daemon's secrets. Keeping them from a process that goes
 * looking is a sandboxing problem.
 *
 * Kept out of subprocess-env.ts on purpose: that file is compiled into the
 * engine bundle (PATCHED_VENDOR_SOURCES in engine-runtime/build.ts), so any
 * edit to it rebuilds every engine and piece. This module does not import it
 * either, so it stays independent of that file's patterns.
 */
import { MODEL_EXEC_ENV_KEY_FLAG, MODEL_EXEC_MARKER_ENV, modelExecMarkers } from './model-exec-marker.ts';

/**
 * The daemon's secrets, by exact name, compared upper-cased. The pipo_ ones
 * are stripped by the namespace rule anyway; they are listed so that each has
 * its source on record and so that the tests can hold the rule to them.
 *
 * Read by the daemon today:
 *   - pipo_WORKFLOW_ENCRYPTION_KEY  workflows/db/encryption.ts (getKey)
 *   - pipo_GITHUB_TOKEN             sites/github-manager.ts
 *   - pipo_DEBUG_RPC                daemon/debug-rpc-gate.ts, which deletes
 *     it from process.env at boot -- a delete that reaches only spawns
 *     passing an explicit env (see the header).
 *
 * Read by earlier releases, until #228 moved LLM configuration into the
 * database and keychain. An install set up from those docs still carries them
 * in its unit file or shell rc -- in the daemon's env because of pipo:
 *   - pipo_API_KEY (the Anthropic key), pipo_OPENAI_KEY, pipo_GROQ_KEY,
 *     pipo_OPENROUTER_KEY, pipo_LITELLM_KEY, NVIDIA_API_KEY
 *                                     config/loader.ts before #228
 *   - OPENAI_API_KEY                  config/realtime.ts before #228
 *
 * Named by #514 rather than by a code read:
 *   - ANTHROPIC_API_KEY. No release read it from the environment; the original
 *     config README told users to export it for pipo.
 *
 * The three outside the pipo_ namespace are an exception to "the user's own
 * credentials are forwarded": a user may export them for their own tools (an
 * `openai` or `claude` CLI run through run_command), and those tools lose
 * them. They are stripped anyway because they are the provider keys this
 * assistant runs on; the trade-off is stated here so that it can be revisited
 * rather than rediscovered.
 */
export const DAEMON_SECRET_ENV_NAMES: readonly string[] = Object.freeze([
  'pipo_WORKFLOW_ENCRYPTION_KEY',
  'pipo_GITHUB_TOKEN',
  'pipo_DEBUG_RPC',
  'pipo_API_KEY',
  'pipo_OPENAI_KEY',
  'pipo_GROQ_KEY',
  'pipo_OPENROUTER_KEY',
  'pipo_LITELLM_KEY',
  'NVIDIA_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
]);

/**
 * pipo_* names that are settings, not secrets, and are forwarded.
 *
 * Forwarded rather than stripped because the consumer of them in a child is
 * pipo itself: `pipo status` / `pipo export --full` / `pipo start` run
 * through run_command must find the same data dir, port and key LOCATION as
 * the daemon. Without pipo_SECRETS_DIR or pipo_WORKFLOW_ENCRYPTION_KEY_FILE
 * that CLI silently resolves a different key directory; without
 * pipo_REQUIRE_ENCRYPTED_CREDENTIALS a daemon started that way comes up
 * without strict mode. The files the locations name are same-uid readable
 * whether or not the pointer is forwarded.
 *
 * One cost remains. On an install no service manager runs, `pipo restart`
 * and `pipo update` run through run_command start the new daemon FROM that
 * shell (under systemd they go through the unit since #525, which starts the
 * daemon with the unit's own env, and launchd relaunches it with its own env:
 * see util/model-exec-marker.ts). A user whose key lives ONLY in
 * pipo_WORKFLOW_ENCRYPTION_KEY gets a daemon without it, which falls back to
 * the key file (encryption.ts getKey):
 *   - no key file, encrypted rows stored: it refuses to boot rather than
 *     generate a fresh key (assertEncryptionKeyForStoredCredentials in
 *     workflows/db/index.ts);
 *   - otherwise saving or reading a credential fails. modelExecEnv flags its
 *     children pipo_MODEL_EXEC_ENV_KEY=<check of this daemon's env key>,
 *     and under that flag getKey uses a key only if it matches the check:
 *     it generates none, and refuses a key file that is some other key -- a
 *     leftover, another instance's, the shared ~/.pipo/cache one -- which
 *     would otherwise split credentials from the env key the user's own next
 *     restart prefers (util/model-exec-marker.ts). An install whose key lives
 *     in a file is never flagged, so it still generates one when it has none.
 * Likewise it comes up without pipo_GITHUB_TOKEN, which nothing flags. The
 * daemon logs the missing key, and `pipo start -d`/`restart -d`/`update`
 * print it. `pipo restart` on a systemd install, or a restart from the
 * user's own terminal, brings every secret back.
 */
export const pipo_SETTINGS_ENV_NAMES: readonly string[] = Object.freeze([
  // Where things are.
  'pipo_HOME', 'pipo_SECRETS_DIR', 'pipo_WORKFLOW_ENCRYPTION_KEY_FILE',
  'pipo_WORKFLOW_DATA_DIR', 'pipo_PIECES_DIR', 'pipo_SHARED_PIECES_DIR',
  'pipo_PIECE_METADATA_CACHE', 'pipo_ENGINE_CACHE_ROOT',
  // How the daemon is reached and identified.
  'pipo_PORT', 'pipo_BRAIN_DOMAIN', 'pipo_PUBLIC_URL',
  'pipo_INSTALL_METHOD', 'pipo_VERSION',
  // Behaviour switches.
  'pipo_REQUIRE_ENCRYPTED_CREDENTIALS', 'pipo_LOG_LEVEL',
  'pipo_TELEMETRY', 'pipo_TELEMETRY_DEBUG', 'pipo_TOOL_FILTER',
  'pipo_WAKE_ENGINE', 'pipo_REALTIME_VOICE', 'pipo_AMBIENT_UI',
  'pipo_ALLOW_LEAKED_ENGINES',
  // The Linux Chrome sandbox opt-out (actions/browser/chrome-sandbox.ts, #521).
  // A daemon or browser started from the model's shell must keep the user's
  // choice, or a host that needs it cannot launch the browser there.
  'pipo_BROWSER_NO_SANDBOX',
  // Workflow engine tuning, read by the daemon. None is a credential.
  'pipo_WORKFLOW_FLOW_TIMEOUT_SECONDS', 'pipo_WORKFLOW_STREAM_STEP_PROGRESS',
  'pipo_WORKFLOW_TERMINAL_TIMEOUT_MS', 'pipo_ENGINE_HANDSHAKE_TIMEOUT_MS',
  'pipo_ENGINE_IDLE_TTL_MS', 'pipo_ENGINE_CACHE_MAX_AGE_DAYS',
  'pipo_ENGINE_CACHE_MAX_BUNDLES', 'pipo_ENGINE_SHUTDOWN_GRACE_MS',
  'pipo_ENGINE_ORPHAN_POLL_MS',
  // Set on model-directed children by modelExecEnv(), and must survive into
  // what they start: see util/model-exec-marker.ts.
  MODEL_EXEC_MARKER_ENV, MODEL_EXEC_ENV_KEY_FLAG,
  // Test seam (cli/version.ts): a substitute git binary.
  'pipo_GIT_BIN',
  // Read by the Go sidecar (sidecar/), which a user may start from
  // run_command. The classification test scans TS/JS only, so these are
  // listed by hand; a telemetry opt-out must survive.
  'pipo_SIDECAR_TELEMETRY', 'pipo_SIDECAR_TELEMETRY_DEBUG', 'pipo_HOSTED_URL',
]);

/**
 * pipo_* names that are neither secrets nor settings: wiring pipo sets on
 * the processes it starts itself, never read from the daemon's own
 * environment. The engine's identity and lifecycle markers
 * (engine-lifecycle.ts), which the reaper uses to recognise an engine; and the
 * unit and run id `pipo update` gives the transient systemd updater it
 * starts (cli/systemd-unit.ts, #525). Known, internal, and stripped like any
 * unlisted pipo_ name -- a model-directed child has no business carrying
 * one. Listed so the classification test knows them.
 */
export const pipo_INTERNAL_ENV_NAMES: readonly string[] = Object.freeze([
  'pipo_ENGINE_MARKER', 'pipo_ENGINE_OWNER_PID', 'pipo_ENGINE_OWNER_START',
  'pipo_ENGINE_BUNDLE', 'pipo_ENGINE_STARTED_AT',
  'pipo_UPDATE_UNIT', 'pipo_UPDATE_RUN',
  // The private capture path the win32 screenshot one-liner reads instead of
  // taking it from the command text (#746). Set only on that spawn, by the
  // daemon, on a file it just created with mkdtemp.
  'pipo_CAPTURE_PATH',
]);

const SECRET_EXACT: ReadonlySet<string> = new Set(DAEMON_SECRET_ENV_NAMES);
const SETTINGS: ReadonlySet<string> = new Set(pipo_SETTINGS_ENV_NAMES);

/**
 * True for a variable holding one of the daemon's own secrets.
 *
 * Case-insensitive on every platform: Windows treats env names that way, and
 * a lowercase spelling of a daemon name has no legitimate user to break.
 */
export function isDaemonSecretEnvName(name: string): boolean {
  const upper = name.toUpperCase();
  if (SECRET_EXACT.has(upper)) return true;
  return upper.startsWith('pipo_') && !SETTINGS.has(upper);
}

/** Pure form, for tests: `base` without the daemon's secrets. */
export function stripDaemonSecrets(base: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined || isDaemonSecretEnvName(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The environment for a model-directed child: the daemon's, with `extra` on
 * top, minus the daemon's secrets, plus the markers of
 * util/model-exec-marker.ts (pipo_MODEL_EXEC=1, and the env-key flag when
 * this process holds or inherited it), set last so no `extra` can drop them. An
 * `undefined` in `extra` removes the key
 * -- the key as spelled: on Windows, where process.env holds `Path`, an extra
 * `PATH` sits beside it rather than replacing it.
 *
 * The strip runs AFTER the merge, so neither an `extra` nor a copy-pasted
 * `{ ...process.env }` can put a secret back. Always returns an object: Bun
 * and node REPLACE the environment when given one, and INHERIT the full
 * startup environment when `env` is omitted, so a `?? undefined` downstream
 * restores the leak.
 */
export function modelExecEnv(extra?: Record<string, string | undefined>): Record<string, string> {
  return { ...stripDaemonSecrets({ ...process.env, ...extra }), ...modelExecMarkers(process.env) };
}
