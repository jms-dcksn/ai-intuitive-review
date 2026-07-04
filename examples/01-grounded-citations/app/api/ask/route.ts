import { NextResponse } from "next/server";
import { askWithCitations } from "@/lib/anthropic";
import { mockAnswer } from "@/lib/mock";
import { SAMPLE_DOCS, SAMPLE_QUESTION } from "@/lib/sample-data";
import type { AskResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const question: string =
    typeof body.question === "string" && body.question.trim()
      ? body.question
      : SAMPLE_QUESTION;

  // No key configured → serve the recorded answer so the UI is still reviewable.
  if (!process.env.ANTHROPIC_API_KEY) {
    const mock: AskResponse & { mocked: true } = {
      ...mockAnswer(SAMPLE_DOCS),
      mocked: true,
    };
    return NextResponse.json(mock);
  }

  try {
    const answer = await askWithCitations(question, SAMPLE_DOCS);
    return NextResponse.json(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
