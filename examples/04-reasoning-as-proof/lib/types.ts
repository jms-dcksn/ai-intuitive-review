// Shared schema between the API route and the UI.
//
// Unlike examples 01–03, the interesting channel here needs no custom data part:
// the Vercel AI SDK has a first-class `reasoning` part type, streamed with
// `reasoning-start` / `reasoning-delta` / `reasoning-end` chunks exactly like
// `text-*`. The reasoning trace and the answer therefore arrive as two native
// part types on the same message, and the UI ranks them visually.

import type { UIMessage } from "ai";

/**
 * What only the server knows about the reasoning trace, emitted once at the end
 * of the stream. The client computes duration and word count itself.
 */
export interface ReasoningMeta {
  /** Model that produced the trace (or `recorded-mock`). */
  model: string;
  /**
   * Current Claude models return a *summarized* view of the reasoning, not the
   * raw chain of thought. Surfacing that honestly is part of the pattern —
   * overstating what the trace is would itself be a trust failure.
   */
  summarized: boolean;
  /** True if any reasoning block was withheld by the API (`redacted_thinking`). */
  redacted: boolean;
}

export type ReasonDataParts = {
  /** Transient banner flag: recorded mock vs live model call. */
  mode: { mocked: boolean };
  /** Provenance for the reasoning trace, once the stream finishes. */
  meta: ReasoningMeta;
};

export type ReasonUIMessage = UIMessage<never, ReasonDataParts>;
