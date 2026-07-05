import { z } from "zod";

// The tiered report the agent must emit. The *shape itself* is the progressive-
// disclosure design: three nested levels the UI reveals one at a time.
//
//   Tier 0  verdict + recommendation + confidence   (always visible)
//   Tier 1  findings[]: title + severity + summary   (collapsed cards)
//   Tier 2  finding.detail                           (revealed on expand)
//   Tier 3  finding.evidence[]: the raw backing data (revealed one level deeper)
//
// The model's job is to *tier* the information. The UI's job is to reveal it
// lazily. Streaming fills the tree top-down; disclosure lets the user choose depth.

export const severity = z.enum(["positive", "caution", "critical"]);
export type Severity = z.infer<typeof severity>;

export const evidenceSchema = z.object({
  label: z.string().describe("Short name of the evidence, e.g. 'SOC 2 Type II report'"),
  detail: z.string().describe("The raw finding text, quoted or closely paraphrased from the source material"),
  source: z.string().optional().describe("Where it came from, e.g. a document name or section"),
});

export const findingSchema = z.object({
  title: z.string().describe("One-line finding, scannable on its own"),
  severity: severity.describe("positive = strength, caution = watch-item, critical = blocker"),
  summary: z.string().describe("One sentence a busy reviewer can read without expanding"),
  detail: z.string().describe("A short paragraph of deeper explanation, shown when expanded"),
  evidence: z.array(evidenceSchema).describe("The raw data backing this finding, shown one level deeper"),
});
export type Finding = z.infer<typeof findingSchema>;

export const reportSchema = z.object({
  verdict: z.string().describe("One-line headline recommendation"),
  recommendation: z.enum(["approve", "approve-with-conditions", "reject"]),
  confidence: z.enum(["high", "medium", "low"]),
  findings: z.array(findingSchema).describe("Ordered most-decision-relevant first"),
});
export type Report = z.infer<typeof reportSchema>;
