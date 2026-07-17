// Shared schema between the recorded findings, the API route, and the UI.

import type { UIMessage } from "ai";

export type FindingCategory =
  | "risk-factor"
  | "competitive"
  | "financial-impact"
  | "strategy";

export type FindingSeverity = "high" | "medium" | "low";

/**
 * A verbatim span from the filing. `text` is the Citations API's `cited_text`
 * and is the client-side anchor (resolved to a DOM Range by whitespace-
 * insensitive search); the char offsets are against the extracted text and are
 * used for ordering and section labels, not for anchoring.
 */
export interface FindingQuote {
  text: string;
  charStart: number;
  charEnd: number;
  /** e.g. "Item 1A · Risk Factors" — from the section-offset map. */
  section: string;
}

export interface Finding {
  id: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  summary: string;
  quotes: FindingQuote[];
}

export type AttributionDataParts = {
  /** Transient banner flag: this is a recorded analysis run being replayed. */
  mode: { recorded: boolean; model: string; document: string };
  /** One part per finding, streamed in document order. */
  finding: Finding;
};

export type AttributionUIMessage = UIMessage<never, AttributionDataParts>;

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  "risk-factor": "Risk factor",
  competitive: "Competitive",
  "financial-impact": "Financial impact",
  strategy: "Strategy",
};
