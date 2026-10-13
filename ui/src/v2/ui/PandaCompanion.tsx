import React from "react";
import "./PandaCompanion.css";

export type PandaCompanionState = "idle" | "listening" | "thinking" | "speaking" | "awaiting-approval" | "muted";

export function PandaCompanion({
  state = "idle",
  size = 88,
  label = "Pipo panda companion",
}: {
  state?: PandaCompanionState;
  size?: number;
  label?: string;
}) {
  return (
    <span
      className={`pipo-panda pipo-panda--${state}`}
      style={{ "--panda-size": `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={label}
    >
      <span className="pipo-panda__halo" aria-hidden="true" />
      <span className="pipo-panda__ear pipo-panda__ear--left" aria-hidden="true" />
      <span className="pipo-panda__ear pipo-panda__ear--right" aria-hidden="true" />
      <span className="pipo-panda__head" aria-hidden="true">
        <span className="pipo-panda__patch pipo-panda__patch--left" />
        <span className="pipo-panda__patch pipo-panda__patch--right" />
        <span className="pipo-panda__eye pipo-panda__eye--left" />
        <span className="pipo-panda__eye pipo-panda__eye--right" />
        <span className="pipo-panda__muzzle"><i /><b /></span>
        <span className="pipo-panda__shine" />
      </span>
      <span className="pipo-panda__signal" aria-hidden="true" />
    </span>
  );
}
