"use client";

import { useState } from "react";
import type { Decision } from "@/lib/types";
import { ConfidenceBadge, KindTag, StatusChip } from "./atoms";

/**
 * One decision. Auto/receipt rows are quiet; anything awaiting the user glows.
 * The evidence is one click away — the point is that "trust" means *able to
 * check*, not *must check*.
 */
function DecisionReceipt({ decision }: { decision: Decision }) {
  const [open, setOpen] = useState(false);
  const d = decision;
  return (
    <div className={`receipt ${d.status}`}>
      <div className="receipt-main">
        <div className="receipt-head">
          <KindTag kind={d.kind} />
          <span className="subject">{d.subject}</span>
          <span className="spacer" />
          <ConfidenceBadge value={d.confidence} />
          <StatusChip status={d.status} />
        </div>
        <div className="decided">{d.decided}</div>
        {d.evidence && (
          <button className="peek" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Evidence"} · {d.evidence.source}
          </button>
        )}
        {open && d.evidence && (
          <div className="evidence">
            <div className="evidence-snippet">{d.evidence.snippet}</div>
            {d.rationale && <div className="rationale">{d.rationale}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function DecisionLedger({ decisions }: { decisions: Decision[] }) {
  const [filter, setFilter] = useState<"all" | "surfaced">("all");

  // "surfaced" = the decisions that ever needed you, so you can audit just those.
  const shown =
    filter === "all"
      ? decisions
      : decisions.filter((d) =>
          ["pending", "approved", "corrected", "policy-applied"].includes(d.status),
        );

  return (
    <div className="ledger">
      <div className="ledger-head">
        <span className="ledger-title">Decision ledger</span>
        <span className="ledger-count">{decisions.length} decisions</span>
        <span className="spacer" />
        <div className="seg small">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            All
          </button>
          <button
            className={filter === "surfaced" ? "on" : ""}
            onClick={() => setFilter("surfaced")}
          >
            Needed you
          </button>
        </div>
      </div>
      {shown.map((d) => (
        <DecisionReceipt key={d.id} decision={d} />
      ))}
      {shown.length === 0 && <div className="empty">No decisions yet.</div>}
    </div>
  );
}
