// Shared schema between the API route and the UI.
//
// These are intentionally small and flat. The Anthropic Citations API returns
// a richer shape; the route (lib/anthropic.ts) narrows it to exactly this so the
// UI never has to know about provider-specific block types.

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

/**
 * One block of the answer. A block is either grounded (has >=1 citation) or not.
 * Ungrounded blocks are flagged in the UI so the user can see what the model
 * asserted *without* a source.
 */
export interface AnswerBlock {
  text: string;
  citations: Citation[];
}

export interface AskResponse {
  blocks: AnswerBlock[];
  /** Flattened, de-duplicated citations in first-appearance order. */
  citations: Citation[];
}
