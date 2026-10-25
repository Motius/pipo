# Show HN Launch Kit

**Publish order:** submit Tuesday–Thursday, 7–10am US-East. Have the repo/HN tab open 48h and answer everything. Post nothing else (X, Reddit) that week. **You post the first comment below immediately after submitting** — from your normal account, as the author.

## Title — pick ONE

1. **Recommended:** `Show HN: Pipo – a self-hosted AI workflow daemon with runtime approval controls`
2. `Show HN: Pipo – an AI agent for your machines that asks before it acts`
3. `Show HN: Pipo – run AI agents on every computer you own, with an audit trail`

(#1 leads with the enterprise wedge; #2 reads best to humans; #3 leans on the sidecar story. Do not use "AI assistant" — it puts you in the chatbot pile.)

## The launch comment (post as `throwaway`-style first comment from your main account)

> Hi HN — I'm [NAME]. Pipo is an always-on AI assistant for the computers you already use. It runs as a daemon, you talk to it from a dashboard, Telegram, or a voice bubble, and it can sit in front of your file system, terminal, browser and desktop — across all of them, via small paired "sidecar" agents.
>
> The part we spent most of our time on is not the model integration — it's the permission layer. An agent that can run commands and touch files is only shippable at work if it is shippable at work, so every risky pipo action is routed through a runtime authority engine:
>
> - Actions are mapped to categories (read data, write data, run command, send email, make payment, delete, change settings…), and each category has its own gate.
> - Anything gated returns an approval **card** you can push to chat, Telegram or your desktop — approve there, the task resumes where it paused. Or grant "allow for this task" and move on.
> - Every decision — allowed, denied, executed or not — lands in a machine-readable audit trail. `pipo budget` reports real token/time spend per subsystem instead of inventing dollar figures.
> - Delegated sub-agents can never exceed the parent's authority, and they can be steered mid-run (a note is folded into the running task — no restart, no kill).
>
> Beyond chat: a visual workflow engine (cron/webhook/screen/file triggers, retry, self-healing), a knowledge vault that is extracted from every exchange, continuous screen awareness, and model of your choice — cloud tiers or fully local via Ollama. New this month: learned voice commands that replay with zero LLM calls, and cheap "tell me when the build finishes" watchers that poll a window title or clipboard for free.
>
> Stack: Bun/TypeScript daemon, SQLite, a Go sidecar for desktop control (Win32 UIA / X11), a Next.js dashboard. Source-available, RSALv2 — free to run for any purpose; if you offer your modified version to others, share your changes.
>
> Honest limits: sidecars are Windows and Linux today (no macOS yet); the voice pebble is its own companion surface and the dictation/clean-up pass is verbatim-only; there is no meeting-copilot equivalent of tools like [X].
>
> Repo: [GITHUB-URL] · Site: https://pipo-ke.com · Quickstart: `pipo start` → dashboard → pair a sidecar.
>
> Happy to go deep on the authority design, the sidecar protocol, or why we think "asks before it acts" is the only way this class of tool gets deployed.

## Reply prep — the questions you WILL get

| They ask | You answer (short, warm, factual) |
|---|---|
| "How is this not just Open Interpreter?" | OI is a great REPL for one machine. Pipo is a 24/7 system: persistent memory, workflows on triggers, approval delivery to a phone, sidecars for many machines, spend telemetry. Different shelf. |
| "Why not n8n?" | n8n automates known steps. Pipo handles judgement inside the loop AND executes those steps, with the same authority controls across both. They compose. |
| "SQLite? really?" | Yes — single-file ops, export/restore built in, and every install we run is one brain per team, not a multi-tenant fleet. For hosted, we snapshot to durable storage. [FILL if you run Postgres anywhere] |
| "Is RSALv2 open source?" | Source-available OSI-wise? No. Free for any use including internal business use? Yes, explicitly. We chose source-available because [FILL]. |
| "What if it deletes something?" | Delete/modify-settings categories are the hardest gates: default to approval cards, never silently allowed; full audit row either way. Emergency pause stops everything mid-batch. |
| "Windows-only desktop control?" | Windows + Linux today; macOS sidecar is the next platform target [FILL status honestly]. |
| "Show me it's actually used" | The best answer is numbers from your own install: `pipo budget --days 30` screenshots, workflow counts, watcher counts. Have them ready before launch. |

## Before you submit — checklist

- [ ] Hero GIF is the FIRST thing on README (see `02-readme-hero.md`)
- [ ] Quickstart verified **today** on a clean machine, commands copy-pasted
- [ ] `pipo budget` output screenshot ready (launch week is where the honesty line goes viral)
- [ ] Discord/Telegram invite link live, someone staffed to answer
- [ ] LICENSE and README licensing line consistent
- [ ] Demo credentials/tour if you show the dashboard (a fake tenant, clearly labeled)
