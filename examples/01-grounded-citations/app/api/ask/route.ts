import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { streamGroundedAnswer } from "@/lib/anthropic";
import { judgeFaithfulness } from "@/lib/judge";
import { mockFaithfulnessVerdict, streamMockAnswer } from "@/lib/mock";
import { SegmentWriter } from "@/lib/segment-writer";
import { SAMPLE_DOCS, SAMPLE_QUESTION } from "@/lib/sample-data";
import type { ReviewUIMessage } from "@/lib/types";

export const runtime = "nodejs";
// Streaming answers can run longer than the default serverless budget.
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const question: string =
    typeof body.question === "string" && body.question.trim()
      ? body.question
      : SAMPLE_QUESTION;
  const judge: boolean = body.judge === true;

  const mocked = !process.env.ANTHROPIC_API_KEY;

  const stream = createUIMessageStream<ReviewUIMessage>({
    execute: async ({ writer }) => {
      // Announce mock vs. live up front as transient metadata (not persisted).
      writer.write({ type: "data-mode", data: { mocked }, transient: true });

      const out = new SegmentWriter(writer);
      if (mocked) {
        await streamMockAnswer(out, SAMPLE_DOCS);
      } else {
        await streamGroundedAnswer(out, question, SAMPLE_DOCS);
      }

      // The judge needs the *complete* answer, so it runs here, at the tail of the
      // same open stream — no second round-trip. It emits one persisted part.
      if (judge) {
        try {
          const verdict = mocked
            ? mockFaithfulnessVerdict(out.segments())
            : await judgeFaithfulness(question, SAMPLE_DOCS, out.segments());
          writer.write({ type: "data-judge", data: verdict });
        } catch (err) {
          // Don't fail the whole response if the judge trips — the answer already
          // streamed. The pill simply resolves to nothing.
          console.error("Faithfulness judge failed:", err);
        }
      }
    },
    onError: (error) =>
      error instanceof Error ? error.message : "Streaming failed",
  });

  return createUIMessageStreamResponse({ stream });
}
