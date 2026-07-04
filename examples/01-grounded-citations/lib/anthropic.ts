import Anthropic from "@anthropic-ai/sdk";
import type { SourceDoc } from "./types";
import type { SegmentWriter } from "./segment-writer";

const MODEL = process.env.CITATIONS_MODEL || "claude-sonnet-5";

const SYSTEM = [
  "You answer questions strictly from the provided documents.",
  "Ground every factual claim in a citation. If the documents do not contain the",
  "answer, say so plainly rather than guessing. Prefer authoritative policy/terms",
  "documents over informal notes, drafts, or unsent messages.",
].join(" ");

/**
 * Stream a grounded answer over `docs` into `out`. Uses the Anthropic **Citations
 * API** with **streaming**: text arrives as `text_delta` events and grounded
 * spans arrive as `citations_delta` events, each carrying an API-computed
 * character range against the exact document text we sent.
 *
 * We deliberately keep the grounded call on the Anthropic SDK — its streaming
 * `citations_delta` shape is stable and the char offsets are the whole point —
 * and hand each event to the {@link SegmentWriter}, which re-emits them as Vercel
 * AI SDK message parts. So the transport/UI is AI SDK; the grounding is native.
 */
export async function streamGroundedAnswer(
  out: SegmentWriter,
  question: string,
  docs: SourceDoc[],
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          ...docs.map((doc) => ({
            type: "document" as const,
            source: {
              type: "text" as const,
              media_type: "text/plain" as const,
              data: doc.text,
            },
            title: doc.title,
            citations: { enabled: true },
          })),
          { type: "text" as const, text: question },
        ],
      },
    ],
  });

  for await (const event of stream) {
    if (event.type !== "content_block_delta") continue;
    const delta = event.delta;

    if (delta.type === "text_delta") {
      out.text(delta.text);
    } else if (delta.type === "citations_delta") {
      const c = delta.citation;
      // We only send text documents, so we expect char_location citations.
      if (c.type !== "char_location") continue;
      const doc = docs[c.document_index];
      out.citation({
        docId: doc?.id ?? "unknown",
        docTitle: doc?.title ?? c.document_title ?? "Unknown source",
        citedText: c.cited_text ?? "",
        startChar: c.start_char_index ?? 0,
        endChar: c.end_char_index ?? 0,
      });
    }
  }

  out.end();
}
