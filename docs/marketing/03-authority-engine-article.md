# Why we built a runtime authority engine for our AI agent

*Full draft — [NAME], [DATE]. Publish on pipo-ke.com/blog and link from the HN launch comment. All technical claims are verifiable in the pipo repo; numbers marked [FILL] must be filled from real data before publishing.*

---

Let me show you the conversation that happens in every company that has tried to deploy an AI agent:

> "It saved our ops team six hours a week."
> "Great. What happens when it emails the wrong client?"
> "..."

That question is not a bug-report. It is the entire procurement process. The current generation of AI agents can read your files, drive your browser, run commands — and every single one of them either says "trust me" or puts the agent inside a sandbox so small it can do nothing worth paying for. That's why agents are everywhere in demos and nowhere in production.

The hard part of an AI agent is not intelligence. It's **permission**.

## Categories, not switches

The first design mistake is treating safety as a boolean: "sandboxed" vs "god mode." Real work has a spectrum. Reading a file is not wiring money. Running `npm test` is not installing software.

Pipo's legal code for its agent is a category map. Every tool the model can call is mapped to one of a fixed set of action categories — read data, write data, control applications, send message, send email, make payment, delete data, modify settings, execute command, install software, terminate agents — and every category owns a policy: allowed by default, approval required, or denied outright.

Two rules make the map safe to maintain:

- **The worst action wins.** A tool with multiple verbs (our agent-management tool has spawn, assign, steer, terminate) is as risky as its riskiest verb, not its most common one. When you add a verb, you re-decide the whole tool. Multiplexer tools are where "we reviewed it in March" goes to die, so the review is automated: a test fails loudly if a registered tool has no reviewed classification.
- **The default is the most conservative class.** A brand-new tool the relevance layer has never seen falls to the safest possible handling. Mis-declaring something can cost tokens; it cannot open a door.

## Approvals are a product, not a prompt

"You're about to email 40 clients, approve?" needs to reach wherever the human actually is at 2pm on a Tuesday. If the approval lives inside the same chat window the agent is running in, you have built a rubber stamp.

So in pipo, an approval is a **card**: a structured summary of exactly what will happen — the action, the category, the target, the cost — that can be pushed into the chat, into Telegram, or onto your desktop, with a deadline. Approve from your phone while in traffic. The agent doesn't die while it waits; the work parks, and on approval it resumes from exactly where it paused, including mid-tool-batch.

Cards default to needing a deliberate click — the only defense against approval fatigue, and the way enterprise software has always handled this. And because every real deployment eventually demands the scoped kind, pipo also supports a **session grant** — "yes, and stop asking me for the rest of this task" — scoped to the task, logged, and expired with it.

## Delegation, bounded

The scariest roadmap item in modern agents was never "the model does the task." It's "the model reorganizes society into sub-models." What stops a spawned sub-agent from doing things the parent was never allowed to do?

In pipo, delegation is only ever tightening. A sub-agent runs under the parent's effective authority profile, minus anything we deliberately withhold; every governed tool call from a delegated worker is checked as the sub-agent against the profile it inherited. The result: you can let the main agent fan work out to five workers, and know that all five workers are collectively less dangerous than the one you approved.

One nuance that took a while to get right: when the person corrects a running task mid-flight ("also check HDMI"), that correction is **steering**, not authority. It changes what the task aims at. It never changes what the task may do. Mixing those two is how shops end up with "just this once" bypasses.

## Untrusted content is data, not orders

An agent that reads web pages, window titles and file paths ingests text written by strangers. Prompt injection is not a bug you patch; it's a consequence of treating text as instructions.

Our stance is structural, not prompt-engineering: tool results that come from outside sources are delimited, defanged and taint-marked before they enter the model's context, perception tools carry their untrusted provenance with them, and output paths (file writes, terminal) are guarded for the classic escapes — we still test the "symlink escapes into `.git`" cases because that's where real damage happens. The relevant test suite is an inverted version of normal security theatre: rather than testing that injection is impossible, we test that even when injection succeeds, the action it asks for must still survive the authority engine.

## The audit trail, and honest accounting

Every decision — pre-approved, allowed, required-a-card, denied, executed, refused — writes a structured audit row: which agent, which tool, which category, which decision, executed or not. This is what gets read out in your next security review, and it's what lets you answer "what has it been doing?" with an export instead of a shrug.

The same discipline applies to money. `pipo budget` reports tokens, calls, latency and median-ask cost per subsystem from the ledger of actual calls. It deliberately does not invent dollar figures — a guessed price is a lie, and tomorrow's rates make today's lie worse. You multiply by your own rates. (The genuinely cheap paths — taught voice commands, "tell me when" watches — are enforced architecturally: they run with zero LLM calls by design, not by prompt discipline.)

## What this unlocks

Here is the business claim, stated plainly:

**The deployment blocker for agents is never "can it do the work?" It's "who says yes?"** — if you can show the approval cards, the audit export, and the stop button, you can pilot.

- **Teams** get an ops assistant they can actually expose to real systems.
- **Security reviewers** get categories and logs, and a tiny surprise surface.
- **Procurement** gets a tollgate that has an answer.
- The answer — *"show me the kill switch and the log, or there is no deal"* — is cheap for pipo. No switch = no sale.

## Honest limitations

Because the last three paragraphs of any article like this are where credibility either exists or doesn't:

1. The category gates are enforced on the model's *choices*, not on platform-level primitives — a determined model that escapes its tool loop would not be stopped by pipo's authority layer alone. [FILL: name the OS-level sandbox work / container isolation you run or plan]
2. Approval fatigue is real. Cards move the rubber-stamping problem; the session-grant rules exist *because* pilots without them failed. [FILL: your auto-approve learning defaults]
3. Steering is voice-first only on the companion surface today; the dashboard path exists, but habit-forming takes weeks.
4. The knowledge vault extraction is automatic, which means it is confidently mediocre at knowing what *you* find important. The profile interview exists to compensate.

The finish line we're building toward is not "an agent you trust." **It's an agent you can *audit*.** Trust is a feeling; audit is a technology. If you're evaluating agents for real work, we built the product around the second.

---

*Pipo is source-available (RSALv2), runs on Bun with SQLite locally or via a hosted brain, and pairs with small sidecars on Windows and Linux so one assistant covers every machine. Try it: [GitHub] · [pipo-ke.com]*
