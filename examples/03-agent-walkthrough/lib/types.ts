// Shared model between the server "agent" and the UI. The unit here is a
// *decision*, not a finding — what was decided, why, on what evidence, and how
// confidently. Confidence is what gates whether a decision interrupts the user.

import type { UIMessage } from "ai";

export type DecisionKind =
  | "scope" // which document/item is operative / in-corpus
  | "interpretation" // how an ambiguous clause was read
  | "assumption" // a gap filled by assumption
  | "extraction" // a value pulled from messy source
  | "classification" // a category / severity / yes-no judgment
  | "prioritization"; // what's material enough to surface

export type DecisionStatus =
  | "auto" // high-confidence, applied without asking
  | "pending" // awaiting a checkpoint resolution
  | "approved" // user approved as-is
  | "corrected" // user changed the value
  | "policy-applied" // resolved by a promoted policy
  | "auto-resolved"; // trust dial let the agent proceed on its own lean

export type Impact = "low" | "med" | "high";

export interface Evidence {
  source: string; // e.g. "Lease #7 — §12.2"
  snippet: string; // the quoted span the decision rests on
}

export interface Decision {
  id: string;
  phase: number;
  kind: DecisionKind;
  subject: string; // "Lease #7 — notice period"
  decided: string; // "read as calendar months"
  rationale: string;
  confidence: number; // 0..1 — gates blocking
  impact: Impact;
  status: DecisionStatus;
  evidence?: Evidence;
  classId?: string; // groups items that share wording (for policy promotion)
}

export interface Policy {
  id: string;
  rule: string; // "Treat 'months' notice as business months"
  appliesTo: string; // "Meridian Estates leases"
  count: number; // how many decisions it resolved at once
  fromCheckpoint: string;
}

export interface Phase {
  index: number;
  name: string;
  note?: string;
}

export type CheckpointType = "decision" | "gate";

export interface Checkpoint {
  id: string;
  type: CheckpointType;
  phase: number;
  title: string;
  body: string;
  // decision checkpoints:
  decisionId?: string; // the pending decision this confirms
  kind?: DecisionKind;
  options?: string[]; // choices, e.g. ["calendar months", "business months"]
  suggestion?: string; // the agent's lean
  evidence?: Evidence;
  classId?: string; // if a whole class can be resolved at once
  dependents?: string[]; // decision ids a policy would resolve
  policyRule?: string; // the rule text if promoted to policy
  // gate checkpoints:
  gateStats?: string; // "27 exitable · 3 not"
}

export type ResolutionAction =
  | "approve"
  | "correct"
  | "policy"
  | "proceed"
  | "stop";

export interface Resolution {
  checkpointId: string;
  action: ResolutionAction;
  value?: string; // corrected value / chosen option
}

export type TrustDial = "oversight" | "balanced" | "autonomy";

// --- streamed message parts -------------------------------------------------
export type LeaseDataParts = {
  phase: Phase;
  decision: Decision;
  decisionUpdate: { id: string; patch: Partial<Decision> };
  checkpoint: Checkpoint;
  policy: Policy;
  done: { summary: string; stats: string };
  mode: { mocked: boolean };
};
export type LeaseUIMessage = UIMessage<never, LeaseDataParts>;
