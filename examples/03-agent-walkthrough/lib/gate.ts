import type { Decision, Impact, TrustDial } from "./types";

// How aggressively a decision wants to interrupt, independent of the dial. The
// mock hardcodes this per scripted event; the live agent *derives* it from the
// model's own confidence + impact (see `levelFor`). Either way it feeds the one
// gate function below, which the trust dial then filters.
export type BlockLevel =
  | "always" // blocks at every dial setting (gates, and things a human MUST decide)
  | "gated" // blocks unless the dial is at full autonomy
  | "oversight"; // blocks only at the most cautious dial setting

/**
 * The trust dial in one function: given how badly a decision wants to interrupt
 * (`level`) and where the user set the dial, should the run stop and ask?
 *
 * This is kept **verbatim** between the choreographed mock and the live agent —
 * the gate logic is the product decision, and it shouldn't drift between the two.
 */
export function shouldBlock(level: BlockLevel, dial: TrustDial): boolean {
  if (level === "always") return true;
  if (level === "gated") return dial !== "autonomy";
  return dial === "oversight"; // level === "oversight"
}

/**
 * Confidence-gating for the live agent: turn the model's self-scored confidence
 * and impact into a `BlockLevel`. This is the honest version of what the mock
 * stages by hand — "surface the uncertain or high-impact calls" expressed as a
 * rubric over the model's own numbers.
 *
 *   • Barely-confident at any impact, or a genuine can't-read → `always`.
 *   • Shaky, or high-impact-and-not-certain → `gated` (the default blockers).
 *   • Mild doubt on a mid-impact call → `oversight` (only the cautious dial asks).
 *   • Otherwise it streams as a silent receipt.
 */
export function levelFor(d: Pick<Decision, "confidence" | "impact">): BlockLevel | null {
  const impactRank: Record<Impact, number> = { low: 0, med: 1, high: 2 };
  const rank = impactRank[d.impact];

  if (d.confidence < 0.35) return "always"; // the agent cannot responsibly proceed
  if (d.confidence < 0.75) return "gated"; // real ambiguity
  if (rank === 2 && d.confidence < 0.9) return "gated"; // high stakes, not certain
  if (d.confidence < 0.9 && rank >= 1) return "oversight"; // mild doubt, some stakes
  return null; // confident enough to auto-record
}
