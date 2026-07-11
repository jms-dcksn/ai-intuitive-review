// Shared schema between the API route and the UI.
//
// These are intentionally small and flat. The Anthropic Citations API returns a
// richer shape; the streaming layer (lib/anthropic.ts + lib/segment-writer.ts)
// narrows it to exactly this so the UI never sees provider-specific block types.

/** A source document the model was allowed to cite. */
export interface SourceDoc {
  id: string;
  title: string;
  text: string;
}

/**
 * One grounded citation: a character span in a specific source document, plus
 * the exact text the model quoted. `startChar`/`endChar` come from the API, not
 * from the model's prose — that is what makes them trustworthy to render.
 */
export interface Citation {
  /** Global 1-based number shown in the UI, e.g. the `1` in `[1]`. */
  n: number;
  docId: string;
  docTitle: string;
  citedText: string;
  startChar: number;
  endChar: number;
}

// --- Faithfulness judge -----------------------------------------------------
//
// A separate model reads the finished answer and the *full* source docs and
// returns a per-claim faithfulness verdict. This is the semantic layer the
// structural signals (citations, `ungrounded`) can't reach: it says whether a
// claim is actually true to the docs, regardless of whether it was cited.

export type ClaimStatus = "supported" | "unsupported" | "contradicted";

/**
 * One reviewable unit of the answer — a text run between citations, i.e. exactly
 * the granularity the `ungrounded` flag is computed over. The judge scores these
 * so its verdicts align 1:1 with the rendered answer, which is what lets the UI
 * reconcile them against the structural signal inline.
 */
export interface AnswerSegment {
  text: string;
  /** The grounded citations the model attached to this run (empty ⇒ ungrounded). */
  cites: Citation[];
}

/** The judge's faithfulness verdict for one rendered answer segment. */
export interface FaithfulnessSegment {
  /** 0-based index into the answer's text runs, in render order. */
  index: number;
  /** The segment text, stamped server-side so the pill can quote it. */
  text: string;
  /** Structural signal: did the model cite a source for this run? */
  cited: boolean;
  status: ClaimStatus;
  /** One line: why the judge landed on this status. */
  rationale: string;
  /** The source that supports/contradicts it, if any. */
  docId?: string;
}

/** The judge's overall verdict for one answer. */
export interface FaithfulnessVerdict {
  /** `fail` if any segment is unsupported or contradicted, else `pass`. */
  verdict: "pass" | "fail";
  /** Holistic 0–100 faithfulness score, shown for texture. */
  score: number;
  segments: FaithfulnessSegment[];
  /** Judge model id, surfaced in the UI so it's clear a *different* model graded. */
  model: string;
}

// --- Vercel AI SDK streaming ------------------------------------------------
//
// The typed UI message for this example. The answer streams as ordinary `text`
// parts; each grounded citation streams as a typed custom **data part**
// (`data-citation`) carrying a full {@link Citation}. Typing `useChat` with this
// gives `part.type === "data-citation"` a `part.data: Citation` on the client.

import type { UIMessage } from "ai";

export type ReviewDataParts = {
  citation: Citation;
  /** Transient banner flag: is this the recorded mock, or a live grounded call? */
  mode: { mocked: boolean };
  /** The faithfulness verdict, emitted once after the answer finishes streaming. */
  judge: FaithfulnessVerdict;
};
export type ReviewUIMessage = UIMessage<never, ReviewDataParts>;
