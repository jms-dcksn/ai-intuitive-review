import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { playRun } from "@/lib/run";
import type { LeaseUIMessage, Resolution, TrustDial } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  sessionId?: string;
  dial?: TrustDial;
  resolution?: Resolution;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Body;
  const sessionId = body.sessionId || "default";
  const dial: TrustDial = body.dial || "balanced";

  const stream = createUIMessageStream<LeaseUIMessage>({
    execute: async ({ writer }) => {
      await playRun(writer, { sessionId, dial, resolution: body.resolution });
    },
    onError: (e) => (e instanceof Error ? e.message : "Run failed"),
  });

  return createUIMessageStreamResponse({ stream });
}
