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
};
export type ReviewUIMessage = UIMessage<never, ReviewDataParts>;
