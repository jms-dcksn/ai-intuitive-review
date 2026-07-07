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
  scope: "scope",
  interpretation: "interpretation",
  assumption: "assumption",
  extraction: "extraction",
  classification: "classification",
  prioritization: "prioritization",
};

export function KindTag({ kind }: { kind: DecisionKind }) {
  return <span className="kind">{KIND_LABEL[kind]}</span>;
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
  auto: "auto",
  pending: "awaiting you",
  approved: "approved",
  corrected: "corrected",
  "policy-applied": "policy",
  "auto-resolved": "auto-resolved",
};

export function StatusChip({ status }: { status: DecisionStatus }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>;
}
