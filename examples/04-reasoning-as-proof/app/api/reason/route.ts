import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { streamReasonedAnswer } from "@/lib/anthropic";
import { streamMockAnswer } from "@/lib/mock";
import { SAMPLE_QUESTION, SCENARIO_DOCS } from "@/lib/sample-data";
import type { ReasonUIMessage } from "@/lib/types";

export const runtime = "nodejs";
// A reasoned answer can think for a while before the first token lands.
export const maxDuration = 120;

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const question: string =
    typeof body.question === "string" && body.question.trim()
      ? body.question
      : SAMPLE_QUESTION;

  const mocked = !process.env.ANTHROPIC_API_KEY;

  const stream = createUIMessageStream<ReasonUIMessage>({
    execute: async ({ writer }) => {
      // Announce mock vs. live up front as transient metadata (not persisted).
      writer.write({ type: "data-mode", data: { mocked }, transient: true });

      if (mocked) {
        const meta = await streamMockAnswer(writer);
        writer.write({ type: "data-meta", data: meta });
      } else {
        const { model, redacted } = await streamReasonedAnswer(
          writer,
          question,
          SCENARIO_DOCS,
        );
        // Current models return a summarized view of the reasoning — the UI
        // states that rather than presenting the trace as the raw working.
        writer.write({
          type: "data-meta",
          data: { model, summarized: true, redacted },
        });
      }
    },
    onError: (error) =>
      error instanceof Error ? error.message : "Streaming failed",
  });

  return createUIMessageStreamResponse({ stream });
}
