"use client";

import { useState } from "react";
import type { DeepPartial } from "ai";
import type { Finding } from "@/lib/schema";

type PartialFinding = DeepPartial<Finding>;

/**
 * One finding, disclosed in tiers:
 *   tier 1  the always-visible header (title + severity + one-line summary)
 *   tier 2  `detail`, revealed when the card is expanded
 *   tier 3  `evidence`, revealed one level deeper behind its own toggle
 *
 * Two independent reveal controls (expand, then show-evidence) are the point:
 * depth is opt-in, so the default view stays scannable no matter how much the
 * model produced. The card renders whatever has streamed in so far and shows a
 * shimmer where a not-yet-arrived field will land.
 */
export function FindingCard({
  finding,
  streaming,
}: {
  finding: PartialFinding;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  const severity = finding.severity ?? "caution";
  const hasDetail = typeof finding.detail === "string" && finding.detail.length > 0;
  const evidence = finding.evidence ?? [];

  return (
    <div className={`card ${severity}${open ? " open" : ""}`}>
      <button
        className="card-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chevron" aria-hidden>
          ▶
        </span>
        <span className="card-heading">
          <div className="card-title">
            {finding.title ?? <span className="skeleton" />}
          </div>
          <div className="card-sub">
            {finding.summary ?? (streaming ? <span className="skeleton" /> : null)}
          </div>
        </span>
        <span className={`sev ${severity}`}>{severity}</span>
      </button>

      {open && (
        <div className="card-body">
          <p className="detail">
            {hasDetail ? (
              finding.detail
            ) : streaming ? (
              <span className="skeleton" style={{ width: "80%" }} />
            ) : (
              <em className="card-sub">No further detail.</em>
            )}
          </p>

          {evidence.length > 0 && (
            <>
              <button
                className="evidence-toggle"
                aria-expanded={showEvidence}
                onClick={() => setShowEvidence((v) => !v)}
              >
                {showEvidence ? "Hide" : "Show"} evidence ({evidence.length})
              </button>
              {showEvidence && (
                <div className="evidence">
                  {evidence.map((e, i) => (
                    <div className="evidence-item" key={i}>
                      {e?.label && <div className="evidence-label">{e.label}</div>}
                      <div className="evidence-detail">{e?.detail}</div>
                      {e?.source && (
                        <div className="evidence-source">↳ {e.source}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
