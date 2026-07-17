// Shared model between the server "agent" and the UI. The unit here is a
// *decision*, not a finding — what was decided, why, on what evidence, and how
// confidently. Confidence is what gates whether a decision interrupts the user.

import type { UIMessage } from "ai";

export type DecisionKind =
  | "record-conflict" // two documents disagree; which one governs?
  | "clinical-flag" // a finding that should reach the physician's agenda
  | "safety" // a call the agent refuses to make alone (allergy records etc.)
  | "routine-check"; // a check that ran clean, logged as an auditable receipt

export type DecisionStatus =
  | "auto" // high-confidence, applied without asking
  | "pending" // awaiting a checkpoint resolution
  | "approved" // user agreed with the recommendation
  | "corrected" // user chose a different call
  | "policy-applied" // resolved by a promoted rule from another decision
  | "auto-resolved"; // trust dial let the agent proceed on its own lean

export type Impact = "low" | "med" | "high";

export interface Evidence {
  docId: string; // which chart document (opens in the document panel)
  spanId: string; // the highlighted span inside it
  source: string; // doc title, e.g. "Discharge summary — St. Vincent"
  date: string; // doc date + recency
  snippet: string; // the verbatim quoted span the decision rests on
}

export interface Decision {
  id: string;
  phase: number;
  kind: DecisionKind;
  subject: string; // "Lisinopril 20 mg — conflicting records"
  decided: string; // the call, in one sentence
  rationale: string;
  confidence: number; // 0..1 — gates blocking
  impact: Impact;
  status: DecisionStatus;
  evidence?: Evidence;
}

export interface Policy {
  id: string;
  rule: string; // "Where the med list and discharge summary conflict, the discharge summary governs"
  appliesTo: string; // "Medication reconciliation — this chart"
  count: number; // how many records one decision resolved
  fromCheckpoint: string;
}

export interface Phase {
  index: number;
  name: string;
  note?: string;
}

export type CheckpointType = "decision" | "gate";

/**
 * One answerable choice on a checkpoint. The label states its consequence
 * ("Agree — treat the discharge summary as current"), and the option carries
 * everything choosing it does: the primary decision's new text, an optional
 * promoted rule, and per-dependent ledger patches.
 */
export interface CheckpointOption {
  value: string; // stable key; what Resolution.value carries
  label: string; // consequence-stating button text
  decided?: string; // what the pending decision's `decided` becomes
  policyRule?: string; // if choosing this promotes a standing rule
  dependentPatches?: Record<string, string>; // decision id → new `decided`
}

export interface Checkpoint {
  id: string;
  type: CheckpointType;
  phase: number;
  title: string;
  body: string; // the situation — what the agent saw
  recommendation?: string; // the agent's rec + why, rendered as its own block
  // decision checkpoints:
  decisionId?: string; // the pending decision this resolves
  kind?: DecisionKind;
  options?: CheckpointOption[];
  suggestion?: string; // value of the agent's lean (matches an option.value)
  evidence?: Evidence[]; // up to ~3 document excerpts, rendered evidence-first
  dependsOn?: { decisionId: string; label: string }; // the chain line
  dependents?: string[]; // decision ids a promoted rule resolves
  // gate checkpoints:
  gateStats?: string;
}

export type ResolutionAction =
  | "approve"
  | "correct"
  | "proceed"
  | "stop";

export interface Resolution {
  checkpointId: string;
  action: ResolutionAction;
  value?: string; // the chosen option's value
}

export type TrustDial = "oversight" | "balanced" | "autonomy";

/** One line of the final visit brief, linked back to its decision and source. */
export interface BriefItem {
  rank: number;
  text: string;
  decisionId?: string;
  evidence?: Evidence;
}

export interface DoneData {
  summary: string;
  stats: string;
  brief?: BriefItem[];
}

// --- streamed message parts -------------------------------------------------
export type ReviewDataParts = {
  phase: Phase;
  decision: Decision;
  decisionUpdate: { id: string; patch: Partial<Decision> };
  checkpoint: Checkpoint;
  policy: Policy;
  done: DoneData;
  mode: { mocked: boolean };
};
export type ReviewUIMessage = UIMessage<never, ReviewDataParts>;
