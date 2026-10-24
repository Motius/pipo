<div align="center">

# PIPO

### Your company workflow brain

**AI for judgement. Code for repetition.**

[![CI](https://github.com/Motius/pipo/actions/workflows/test.yml/badge.svg)](https://github.com/Motius/pipo/actions/workflows/test.yml)
[![Runtime](https://img.shields.io/badge/runtime-Bun-%23f9f1e1)](https://bun.sh)
[![License](https://img.shields.io/badge/license-RSALv2-blue)](LICENSE)
[![Website](https://img.shields.io/static/v1?label=website&message=pipo-ke.com&color=black)](https://pipo-ke.com)

_An autonomous workflow daemon with desktop awareness, multi-agent delegation, visual workflows, and explicit authority controls._

Pipo is more than a chatbot with tools. It is a persistent daemon that can understand context and act within the authority limits you define. Run the daemon locally, in Docker, or on an approved host, then connect sidecars on the machines where desktop access is needed.

</div>

> **Project guide:** installation, operations, security, scaling, verification, and release guidance are available in [`docs/PIPO_OPERATIONS_GUIDE.md`](docs/PIPO_OPERATIONS_GUIDE.md).

<!-- Add the final product screenshot or demo GIF here when the Motius media asset is approved. -->

---

## Contents

- [What makes Pipo different](#-what-makes-pipo-different)
- [Quick start](#-quick-start)
- [Ambient mode](#-ambient-mode)
- [Use cases](#-use-cases)
- [Requirements](#-requirements)
- [Installation](#-installation)
- [Usage and operations](#-usage)
- [Sidecar setup](#️-sidecar-setup)
- [Core capabilities](#-core-capabilities)
- [Configuration](#️-configuration)
- [Architecture](#️-architecture)
- [Development](#️-development)
- [Documentation](#-documentation)
- [Telemetry](#-telemetry)
- [Security](#-security)
- [License](#-license)

---

## 🔍 What Makes pipo Different

| Feature                 | Typical AI Assistant       | pipo                                                                     |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Always-on               | No — request/response only | Yes — persistent daemon, runs 24/7 on a server or locally                |
| Reach across machines   | No — single machine only   | Yes — one daemon, multiple authenticated sidecars                        |
| Desktop awareness       | No                         | Yes — screen capture every 5-10s via sidecar                             |
| Native app control      | No                         | Yes — Go sidecar with Win32/X11/macOS automation                         |
| Multi-agent delegation  | No                         | Yes — specialist roles coordinated by the agent manager                  |
| Visual workflow builder | No                         | Yes — 50+ nodes, n8n-style                                               |
| Voice with wake word    | No                         | Yes — streaming TTS + openwakeword                                       |
| Goal pursuit (OKRs)     | No                         | Yes — drill sergeant accountability                                      |
| Authority gating        | No                         | Yes — runtime enforcement + audit trail                                  |
| LLM provider choice     | Usually locked to one      | Anthropic, OpenAI, Gemini, Ollama, Groq, OpenRouter, OmniRoute, and more |

---

## ⚡ Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/Motius/pipo/main/install.sh | bash
pipo start -d                   # Start as background daemon
```

Open `http://localhost:1846` — the dashboard walks you through LLM provider, voice, and a quick conversational profile interview the first time you visit.

> [!IMPORTANT]
> The daemon listens on port `1846` by default. Keep setup mode local or behind
> an authenticated HTTPS reverse proxy; do not expose an unconfigured instance
> directly to the public internet.

> [!TIP]
> Start with a read-only workflow. Add approvals before enabling actions that
> send messages, change files, publish content, or modify external accounts.

---

## 🪨 Ambient mode

pipo ships a "dashboard-less" experience built around a small cursor-following pebble — **on by default** after onboarding. Just run:

```bash
bun run start
```

What you get:

- **Pebble** — a small paper-toned disc that follows your cursor. Wake-word ("Hey pipo"), `Ctrl+Shift+Space`, or click summons it. Long-press the disc to blind awareness instantly (privacy toggle); the eye glyph next to it shows when pipo is actively reading your screen.
- **Native windows** — supported dashboard rooms can open as native companion windows via voice ("open settings", "show me workflows") or `Ctrl+Shift+K`, where the sidecar platform supports them.

  Both hotkeys changed in #563: they used to be `Ctrl+Space` and `Ctrl+K`, which collide with macOS's "select the previous input source" and with the system-wide Emacs kill-line binding that every text field honours. Set `pebble.summon_hotkey` / `pebble.palette_hotkey` in `~/.pipo/config.yaml` to change them, or to `off` to have none. One cost worth knowing on **Windows and Linux**, where a hotkey is grabbed exclusively: while pipo runs it takes `Ctrl+Shift+K` away from Firefox's Web Console and VS Code's delete-line, and `Ctrl+Shift+Space` away from VS Code's parameter hints and Word's non-breaking space. On macOS those apps use Cmd for all four, so nothing is taken. See [docs/PEBBLE_HOTKEYS.md](docs/PEBBLE_HOTKEYS.md).

- **Sub-pebble rail** — say "in the background, research X" and a colored sub-pebble flies to the right edge of your screen. Click it to see what the agent is doing; "open full ↗" pops a dedicated result panel.
- **Voice-first** — "what's on my screen?", "close all background agents", "open the workflows window", "in the background, summarize today's meeting notes" — all routed inline, no LLM round-trip for the common verbs.

The native sidecar has platform-specific backends for **Windows, macOS, and Linux**. On headless machines, CI, or systems without native desktop integration, the `localhost:1846` dashboard remains available as the primary surface.

> **Opt out:** set `pipo_AMBIENT_UI=0` to disable the pebble + sidecar voice loop (useful for headless servers, CI, or users who only want the web dashboard).

---

## ☁️ Managed hosting

If you do not want to manage a server, run the Docker image on an approved
managed container host. The provider must support persistent volumes, WebSocket
connections, HTTPS termination, and outbound connections to the model providers
you configure. Follow the provider's instructions for DNS, TLS, backups, and
secret management; Pipo does not provision those services for you.

---

## 💡 Use Cases

**Research while you work** — Ask pipo to deep-dive a topic. It runs browser searches, reads pages, and compiles a summary in the background while you focus on other things.

**Automate across machines** — Run the daemon on your home server. Connect sidecars on your work laptop and your desktop. pipo can move files between them, run scripts on your server, and open apps on your laptop — all from one conversation.

**Inbox triage** — Set up a workflow that monitors your Gmail, categorizes incoming messages, drafts replies for your review, and schedules follow-ups on your calendar.

**Desktop co-pilot** — pipo watches your screen via the sidecar. If it sees you struggling with an error message or a complex form, it proactively offers help or fills in fields for you.

**Goal accountability** — Define OKRs in the Goals dashboard. pipo plans your day each morning, checks in during the evening, and escalates if you're falling behind — like a personal drill sergeant.

**Multi-step workflows** — Build visual automations with the available workflow node types: "when a file appears in this folder, OCR it, extract key data, update the spreadsheet, and notify me on Telegram."

---

## 📋 Requirements

- **Bun** >= 1.0 (installed automatically if missing)
- **Native daemon install**: macOS, Linux, or WSL2
- **Windows daemon**: use Docker Desktop or WSL2; native Windows daemon installs are not supported
- **Desktop sidecar**: macOS, Linux, and Windows builds are supported separately
- **LLM API key** — at least one of: Anthropic, OpenAI, Google Gemini, or a local Ollama instance

---

## 📦 Installation

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/Motius/pipo/main/install.sh | bash
```

After opening a new terminal, run:

```bash
pipo start
```

The install script sets up Bun, clones the repo, and links the `pipo` CLI. Then finish setup in your browser at `http://localhost:1846`.

### bun (manual)

```bash
git clone https://github.com/Motius/pipo.git ~/.pipo/daemon
cd ~/.pipo/daemon
bun install
bun run build:ui
bun link
pipo start
```

The first time you run `pipo start`, the daemon boots in setup mode and the dashboard at `http://localhost:1846` guides you through LLM provider, voice (TTS) choice, a conversational profile interview, and a 10-minute spotlight tour.

> **Restart after first-time setup:** The daemon constructs background services (heartbeat, commitments, awareness) at boot, gated on setup having already been completed. Once you finish setup in the dashboard, those services don't activate until the next start — the dashboard shows a banner reminding you. Run `pipo restart` (or stop/start) to bring them online. This will go away in a follow-up that constructs the services in-process at setup completion.

> **Windows note:** The Pipo daemon does not run natively on Windows. Use WSL2 for a Bun installation or Docker Desktop for Windows. The Windows desktop sidecar remains supported separately. The dashboard and core workflow engine do not require a native desktop sidecar.

### Docker

Run pipo on any OS with a single command — no Bun or dependencies required. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, macOS, Linux) if you don't have Docker yet.

```bash
docker run -d --name pipo \
  -p 1846:1846 \
  -v pipo-data:/data \
  ghcr.io/Motius/pipo:latest
```

The image is available on [GHCR](https://ghcr.io/Motius/pipo). Non-LLM configuration can be provided via environment variables or by mounting a `config.yaml` into the `/data` volume. LLM providers, API keys, and model routing are configured from the settings dashboard (open http://localhost:1846 after first boot) and stored in the database + encrypted keychain - they are not set via env vars or `config.yaml`.

> **Note:** Docker runs in an isolated container, so the daemon inside it cannot access your host desktop, browser, or clipboard directly. You must still install the [sidecar](#sidecar-setup) on each machine where you want pipo to have desktop awareness and automation capabilities.

---

## 🚀 Usage

```bash
pipo start            # Start in foreground
pipo start -d         # Start as background daemon
pipo start --port 1846 # Start on a specific port
pipo stop             # Stop the daemon
pipo status           # Check if running
pipo doctor           # Verify environment & connectivity
pipo logs -f          # Follow live logs
pipo autostart        # Keep it running across logins (and boots, on Linux)
```

The dashboard is available at `http://localhost:1846` once the daemon is running.

### Logs

`pipo start -d` writes the daemon's output to `~/.pipo/logs/pipo.log`, and
`pipo logs -f` follows it. Started any other way - in the foreground, under
systemd, in Docker - there is no file: output goes to the terminal, `journalctl`
or `docker logs`. To get the same file in every launch mode, add to
`~/.pipo/config.yaml`:

```yaml
daemon:
  log_file_path: "~/.pipo/logs/pipo.log"
  log_file_max_bytes: 1048576 # optional, defaults to 1 MiB
```

The daemon mirrors its output there in addition to wherever it already goes.
Lines are timestamped, stripped of terminal colour codes, and run through the
credential redactor, so the file is safe to hand to someone debugging. It is
capped: past `log_file_max_bytes` the oldest lines are dropped, so it settles at
roughly that size instead of filling the disk. Unset means no file.

The cap is an in-memory ring as well as a file size, so `log_file_max_bytes` is
an RSS budget too - 1 MiB of log is 1 MiB of daemon memory. It is clamped to
4 KiB..64 MiB.

One thing to expect from `pipo logs -f`: it runs `tail -F`, and every time the
cap is enforced the file is replaced, so `tail` reopens it and reprints the
whole window. At the default size that is ~1 MiB of already-seen lines about
every 256 KiB of new output. That is inherent to capping one file in place, not
a bug.

### Keeping pipo running

`pipo autostart` installs the service that starts pipo at login and brings it
back after a crash: a **systemd user service** on Linux, a **launchd user agent**
on macOS. Nothing else in pipo installs one, so until you run it the daemon
only runs for as long as you keep it running yourself.

```bash
pipo autostart              # install or refresh the definition, and start it
pipo autostart --status     # what is installed, and whether it is current
pipo autostart --uninstall  # stop the service and remove the definition
```

What it will and will not do:

- **It never overwrites a definition that differs from the one this version
  writes.** It prints the differences and writes nothing; `pipo autostart
--force` applies them. An install from an older pipo and an edit of your own
  look the same from here, and even the `bun` path differs between shells. On
  Linux, `systemctl --user edit pipo.service` is the way to keep your changes:
  a drop-in survives a reinstall.
- **It starts the service only when no daemon is running already.** The service
  starts the daemon itself, so a second one would fail on the lock file. Pass
  `--no-start` to install the definition without starting anything.
- **A refresh does not restart a running daemon.** It keeps the definition it was
  started with until it restarts, and the command prints the one line that
  applies the new one.
- **`pipo stop` stays stopped.** Both definitions bring pipo back after a
  failure only, never after a clean exit. The exception is a stop whose drain
  overruns its deadline and escalates to `SIGKILL`: that is not a clean exit, so
  it is relaunched. Remove autostart first if you need such a daemon to stay
  down.
- **A crash loop is bounded on Linux only.** systemd gives up after five starts
  in two minutes and leaves the unit failed, which `pipo status` explains.
  launchd has no equivalent, so on macOS a daemon that cannot boot is retried
  about every ten seconds for as long as you are logged in. A `pipo restart`
  there also leaves the new daemon outside the agent until your next login, and
  says so.

`pipo status` names a definition that still has what this version fixed - a
browser opening on every start, an unbounded restart loop, a `pipo stop` that
gets undone - whenever it can tell, and `pipo uninstall` removes autostart for
you, in the order that does not get the daemon relaunched mid-uninstall. See
[Running under systemd](docs/SELF_HOSTING.md#running-under-systemd) for what
changes once pipo is a unit's main process.

### Updating

`pipo update` detects how you installed pipo and runs the right update command. Equivalent manual commands per install method:

| Install method                                  | `pipo update` dispatches to                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Bun global (`bun install -g @pipo/brain`)       | `bun update -g @pipo/brain`                                                            |
| `install.sh` (git clone under `~/.pipo/daemon`) | `git pull --ff-only` + `bun install`                                                   |
| Docker                                          | Refused — run `docker pull <image> && docker rm -f pipo && docker run ...` on the host |
| Developer checkout                              | Refused — run `git pull` yourself                                                      |

Run `pipo doctor` to see what was detected and the exact commands for your install.

**Under a systemd user service** (pipo is the main process of a unit such as `pipo.service`), `pipo update` and `pipo restart` go through systemd instead of stopping and starting the daemon themselves. See [Running under systemd](docs/SELF_HOSTING.md#running-under-systemd) for the details. In short:

- The update runs as a separate transient unit named `<unit>-update`, for example `pipo-update`. It stops the service, installs, and starts the service again. From a terminal, `pipo update` follows it until it finishes or hits its time limit. From anywhere else, including the assistant's own shell, it returns straight away. Follow it with `journalctl --user -u pipo-update -f`, and `pipo status` shows the last result.
- `pipo restart` asks systemd to restart the unit and ignores `-d`, `--port` and the other start flags.

### Removing pipo

`pipo uninstall` stops the daemon, removes autostart hooks, deletes `~/.pipo`, and — where applicable — runs the correct package-manager uninstall. It does **not** touch sidecars.

| Install method     | `pipo uninstall` dispatches to                                                              |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Bun global         | `bun uninstall -g @pipo/brain` + side-effect cleanup                                        |
| `install.sh`       | `rm -rf ~/.pipo/daemon` + CLI wrapper + side-effect cleanup                                 |
| Docker             | Refused — run `docker rm -f pipo` (and optionally `docker volume rm pipo-data`) on the host |
| Developer checkout | Side-effect cleanup only — your checkout is left in place                                   |

> **Tip:** If you already ran `bun uninstall -g @pipo/brain` without going through `pipo uninstall`, your daemon may still be running and `~/.pipo` is still on disk. Run `pipo doctor` before uninstalling to see what will be cleaned up, or stop the daemon and remove `~/.pipo` manually.

---

## 🖥️ Sidecar Setup

The sidecar is what gives pipo physical reach beyond the machine it runs on. It is a lightweight agent that you install on any machine — your laptop, a dev server, a home PC — and it connects back to the central daemon over an authenticated WebSocket. Each sidecar gives pipo access to that machine's desktop, browser, terminal, filesystem, clipboard, and screenshots.

This means you can run the daemon on an always-on server and still interact with your desktop machines as if pipo were running locally. Add multiple sidecars as your permissions, network, and available resources allow.

### 1. Install the sidecar

**Via bun:**

```bash
bun install -g @pipo/sidecar
```

**Or download the binary** from [GitHub Releases](https://github.com/Motius/pipo/releases) for your platform (macOS, Linux, Windows).

### 2. Enroll in the dashboard

1. Open the pipo dashboard at `http://localhost:1846`
2. Go to **Settings** → **Sidecar**
3. Enter a friendly name for this machine (e.g. "work laptop") and click **Enroll**
4. Click **Copy** to copy the token command

### 3. Run the sidecar

Just start it:

```bash
pipo
```

The first time it runs unconfigured, a small **setup window** pops up asking for
the enrollment token — paste the token you copied and click **Connect**. The
sidecar saves it locally (`~/.pipo/sidecar.yaml`) and connects.

Prefer the terminal / a headless box? Pass the token on the CLI instead (no
window):

```bash
pipo --token <your-token>
```

Either way, subsequent runs are just `pipo` (the saved token is reused).

Once connected, the sidecar appears as online in the Settings page where you can configure its capabilities (terminal, filesystem, desktop, browser, clipboard, screenshot, awareness, file watch, processes, notifications). The host-sensing observers (clipboard, file watch, process monitor, desktop notifications) run inside the sidecar on your machine and stream to the brain - the brain no longer observes its own host.

To inspect enrolled devices from the daemon host:

```bash
pipo sidecars list
pipo sidecars list --json
```

### Versioning & updates

The sidecar is versioned **independently of the brain**, and every brain release ships with a specific sidecar version. Run `pipo --version` to see what you have.

The sidecar updates itself to the version your brain ships with (never to anything newer than your brain knows about):

- **At startup**, if an update is available, the sidecar shows a prompt: _Update now_, _Later_, or _Skip this version_ (Windows and macOS).
- **While running**, the tray menu gets an _Update to vX.Y.Z_ item, and the dashboard shows a _sidecar update_ hint in the top bar and an _Update_ button in **Settings -> Sidecar**. On Windows and macOS these open the same prompt on that machine; on Linux the dashboard installs the update directly after asking you.
- The update is downloaded from npm, checked (sha512, plus the code signature on Windows and macOS) and swapped in place, and the sidecar restarts in a few seconds; the brain keeps working meanwhile. If the new version keeps failing to start, the previous one is restored.
- A sidecar installed with bun or npm is updated with that package manager. If it cannot be updated automatically, you get the exact command to run instead (`bun add -g @pipo/sidecar@X.Y.Z`, or the installer from [GitHub Releases](https://github.com/Motius/pipo/releases/tag/installer-latest)).

If a sidecar is too old for the brain (**Update required**), the brain refuses the connection; the sidecar stays running, shows its update prompt (or a desktop notification on Linux) and tries the brain again every 30 minutes. Local development builds report `dev` and are never updated or blocked.

---

## 🧠 Core Capabilities

**Conversations** — Multi-provider LLM routing (Anthropic Claude, OpenAI GPT, Google Gemini, Ollama). Streaming responses, personality engine, vault-injected memory context on every message.

**Tool Execution** — 14+ builtin tools with up to 200 iterations per turn. The agent loop runs until the task is complete, not until the response looks done.

**Memory & Knowledge** — Vault knowledge graph (entities, facts, relationships) stored in SQLite. Extracted automatically after each response. Injected into the system prompt so pipo always remembers what matters.

**Browser Control** — Auto-launches Chromium via CDP. 7 browser tools handle navigation, interaction, extraction, and form filling.

**Desktop Automation** — Go sidecar with JWT-authenticated WebSocket, RPC protocol, and binary streaming. Win32 API automation (EnumWindows, UIAutomation, SendKeys) on Windows, X11 tools on Linux.

**Multi-Agent Hierarchy** — `delegate_task` and `manage_agents` tools. An AgentTaskManager coordinates specialist roles. Sub-agents are denied governed actions — authority stays with the top-level agent.

**Voice Interface** — Edge TTS or ElevenLabs with streaming sentence-by-sentence playback. Binary WebSocket protocol carries mic audio (WebM) and TTS audio (MP3) on the same connection. Wake word via openwakeword (ONNX, runs in-browser).

**Continuous Awareness** — Full desktop capture at 5-10 second intervals. Hybrid OCR (Tesseract.js) + Cloud Vision. Struggle detection, activity session inference, entity-linked context graph. Proactive suggestions and an overlay widget.

**Workflow Automation** — Visual builder powered by `@xyflow/react`, with nodes across multiple categories. Triggers include cron, webhook, file watch, screen events, polling, clipboard, process, git, email, and calendar. Supports natural-language creation, YAML export/import, retry, fallback, and AI-assisted self-healing.

**Goal Pursuit** — OKR hierarchy (objective → key result → daily action). Google-style 0.0-1.0 scoring. Morning planning, evening review, drill sergeant escalation. Awareness pipeline auto-advances progress. Three dashboard views: kanban, timeline, metrics.

**Authority & Autonomy** — Runtime enforcement with soft-gate approvals. Multi-channel approval delivery (chat, Telegram, and desktop). Full audit trail. Emergency pause/kill controls. Consecutive-approval learning suggests auto-approve rules.

**Learned Commands (zero-LLM replay)** — Teach a phrase once (`learn_command`) and say it forever after: pipo replays the recorded action with no model call. Whether a phrase may replay free is re-decided from live skill/tool state at every replay (`decideReplay`) — anything reaching email, payments, deletes or settings falls back to the normal approval-card turn, never a bypass. Runs are counted per phrase, including refusals.

**Cheap "tell me when" watchers** — `manage_watchers` creates a one-row watch over a window title or clipboard on a chosen sidecar. Polling is deterministic sidecar RPC (default every 5s, no tokens), fires once, expires on its own, notifies the pebble and dashboard, and can hand a recorded follow-up back as a fresh turn. "Tell me when Codex is done" and "stop watching" work by voice without the model.

**Dictation (pebble)** — Say "start dictation" and every subsequent pebble summon inserts the transcript straight into the app you were in — the window focused at summon time is re-focused by pid before typing, so the pebble bubble never becomes the destination. "Stop dictation" is honored even mid-mode. No model calls while inserting.

**Steering live tasks** — Corrections fold into running background agents instead of restarting them: `manage_agents steer` for the model, `POST /api/agents/tasks/:id/steer` for the dashboard. The note is drained at the sub-agent's next provider-call boundary, so work already done is kept.

**`pipo budget`** — Honest local spend report from the usage ledger: calls, tokens (incl. cache), model time, median ask cost, split by subsystem and model (`GET /api/llm/cost-report` for the dashboard). Prices are deliberately not baked in — the report speaks in tokens and time; you multiply by your own rates.

**How pipo compares** — see [`docs/COMPARISON_ATTICUS.md`](docs/COMPARISON_ATTICUS.md) for a feature-by-feature comparison with the Atticus voice assistant (learned commands, watchers, dictation, steering, budget), including what only pipo does and the gaps that remain.

---

## ⚙️ Configuration

pipo stores its system configuration at `~/.pipo/config.yaml`; user-level settings live in its database and are managed from the dashboard. Access is **JWT-only by default**: run `pipo enroll "<device-name>"` and paste the printed token into the sidecar (desktop app), which connects and gives you the dashboard. Setting up without a sidecar? Temporarily add `auth:\n  insecure_open_access: true` to config.yaml, open `http://localhost:1846` after `pipo start` for the guided setup, then **remove the flag** once your device is enrolled. The Settings room lets you tweak channels, personality, and authority later.

Running the daemon on another machine — a home server, a LAN box, or an approved remote Linux host with a domain? Read [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for reverse-proxy setup, public URL configuration, device enrollment across machines, and what plain-HTTP access does and does not support.

```yaml
daemon:
  port: 1846
  data_dir: "~/.pipo"
  db_path: "~/.pipo/pipo.db"

llm:
  primary: "anthropic"
  fallback: ["openai", "gemini", "ollama"]
  anthropic:
    api_key: "sk-ant-..."
    model: "claude-sonnet-4-6"

personality:
  core_traits: ["loyal", "efficient", "proactive"]
  assistant_name: "pipo"

authority:
  default_level: 3

active_role: "personal-assistant"
```

See [config.example.yaml](config.example.yaml) for the full reference including Google OAuth, Telegram, ElevenLabs, and voice settings.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     pipo Daemon                           │
│                  (server or local machine)                  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐   │
│  │ LLM      │  │ Vault    │  │ Agent     │  │ Workflow  │   │
│  │ Router   │  │ Memory   │  │ Manager   │  │ Engine    │   │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Tool     │  │ Authority│  │ Goal      │  │ Awareness │   │
│  │ Executor │  │ Engine   │  │ Tracker   │  │ Pipeline  │   │
│  └──────────┘  └──────────┘  └───────────┘  └───────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Bun.serve() — HTTP + WebSocket + Dashboard (React)   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────┬───────────────────────┘
               │ JWT-auth WebSocket   │
       ┌───────┴───────┐       ┌──────┴────────┐
       │  Sidecar #1   │       │  Sidecar #2   │      ...
       │  (laptop)     │       │  (dev server) │
       │               │       │               │
       │  desktop      │       │  terminal     │
       │  browser      │       │  filesystem   │
       │  terminal     │       │  screenshots  │
       │  clipboard    │       │               │
       └───────────────┘       └───────────────┘
```

The **daemon** is the brain — it holds the LLM connections, memory vault, agent hierarchy, and decision-making. It can run on a home server, an approved remote Linux host, or your local machine.

**Sidecars** are the hands. Each sidecar is a lightweight Go binary that connects to the daemon and exposes its host machine's capabilities. The daemon can orchestrate actions across all connected sidecars simultaneously. Sidecars authenticate via JWT and communicate over a binary WebSocket protocol.

This separation means pipo stays reachable 24/7 on a server while still being able to see your screen, type in your apps, and manage files on any machine where a sidecar is running.

---

## 🛠️ Development

```bash
bun test                # Run all tests (see CI for the full matrix)
bun run dev             # Hot-reload daemon
bun run build:ui        # Rebuild dashboard
bun run db:init         # Initialize or reset the database
```

### Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript (ESM)
- **Database**: SQLite via `bun:sqlite`
- **UI**: React 19, Tailwind CSS 4, `@xyflow/react`
- **LLM**: Anthropic Claude, OpenAI GPT, Google Gemini, Ollama
- **Desktop sidecar**: Go (JWT auth, WebSocket RPC, platform-specific automation)
- **Voice**: openwakeword (ONNX), Edge TTS / ElevenLabs
- **Package**: `@pipo/brain` (published to npm registry, installable via bun)

---

## 📖 Documentation

General:

- [config.example.yaml](config.example.yaml) — Full configuration reference
- [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — Deploying the daemon on a single machine, LAN, or remote Linux host behind a reverse proxy
- [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md) — LLM provider configuration and routing
- [docs/VAULT_EXTRACTOR.md](docs/VAULT_EXTRACTOR.md) — Memory and knowledge vault
- [docs/PERSONALITY_ENGINE.md](docs/PERSONALITY_ENGINE.md) — Personality and role system
- [docs/TELEMETRY.md](docs/TELEMETRY.md) — What anonymous metrics are collected, and how to opt out

Workflows (contributor reading order):

- [docs/WORKFLOW_AUTOMATION.md](docs/WORKFLOW_AUTOMATION.md) — Architecture, source-tree map, and runtime walkthrough. Start here.
- [docs/PIECE_VERIFICATION.md](docs/PIECE_VERIFICATION.md) — 8-stage checklist to verify a piece end-to-end. Required before adding or editing any piece.
- [src/workflows/activepieces/UPSTREAM.md](src/workflows/activepieces/UPSTREAM.md) — Pinned Activepieces SHA, license posture, vendored exclusions
- [src/workflows/pieces-library/README.md](src/workflows/pieces-library/README.md) — How community pieces are curated and installed at runtime

---

## 💬 Community

- [Website](https://pipo-ke.com) — Project homepage and documentation
- [GitHub Issues](https://github.com/Motius/pipo/issues) — Bug reports and feature requests

---

## 📊 Telemetry

pipo sends **anonymous** usage metrics so the project can measure its unique
user base and retention. Each ping contains only a hashed machine id (derived
from hostname + username, never reversible to either), the app version, the
install method, and the OS/arch. No personal data, config, content, or feature
usage is ever sent. Pings go out at startup and every hour.

It is on by default (opt-out). Disable it with any of:

```yaml
# ~/.pipo/config.yaml
telemetry:
  enabled: false
```

```bash
pipo_TELEMETRY=0   # or the cross-tool standard: DO_NOT_TRACK=1
```

Full details: [docs/TELEMETRY.md](docs/TELEMETRY.md).

---

## 🔒 Security

pipo includes a built-in authority engine that gates every action at runtime. All tool executions are logged in an audit trail, and sensitive operations require explicit approval via the dashboard, Telegram, or desktop notifications. Emergency pause and kill controls are always available. An approved action that a restart interrupted before its receipt shows up in Authority as unresolved: it is never rerun on its own, and you decide whether to run it once or close it.

If you discover a security vulnerability, please report it privately by emailing the maintainer rather than opening a public issue.

---

## 📄 License

pipo is distributed under the [pipo Source Available License 2.0](LICENSE) (based on RSALv2).

The pipo codebase incorporates third-party components under their own licenses. Those components retain their original licenses for any party who extracts them as a standalone work; the combined pipo distribution is governed by the pipo Source Available License. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the full list and per-component license text.
