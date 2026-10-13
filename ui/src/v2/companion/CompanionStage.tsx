import React, { useState } from "react";
import type { VoiceState } from "../shell/VoiceRail";
import { PandaCompanion } from "../ui/PandaCompanion";
import "./CompanionStage.css";

export function CompanionStage({
  state,
  connected,
  onTalk,
  onOpenTaskView,
  onSubmit,
}: {
  state: VoiceState;
  connected: boolean;
  onTalk: () => void;
  onOpenTaskView: () => void;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    onSubmit(value);
    setDraft("");
  };
  const status = state === "idle" ? "Ready when you are" : state === "awaiting-approval" ? "Waiting for your permission" : state[0]!.toUpperCase() + state.slice(1);

  return (
    <section className={`pipo-stage pipo-stage--${state}`} aria-label="Pipo companion stage">
      <div className="pipo-stage__grain" aria-hidden="true" />
      <header className="pipo-stage__topbar">
        <div className="pipo-stage__brand"><span className="pipo-stage__mark"><span /></span><span>PIPO</span></div>
        <span className="pipo-stage__mode">COMPANION MODE <i data-live={connected} /></span>
        <button className="pipo-stage__task-link" type="button" onClick={onOpenTaskView}>Open task view <span>↗</span></button>
      </header>

      <div className="pipo-stage__scene">
        <div className="pipo-stage__copy">
          <span className="pipo-stage__eyebrow">Pipo · your second mind</span>
          <h1>Good to see you.<br /><em>What are we solving?</em></h1>
          <p>I can listen, reason, and take care of the repetitive parts while you stay in control of the decisions that matter.</p>
          <div className="pipo-stage__status"><span className="pipo-stage__status-dot" />{status}</div>
        </div>

        <div className="pipo-stage__figure-wrap">
          <div className="pipo-stage__aura" aria-hidden="true" />
          <div className="pipo-stage__figure" data-state={state}>
            <img src="/assets/pipo-companion-reference.png" alt="Pipo humanoid companion" />
            <div className="pipo-stage__figure-glass" aria-hidden="true" />
            <div className="pipo-stage__figure-panda" aria-hidden="true"><PandaCompanion state={state} size={64} /></div>
          </div>
          <div className="pipo-stage__voice-ring" aria-hidden="true" />
        </div>
      </div>

      <div className="pipo-stage__dock">
        <button className="pipo-stage__talk" type="button" onClick={onTalk} aria-label={state === "listening" ? "Stop listening" : "Talk to Pipo"}>
          <span className="pipo-stage__mic-dot">{state === "listening" ? "■" : "◉"}</span>
          <span>{state === "listening" ? "Listening" : "Talk to Pipo"}</span>
          <kbd>Space</kbd>
        </button>
        <div className="pipo-stage__input-wrap">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Say something to Pipo…" aria-label="Message Pipo" />
          <button type="button" onClick={submit} disabled={!draft.trim()} aria-label="Send message">↑</button>
        </div>
        <div className="pipo-stage__hint">Your screen stays private until you connect a sidecar.</div>
      </div>
    </section>
  );
}
