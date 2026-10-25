# README hero rewrite (draft)

**Goal:** the first screen answers "what is it", "why should I care", "how do I try it" — in that order. Everything else (Contents, badges-heavy intro, philosophy) moves DOWN, not away.

**How to apply:** replace the block from line 1 through the `> **Project guide:**` line (~line 20–21) with the block below, then move the existing `## ⚡ Quick Start` section (or a trimmed 6-line version of it) to sit immediately after the hero. Current `## Contents` table → delete until the README exceeds ~10 sections; GitHub's auto-outliner is better.

---

```html
<div align="center">

# PIPO

### Your company workflow brain

**An always-on AI assistant that runs real work on your machines — and asks before it acts.**

[![CI](https://github.com/Motius/pipo/actions/workflows/test.yml/badge.svg)](https://github.com/Motius/pipo/actions/workflows/test.yml)
[![Runtime](https://img.shields.io/badge/runtime-Bun-%23f9f1e1)](https://bun.sh)
[![License](https://img.shields.io/badge/license-RSALv2-blue)](LICENSE)
[![Website](https://img.shields.io/static/v1?label=website&message=pipo-ke.com&color=black)](https://pipo-ke.com)

<!-- [GIF] 3–6s: approval card arriving on a phone, tapped, agent resumes.
     This is the single highest-converting asset you can produce. -->

🔐 **Acts only within your authority** — every risky action (email, payments,
deletes, shell, settings) hits an approval card you can answer from chat,
Telegram or your desktop. Every decision lands in an audit trail. Big red
pause button included.

🖥 **One brain, every machine** — small paired sidecars bring each computer's
files, terminal, browser and desktop into the same assistant. Windows and
Linux today.

🔄 **Code for repetition** — visual workflows with cron / webhooks / screen /
file triggers run the boring parts, retry when they fail, and never call the
model when they don't need to. Taught voice phrases replay for free.

🧠 **AI for judgement** — a knowledge vault extracted from every exchange,
continuous screen awareness, and any model you like: Claude, GPT, Gemini, or
fully local via Ollama. `pipo budget` shows what it all actually costs.

</div>

> **Project guide:** installation, operations, security, scaling, verification,
> and release guidance live in [`docs/PIPO_OPERATIONS_GUIDE.md`](docs/PIPO_OPERATIONS_GUIDE.md).

## ⚡ Try it in five minutes

<paste the SHORT version of your existing install: the daemon one-liner,
`pipo start`, one sidecar pairing command, and "then say:
watch for when this build finishes">

[full install options →](#-installation)
```

---

**Additional edits (quick list):**

1. **Move "What Makes pipo Different" to after Quick Start** and cut it to the 4 bullets above — the current paragraphs duplicate what the hero now says.
2. **"Ambient mode" section stays** — it's the differentiator story — but add one GIF of the pebble bubble answering from screen awareness.
3. **Delete marketing-speak adjectives** ("more than a chatbot", "understand context") — the feature names + authority engine say it better, and HN commenters quote README lines back at you.
4. **Add a "Quickstart recorded" 60–90s video link** under Try it (screen recording, no face, captions).
5. Pin an issue titled **"Roadmap"** with 3–4 open items (macOS sidecar, meeting capture, dictation clean-up) — converts roadmap cynicism into follow/watch.
