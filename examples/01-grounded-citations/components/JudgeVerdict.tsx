"use client";

import { useState } from "react";
import type { FaithfulnessSegment, FaithfulnessVerdict } from "@/lib/types";

/**
 * The faithfulness pill, rendered below the answer. Three states: pulsing
 * "Judging…" while the separate judge model runs, then a green/red verdict + score.
 *
 * Click to expand the segments worth a second look — it hides the boring
 * agreements (cited *and* supported) and surfaces the two disagreements between
 * the structural signal and the judge: a **cited** segment the judge won't
 * support (a mis-citation), and an **ungrounded** one the judge *does* (a false
 * alarm). Those same disagreements are marked inline in the answer.
 */
export function JudgeVerdict({
  verdict,
  judging,
}: {
  verdict: FaithfulnessVerdict | null;
  judging: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (judging) {
    return (
      <div className="judge">
        <span className="judge-pill judging">
          <span className="judge-dot" />
          Judging faithfulness…
        </span>
      </div>
    );
  }

  if (!verdict) return null;

  const pass = verdict.verdict === "pass";
  const interesting = verdict.segments.filter(isInteresting);
  const reconciliations = verdict.segments.filter(isReconciliation).length;

  return (
    <div className="judge">
      <button
        className={`judge-pill ${pass ? "pass" : "fail"}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="judge-mark">{pass ? "✓" : "✗"}</span>
        <span className="judge-label">{pass ? "Faithful" : "Unfaithful"}</span>
        <span className="judge-score">{verdict.score}/100</span>
        {reconciliations > 0 && (
          <span className="judge-count">
            {reconciliations} reconciliation{reconciliations === 1 ? "" : "s"}
          </span>
        )}
        <span className="judge-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="judge-detail">
          <div className="judge-meta">
            Graded by <code>{verdict.model}</code> against the full source
            documents.
            {interesting.length === 0 &&
              " Every cited segment is supported and nothing uncited slipped through — structure and judge agree."}
          </div>
          {interesting.length > 0 && (
            <ul className="judge-claims">
              {interesting.map((s) => (
                <li key={s.index} className={`claim ${reconClass(s)}`}>
                  <span className="claim-status">{reconLabel(s)}</span>
                  <span className="claim-text">
                    &ldquo;{s.text}&rdquo;
                    <span className="claim-rationale">
                      {s.rationale}
                      {s.docId ? ` (${s.docId})` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const isSupported = (s: FaithfulnessSegment) => s.status === "supported";

/** A structural signal and the judge disagreeing about this segment. */
const isReconciliation = (s: FaithfulnessSegment) => s.cited !== isSupported(s);

/** Worth showing in the expanded list: any disagreement, or any unsupported run. */
const isInteresting = (s: FaithfulnessSegment) =>
  isReconciliation(s) || !isSupported(s);

function reconLabel(s: FaithfulnessSegment): string {
  if (s.cited && !isSupported(s)) return `cited · ${s.status}`;
  if (!s.cited && isSupported(s)) return "uncited · verified";
  return s.status; // ungrounded and unsupported — structure and judge agree
}

function reconClass(s: FaithfulnessSegment): string {
  if (!s.cited && isSupported(s)) return "verified";
  return "flagged";
}
