"use client";

import type { DecisionKind, DecisionStatus } from "@/lib/types";

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tier = value >= 0.85 ? "hi" : value >= 0.6 ? "mid" : "lo";
  return (
    <span className={`conf ${tier}`} title="Agent's self-assessed confidence">
      {pct}%
    </span>
  );
}

const KIND_LABEL: Record<DecisionKind, string> = {
  "record-conflict": "record conflict",
  "clinical-flag": "clinical flag",
  safety: "safety",
  "routine-check": "routine check",
};

export function KindTag({ kind }: { kind: DecisionKind }) {
  return <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>;
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
  auto: "auto",
  pending: "awaiting you",
  approved: "you agreed",
  corrected: "you overruled",
  "policy-applied": "by your rule",
  "auto-resolved": "auto-resolved",
};

export function StatusChip({ status }: { status: DecisionStatus }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>;
}
