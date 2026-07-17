"use client";

import type { Checkpoint, Evidence, Resolution } from "@/lib/types";

/**
 * The blocking checkpoint — where trust is actually transacted. Evidence first:
 * the card leads with the verbatim document excerpts the call rests on, then the
 * agent's recommendation and why, then buttons whose labels state their
 * consequence. Nothing downstream proceeds until this returns.
 */
export function CheckpointCard({
  checkpoint,
  disabled,
  onResolve,
  onOpenSource,
}: {
  checkpoint: Checkpoint;
  disabled: boolean;
  onResolve: (r: Resolution) => void;
  onOpenSource: (ev: Evidence) => void;
}) {
  const cp = checkpoint;
  const isSafety = cp.kind === "safety";
  const resolvesMany = cp.dependents?.length ? cp.dependents.length + 1 : 0;

  function choose(value: string) {
    onResolve({
      checkpointId: cp.id,
      action: value === cp.suggestion ? "approve" : "correct",
      value,
    });
  }

  return (
    <div className={`checkpoint ${cp.type} ${isSafety ? "safety" : ""}`}>
      <div className="cp-flag">
        {cp.type === "gate" ? "REVIEW COMPLETE" : isSafety ? "SAFETY — WON'T DECIDE ALONE" : "NEEDS YOUR CALL"}
        {resolvesMany > 0 && <span className="cp-class"> · one call resolves {resolvesMany} records</span>}
      </div>
      <div className="cp-title">{cp.title}</div>
      {cp.dependsOn && <div className="cp-depends">↳ {cp.dependsOn.label}</div>}
      <div className="cp-body">{cp.body}</div>

      {cp.evidence?.map((ev) => (
        <button key={`${ev.docId}:${ev.spanId}`} className="cp-doc" onClick={() => onOpenSource(ev)} title="Open the full document">
          <div className="cp-doc-head">
            <span className="cp-doc-src">{ev.source}</span>
            <span className="cp-doc-date">{ev.date}</span>
            <span className="cp-doc-open">open source ↗</span>
          </div>
          <div className="cp-doc-snip">“{ev.snippet}”</div>
        </button>
      ))}

      {cp.recommendation && (
        <div className="cp-rec">
          <div className="cp-rec-label">{isSafety ? "The agent's position" : "Recommendation"}</div>
          <div>{cp.recommendation}</div>
        </div>
      )}

      <div className="cp-actions">
        {cp.type === "gate" ? (
          <>
            <button className="primary" disabled={disabled} onClick={() => onResolve({ checkpointId: cp.id, action: "proceed" })}>
              Assemble the brief
            </button>
            <button className="ghost" disabled={disabled} onClick={() => onResolve({ checkpointId: cp.id, action: "stop" })}>
              Pause here
            </button>
            {cp.gateStats && <span className="cp-stats">{cp.gateStats}</span>}
          </>
        ) : (
          cp.options?.map((opt) => (
            <button
              key={opt.value}
              className={opt.value === cp.suggestion ? "primary" : "ghost"}
              disabled={disabled}
              onClick={() => choose(opt.value)}
            >
              {opt.label}
              {opt.value === cp.suggestion && <span className="lean"> · agent's lean</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
