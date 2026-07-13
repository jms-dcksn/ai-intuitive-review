"use client";

import { useEffect, useRef, useState } from "react";
import type { ReasoningMeta } from "@/lib/types";

export type ReasoningPhase = "idle" | "thinking" | "answering" | "done";

function words(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

/**
 * The reasoning channel, visually subordinate to the answer by design.
 *
 * While the model thinks, the trace streams live in a clipped, auto-scrolling
 * viewport — a ticker of work, not a document. The moment the answer starts it
 * collapses to a one-line receipt ("Reasoned for 12s · 240 words") that can be
 * reopened. It is always labeled as the model's working, never as fact.
 */
export function ReasoningPane({
  text,
  phase,
  meta,
  durationMs,
}: {
  text: string;
  phase: ReasoningPhase;
  meta: ReasoningMeta | null;
  durationMs: number | null;
}) {
  const [open, setOpen] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);
  const prevPhase = useRef<ReasoningPhase>(phase);

  // Keep the live ticker pinned to the newest line.
  useEffect(() => {
    if (phase === "thinking" && liveRef.current) {
      liveRef.current.scrollTop = liveRef.current.scrollHeight;
    }
  }, [text, phase]);

  // Auto-collapse exactly once, when the answer takes the stage.
  useEffect(() => {
    if (prevPhase.current === "thinking" && phase !== "thinking") {
      setOpen(false);
    }
    prevPhase.current = phase;
  }, [phase]);

  if (phase === "idle") return null;

  // Adaptive thinking may answer easy questions directly. Say so — don't
  // pretend a trace exists.
  if (phase !== "thinking" && !text.trim()) {
    return (
      <div className="reasoning collapsed">
        <span className="reasoning-label">Model reasoning</span>
        <span className="reasoning-summary">
          answered directly — no extended reasoning was needed
        </span>
      </div>
    );
  }

  const provenance = meta
    ? meta.model === "recorded-mock"
      ? "recorded trace"
      : `summarized by the API · ${meta.model}`
    : null;

  if (phase === "thinking") {
    return (
      <div className="reasoning live">
        <div className="reasoning-head">
          <span className="pulse-dot" />
          <span className="reasoning-label">Model reasoning</span>
          <span className="reasoning-summary">
            {text.trim()
              ? `${words(text)} words and counting…`
              : "waiting for the model…"}
          </span>
        </div>
        {text.trim() && (
          <div className="reasoning-live-view" ref={liveRef}>
            <div className="reasoning-text">{text}</div>
          </div>
        )}
        <div className="reasoning-disclaimer">
          The model&rsquo;s private working — deliberation, not verified fact.
        </div>
      </div>
    );
  }

  return (
    <div className={`reasoning ${open ? "expanded" : "collapsed"}`}>
      <button
        className="reasoning-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="reasoning-label">Model reasoning</span>
        <span className="reasoning-summary">
          reasoned{durationMs !== null ? ` for ${seconds(durationMs)}` : ""} ·{" "}
          {words(text)} words
          {provenance ? ` · ${provenance}` : ""}
        </span>
        <span className="reasoning-caret">{open ? "hide working" : "show working"}</span>
      </button>
      {open && (
        <>
          <div className="reasoning-text full">{text}</div>
          {meta?.redacted && (
            <div className="reasoning-disclaimer">
              Part of the reasoning was withheld by the API and is not shown.
            </div>
          )}
          <div className="reasoning-disclaimer">
            The model&rsquo;s private working — deliberation, not verified fact.
            Check the numbers against the documents on the right.
          </div>
        </>
      )}
    </div>
  );
}
