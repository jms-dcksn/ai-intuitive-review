import { streamReport } from "@/lib/assess";
import { streamMockReport } from "@/lib/mock";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  // No key → stream the recorded report so the UX is reviewable offline.
  if (!process.env.ANTHROPIC_API_KEY) {
    return streamMockReport();
  }
  return streamReport().toTextStreamResponse();
}

// The object stream carries only the report, so the client asks here (once, on
// mount) whether it's about to see a live call or the recorded mock.
export function GET(): Response {
  return Response.json({ mocked: !process.env.ANTHROPIC_API_KEY });
}
