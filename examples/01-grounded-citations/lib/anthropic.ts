import Anthropic from "@anthropic-ai/sdk";
import type { AnswerBlock, AskResponse, Citation, SourceDoc } from "./types";

const MODEL = process.env.CITATIONS_MODEL || "claude-sonnet-5";

const SYSTEM = [
  "You answer questions strictly from the provided documents.",
  "Ground every factual claim in a citation. If the documents do not contain the",
  "answer, say so plainly rather than guessing. Prefer authoritative policy/terms",
  "documents over informal notes, drafts, or unsent messages.",
].join(" ");

/**
 * Ask the model a question over `docs` with the Citations API enabled, then
 * narrow the response to the flat {@link AskResponse} the UI consumes.
 *
 * The key trust property: `start_char_index` / `end_char_index` on each citation
 * are produced by the API against the exact document text we sent — so the UI can
 * highlight the source deterministically instead of trusting model-written spans.
 */
export async function askWithCitations(
  question: string,
  docs: SourceDoc[],
): Promise<AskResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
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

  return narrow(message.content as unknown as RawBlock[], docs);
}

// --- narrowing the provider shape -----------------------------------------

interface RawCitation {
  type: string;
  cited_text?: string;
  document_index?: number;
  document_title?: string | null;
  start_char_index?: number;
  end_char_index?: number;
}

interface RawBlock {
  type: string;
  text?: string;
  citations?: RawCitation[] | null;
}

function narrow(content: RawBlock[], docs: SourceDoc[]): AskResponse {
  const blocks: AnswerBlock[] = [];
  const registry: Citation[] = [];
  // De-dupe identical spans so the same source shares one footnote number.
  const seen = new Map<string, Citation>();

  for (const block of content) {
    if (block.type !== "text" || typeof block.text !== "string") continue;

    const citations: Citation[] = [];
    for (const raw of block.citations ?? []) {
      // We only send text documents, so we expect char_location citations.
      if (raw.type !== "char_location") continue;

      const doc = docs[raw.document_index ?? -1];
      const start = raw.start_char_index ?? 0;
      const end = raw.end_char_index ?? 0;
      const key = `${doc?.id ?? "?"}:${start}:${end}`;

      let citation = seen.get(key);
      if (!citation) {
        citation = {
          n: registry.length + 1,
          docId: doc?.id ?? "unknown",
          docTitle: doc?.title ?? raw.document_title ?? "Unknown source",
          citedText: raw.cited_text ?? "",
          startChar: start,
          endChar: end,
        };
        seen.set(key, citation);
        registry.push(citation);
      }
      citations.push(citation);
    }

    blocks.push({ text: block.text, citations });
  }

  return { blocks, citations: registry };
}
