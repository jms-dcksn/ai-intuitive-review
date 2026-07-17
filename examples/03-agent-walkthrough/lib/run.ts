import type { Resolution } from "./types";
import { buildScript } from "./script";
import { shouldBlock } from "./gate";
import { applyResolution, autoResolve } from "./resolve";
import type { ThreadRecorder, ThreadState } from "./thread";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Play the choreographed run into the AI SDK stream. Streams receipts until it
 * reaches a checkpoint that should block at the current trust-dial setting; when
 * it does, it emits the checkpoint and stops, remembering where to resume. If a
 * checkpoint doesn't block, the agent proceeds on its own lean and the outcome
 * lands amber in the ledger — that's the trust dial in action.
 *
 * State lives in the shared {@link ThreadState}; every write goes through
 * {@link ThreadRecorder} so the server-side ledger stays authoritative and a
 * refresh can rehydrate. The live agent (`./agent`) mirrors this control flow
 * over real model calls, and both apply checkpoint outcomes via `./resolve`.
 */
export async function playRun(
  rec: ThreadRecorder,
  thread: ThreadState,
  resolution?: Resolution,
): Promise<void> {
  const script = buildScript();

  // Apply the user's resolution to the checkpoint we stopped on.
  if (resolution) {
    if (resolution.action === "stop") {
      rec.clearPending();
      rec.write({
        type: "data-done",
        data: { summary: "Paused at your request. Nothing further was decided.", stats: "run paused" },
      });
      return;
    }
    applyResolution(rec, thread, resolution);
  }

  for (let i = thread.cursor; i < script.length; i++) {
    const e = script[i];

    if (e.t === "phase") {
      await sleep(280);
      rec.write({ type: "data-phase", data: e.phase });
      continue;
    }

    if (e.t === "decision") {
      await sleep(220);
      rec.write({ type: "data-decision", data: e.decision });
      continue;
    }

    if (e.t === "done") {
      await sleep(300);
      rec.write({ type: "data-done", data: { summary: e.summary, stats: e.stats, brief: e.brief } });
      rec.setCursor(i + 1);
      return;
    }

    // checkpoint
    if (shouldBlock(e.block, thread.dial)) {
      if (e.pendingDecision) {
        await sleep(220);
        rec.write({ type: "data-decision", data: { ...e.pendingDecision, status: "pending" } });
      }
      await sleep(200);
      rec.write({ type: "data-checkpoint", data: e.checkpoint });
      rec.setCursor(i + 1); // resume after this checkpoint
      return;
    }

    // Not blocking → the agent proceeds on its own lean (trust dial permits it).
    if (e.pendingDecision) {
      await sleep(220);
      rec.write({ type: "data-decision", data: { ...e.pendingDecision, status: "auto-resolved" } });
    }
    autoResolve(rec, e.checkpoint);
  }
}
