// Shared model between the server "agent" and the UI. The unit here is an
// *action* — a tool the agent used or wants to use. Read tools auto-run and
// land in the feed as receipts; write tools stop the run and become an
// ApprovalRequest. Nothing external happens without a Resolution.

import type { UIMessage } from "ai";

export type ToolRisk = "read" | "write";

/** What kind of damage a write tool can do — drives the card's severity styling. */
export type WriteClass =
  | "money" // moves real money (refunds)
  | "external" // leaves the building (email to the customer)
  | "internal"; // changes internal systems (tickets, notes)

/** One argument the model chose, rendered as a labeled row the human can edit. */
export interface ActionArgField {
  key: string; // the tool argument name
  label: string; // human label ("Amount (USD)")
  value: string;
  editable?: boolean;
  multiline?: boolean; // email bodies get a textarea
}

export type ActionStatus =
  | "running" // read tool in flight
  | "ok" // read tool done — an auto-executed receipt
  | "awaiting" // write proposed; the approval card is open
  | "executed" // write ran, after (and only after) approval
  | "rejected"; // user refused; the tool never fired

export interface ActionEvent {
  id: string;
  tool: string; // tool name, e.g. "issue_refund"
  risk: ToolRisk;
  title: string; // "Pulled the billing history"
  detail?: string; // one-line result or status note
  args?: ActionArgField[]; // shown on write rows (post-edit values)
  receipt?: string; // execution receipt: "RF-2209 · $49.00 to Visa •4242"
  edited?: boolean; // the human changed the args before approving
  status: ActionStatus;
}

/** The blocking card: the proposed action, its args, and what it will do. */
export interface ApprovalRequest {
  id: string;
  actionId: string; // the feed row this resolves
  tool: string;
  klass: WriteClass;
  title: string; // "The agent wants to issue a refund"
  rationale: string; // why it chose this action
  willDo: string[]; // plain-language consequences
  reversible: boolean;
  args: ActionArgField[];
  approveLabel: string; // consequence-stating button text
}

export interface Resolution {
  approvalId: string;
  action: "approve" | "reject";
  editedArgs?: Record<string, string>; // key → new value (approve only)
  reason?: string; // reject: goes back to the agent verbatim
}

/** A short narration line — what the agent is doing between tool calls. */
export interface StepNote {
  id: string;
  text: string;
}

export interface DoneData {
  summary: string;
  stats: string;
}

// --- streamed message parts -------------------------------------------------
export type ApprovalDataParts = {
  step: StepNote;
  action: ActionEvent;
  actionUpdate: { id: string; patch: Partial<ActionEvent> };
  approval: ApprovalRequest;
  done: DoneData;
  mode: { mocked: boolean };
};
export type ApprovalUIMessage = UIMessage<never, ApprovalDataParts>;
