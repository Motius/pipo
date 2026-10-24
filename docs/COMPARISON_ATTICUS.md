# Pipo vs. Atticus (atticus-mac)

Atticus (https://github.com/SaarthurR/atticus-mac) is a macOS menu-bar voice
assistant built on a Claude plan with a Python "brain" and a Swift front end.
Pipo is a server-first workflow daemon with sidecars. The two overlap on the
"talk to your machine" surface; this document maps every Atticus headline
feature against pipo's current state, honestly, and lists what only pipo does.

Parity items 1–5 were closed because they are the parts a person feels every
day (the fast path, the free wait, the steer). The remaining gaps are either
platform-specific (Apple-only speech, draw overlays) or a separate product
surface (meeting copilot).

## Feature-by-feature

| # | Atticus feature | Pipo | How pipo does it |
| - | --------------- | ---- | ---------------- |
| 1 | **Learns** — ask once, replay with no AI ("When I say focus mode…") | **Shipped** | `learn_command` stores a phrase → action reference in the vault. Spoken (or typed) again, a daemon fast path replays it with zero LLM calls. Safety: the free/governed decision is re-read from live skill/tool state at replay time (`decideReplay`), so a phrase whose steps reach email, payments, deletes or settings falls back to the normal approval-card turn — a stored phrase is never a bypass. Fallover answers honestly ("I'll handle it with the normal flow instead"), the way Atticus's ask-first does. |
| 2 | **Watch for me** — "tell me when Codex is done", checks every 5 s with no AI | **Shipped** | `manage_watchers` + voice fast path create a one-row watch (window title or clipboard) pinned to a sidecar. A per-watcher cadence loop (default 5 s) reads via existing sidecar RPCs — nothing in the loop costs tokens. Fires once, expires (default 8 h), notifies on the dashboard + pebble, and can hand a recorded follow-up back as a fresh turn. "Stop watching" cancels by voice. |
| 3 | **Dictate anywhere** — hold a key, talk, words land in any text field | **Shipped** (pebble path) | "Start dictation" arms the mode; every pebble summon then runs STT only and types the transcript into the app in use — the window focused at summon time is recalled by pid before `type_text`, so the pebble bubble never becomes the destination. "Stop dictation" is honored even mid-mode (the stop verb outranks insertion). Verbatim only for now: no AI clean-up pass. |
| 4 | **Steerable background agents** — "tell the hub agent to check HDMI too" folds into the running job | **Shipped** | Background sub-agent tasks existed (AgentTaskManager + chips). New: `manage_agents steer` (tool) and `POST /api/agents/tasks/:id/steer` (dashboard) queue a note the runner drains at its next provider-call boundary — work already done is kept, not thrown away. Steering is not an authority event: it changes what the task aims at, never what it may do. |
| 5 | **Budget discipline** — "median ask under $0.002 / 6 s"; `atticus.py --budget` | **Shipped** | `pipo budget --days N [--json]` and `GET /api/llm/cost-report` read the local `llm_usage` ledger: calls, tokens (incl. cache), model time, spend split by subsystem and model, and the median ask (latency + tokens over recent non-error chat rows). Prices are deliberately absent — a guessed $ figure is a lie; the reader multiplies by their own rates. Atticus additionally *enforces* budgets in tests; pipo measures and reports, and its zero-LLM fast paths above are the enforcement mechanism for the waiting surfaces. |
| 6 | Model choice (Cheapest / Balanced / Most capable, custom server, Ollama/LM Studio/vLLM) | **Exceeded** | Tier routing (conversation/high/medium/low) with per-call tier escalation, fallback chains, and any OpenAI-compatible server incl. Ollama, Groq, OpenRouter. Multiple machines share one configured daemon. |
| 7 | Safe by default — sandbox, ask-before-destructive, ask log | **Exceeded** | Runtime authority engine: per-category gates with approval cards delivered multi-channel (chat, Telegram, desktop), full audit trail, emergency pause/kill, tamper-checked skills (MAC), sidecar capability scoping. Learned-command replay adds its own fallover rule instead of trusting what was stored. |
| 8 | Remembers you — "remember…", per-person memory | **Exceeded** | Vault knowledge graph (entities, facts, relations) extracted after every response, plus a profile interview. Injected into every turn, machine-independent. |
| 9 | Sees your screen — answer about anything visible | **Exceeded** | Continuous awareness at 5–10 s intervals with hybrid OCR, struggle detection and activity inference — not just on-demand looks. Region capture answers the "what about *this*" question. |
| 10 | Background agents with live chips and restart-on-crash | **Exceeded** | Per-task checkpoints survive daemon restarts; paused/resumable runs with governed tool dispatch; dashboard agents room with full history. Atticus-style "always allow for this task" maps to pipo's session grants. |
| 11 | Named agents — save reusable specialists | **Same shape** | Persistent agents `spawn → assign → status → collect → terminate` with specialist roles; steering (item 4) now covers the mid-flight correction. |
| 12 | Routines — "every weekday at 8, summarize my calendar" | **Exceeded** | The visual workflow engine: multi-step graphs with cron, webhook, screen-event, file, git and email triggers, retry, fallback, self-healing, YAML import/export. A routine is the degenerate case. |
| 13 | **Point & draw on screen** — mark something, or have Atticus annotate it | **Partial** | Pipo answers from region captures and screenshots, and streams screens into the dashboard — but has no annotation overlay that draws boxes/arrows/labels on the desktop. Open gap. |
| 14 | **Meeting Copilot** — live transcripts, recaps, action items | **Gap** | No equivalent surface in pipo today. The awareness pipeline captures screen context, not live-call transcription. |
| 15 | Instant commands — open apps, window layout, music, web search with no AI | **Partial** | Pipo has the same zero-LLM boundary for taught commands (item 1), dictation and watcher verbs; free-form window/music control still routes through the model with fast-path shortcuts on the dashboard. The taught-command path can hold any repetitive ordering, but pipo does not ship a pre-seeded instant-command library. |

## What only pipo does

- **One brain, many machines.** Sidecars are first-class: a 24/7 daemon reaches
  every enrolled machine's windows, clipboard, terminal, filesystem and browser.
  Atticus is one Mac only.
- **Persistent, restartable, governed.** Every tool call runs through the
  authority engine; every run checkpoints and survives both daemon restarts and
  approval pauses mid-batch; every action lands in the audit trail.
- **Visual workflows with 50+ nodes** and natural-language composition,
  multi-trigger, retry/recovery semantics.
- **Goals/OKRs** with an awareness pipeline that advances key results from what
  it sees happening — not just chat.
- **Any provider at any tier per call**, including self-hosted models, with
  fallback chains and usage telemetry per subsystem.
- **A dashboard** — rooms for chat, agents, workflows, usage, authority, goals,
  vault and telemetry, live over WebSocket; pipo's assistant is also reachable
  from Telegram/channels through the same daemons.

## Honest gaps worth knowing

1. **Meeting copilot** (live call transcription/recap) — plannable on top of the
   existing awareness capture, not built.
2. **Draw-on-screen annotation overlay** — the region capture covers "what am
   I looking at", not "show me where".
3. **Dictation clean-up** — inserts verbatim; the rewrite pass ("um" removal,
   "scratch that") is not built.
4. **Coding-agent log watches** — Atticus watches Codex through its private
   log; pipo watches window titles (which "tell me when Codex is done"
   satisfies) and clipboards.
5. **Pre-seeded instant-command library** — pipo learns faster than it ships
   defaults.

## Where the zero-LLM contract lives in the code

- `src/vault/learned-commands.ts` / `src/vault/watchers.ts` — the stores.
- `src/agents/learned-command-decision.ts` — the free/governed policy;
  `src/agents/learned-command-runner.ts` — the executor.
- `src/actions/tools/learned-commands.ts` / `src/actions/tools/watchers.ts` —
  the model-facing tools.
- `src/daemon/watcher-service.ts` / `src/daemon/dictation-service.ts` — the
  daemon services; `src/daemon/index.ts` — pebble fast paths.
- `src/agents/task-manager.ts` `steerTask` + `pollSteer` in
  `src/agents/sub-agent-runner.ts` — steering.
- `src/llm/usage.ts` `getBudgetReport` + `src/cli/budget.ts` — the budget.
