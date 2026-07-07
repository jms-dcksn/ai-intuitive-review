"use client";

import { useState } from "react";
import type { Checkpoint, Resolution } from "@/lib/types";

/**
 * The blocking checkpoint. This is where trust is actually transacted: the agent
 * shows one consequential decision, its evidence, and its lean — and the user
 * approves, corrects, or (for a class) sets a policy that resolves many at once.
 * Nothing downstream proceeds until this returns.
 */
export function CheckpointCard({
  checkpoint,
  disabled,
  onResolve,
}: {
  checkpoint: Checkpoint;
  disabled: boolean;
  onResolve: (r: Resolution) => void;
}) {
  const cp = checkpoint;
  const [figure, setFigure] = useState("");

  const isClass = Boolean(cp.dependents && cp.dependents.length);

  function choose(option: string) {
    if (isClass) {
      onResolve({ checkpointId: cp.id, action: "policy", value: option });
    } else if (option === cp.suggestion) {
      onResolve({ checkpointId: cp.id, action: "approve", value: option });
    } else {
      onResolve({ checkpointId: cp.id, action: "correct", value: option });
    }
  }

  return (
    <div className={`checkpoint ${cp.type}`}>
      <div className="cp-flag">
        {cp.type === "gate" ? "PHASE GATE" : "NEEDS YOUR CALL"}
        {isClass && <span className="cp-class">· resolves {cp.dependents!.length} at once</span>}
      </div>
      <div className="cp-title">{cp.title}</div>
      <div className="cp-body">{cp.body}</div>

      {cp.evidence && (
        <div className="cp-evidence">
          <div className="cp-evidence-src">{cp.evidence.source}</div>
          <div className="cp-evidence-snip">{cp.evidence.snippet}</div>
        </div>
      )}

      <div className="cp-actions">
        {cp.type === "gate" ? (
          <>
            <button className="primary" disabled={disabled} onClick={() => onResolve({ checkpointId: cp.id, action: "proceed" })}>
              Proceed
            </button>
            <button className="ghost" disabled={disabled} onClick={() => onResolve({ checkpointId: cp.id, action: "stop" })}>
              Pause here
            </button>
            {cp.gateStats && <span className="cp-stats">{cp.gateStats}</span>}
          </>
        ) : cp.options && cp.options.length ? (
          cp.options.map((opt) => (
            <button
              key={opt}
              className={opt === cp.suggestion ? "primary" : "ghost"}
              disabled={disabled}
              onClick={() => choose(opt)}
            >
              {opt}
              {opt === cp.suggestion && <span className="lean"> · agent's lean</span>}
            </button>
          ))
        ) : (
          // Extraction with no options: the user must supply the value.
          <form
            className="cp-input"
            onSubmit={(e) => {
              e.preventDefault();
              if (figure.trim())
                onResolve({ checkpointId: cp.id, action: "correct", value: `fit-out balance ${figure.trim()}` });
            }}
          >
            <input
              value={figure}
              onChange={(e) => setFigure(e.target.value)}
              placeholder="e.g. $142,000"
              disabled={disabled}
            />
            <button className="primary" type="submit" disabled={disabled || !figure.trim()}>
              Supply figure
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
