import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { playRun } from "@/lib/run";
import { runLiveAgent } from "@/lib/agent";
import {
  getOrCreateThread,
  getThread,
  ledgerSnapshot,
  ThreadRecorder,
} from "@/lib/thread";
import type { LeaseUIMessage, Resolution, TrustDial } from "@/lib/types";

export const runtime = "nodejs";
// A live slice can run several model calls before the next checkpoint.
export const maxDuration = 120;

interface Body {
  sessionId?: string;
  dial?: TrustDial;
  resolution?: Resolution;
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as Body;
  const sessionId = body.sessionId || "default";
  const dial: TrustDial = body.dial || "balanced";

  // MOCK_MODE=true forces the choreographed mock even if a key is present
  // (e.g. exported in the shell). Otherwise: no key → mock, key → live agent.
  const mocked =
    process.env.MOCK_MODE === "true" || !process.env.ANTHROPIC_API_KEY;
  const { thread, created } = getOrCreateThread(sessionId, dial, mocked);

  const stream = createUIMessageStream<LeaseUIMessage>({
    execute: async ({ writer }) => {
      if (created) {
        thread.started = true;
        writer.write({ type: "data-mode", data: { mocked }, transient: true });
      }
      const rec = new ThreadRecorder(writer, thread);
      if (body.resolution && created) {
        // A resolution for a session the server doesn't know: the dev server
        // reloaded (or restarted) mid-run and the in-memory thread store was
        // wiped. Replaying from cursor 0 would re-emit checkpoints the client
        // already resolved and dead-end the UI — say so instead.
        rec.write({
          type: "data-done",
          data: {
            summary: "The server lost this run's state (dev reload mid-run). Hit Restart to run again.",
            stats: "session lost",
          },
        });
        return;
      }
      if (mocked) {
        await playRun(rec, thread, body.resolution);
      } else {
        await runLiveAgent(rec, thread, body.resolution);
      }
    },
    onError: (e) => (e instanceof Error ? e.message : "Run failed"),
  });

  return createUIMessageStreamResponse({ stream });
}

/**
 * Rehydrate a run after a page refresh. The ledger is server-authoritative (held
 * in the thread), so the client can rebuild its whole state from this instead of
 * losing everything the way a client-only ledger would.
 */
export async function GET(req: Request): Promise<Response> {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  const thread = sessionId ? getThread(sessionId) : undefined;
  if (!thread) return Response.json({ found: false });
  return Response.json({ found: true, ...ledgerSnapshot(thread) });
}
