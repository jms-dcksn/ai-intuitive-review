import type { Decision, Resolution } from "./types";
import { buildScript, type ScriptEvent } from "./script";
import { shouldBlock } from "./gate";
import type { ThreadRecorder, ThreadState } from "./thread";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Play the choreographed run into the AI SDK stream. Streams receipts until it
 * reaches a checkpoint that should block at the current trust-dial setting; when
 * it does, it emits the checkpoint and stops, remembering where to resume. If a
 * checkpoint doesn't block, it's auto-resolved (the agent proceeds on its own
 * lean) and the run continues — that's the trust dial in action.
 *
 * State lives in the shared {@link ThreadState}; every write goes through
 * {@link ThreadRecorder} so the server-side ledger stays authoritative and a
 * refresh can rehydrate. The live agent (`./agent`) mirrors this control flow
 * over real model calls.
 */
export async function playRun(
  rec: ThreadRecorder,
  thread: ThreadState,
  resolution?: Resolution,
): Promise<void> {
  const script = buildScript();

  // Apply the user's resolution to the checkpoint we stopped on.
  if (resolution) {
    applyResolution(rec, script, resolution);
    if (resolution.action === "stop") {
      rec.write({
        type: "data-done",
        data: { summary: "Paused at your request. Nothing further was decided.", stats: "run paused" },
      });
      return;
    }
  }

  for (let i = thread.cursor; i < script.length; i++) {
    const e = script[i];

    if (e.t === "phase") {
      await sleep(280);
      rec.write({ type: "data-phase", data: e.phase });
      continue;
    }

    if (e.t === "decision") {
      await sleep(85);
      rec.write({ type: "data-decision", data: e.decision });
      continue;
    }

    if (e.t === "done") {
      await sleep(200);
      rec.write({ type: "data-done", data: { summary: e.summary, stats: e.stats } });
      rec.setCursor(i + 1);
      return;
    }

    // checkpoint
    if (shouldBlock(e.block, thread.dial)) {
      if (e.pendingDecision) {
        await sleep(85);
        rec.write({ type: "data-decision", data: { ...e.pendingDecision, status: "pending" } });
      }
      await sleep(160);
      rec.write({ type: "data-checkpoint", data: e.checkpoint });
      rec.setCursor(i + 1); // resume after this checkpoint
      return;
    }

    // Not blocking → the agent proceeds on its own lean (trust dial permits it).
    autoResolve(rec, e);
  }
}

function autoResolve(rec: ThreadRecorder, e: Extract<ScriptEvent, { t: "checkpoint" }>): void {
  const cp = e.checkpoint;
  if (cp.dependents && cp.dependents.length) {
    // Class checkpoint: auto-adopt the lean as a policy across the class.
    const choice = cp.suggestion ?? cp.options?.[0] ?? "";
    rec.write({
      type: "data-policy",
      data: {
        id: `pol-${cp.id}`,
        rule: (cp.policyRule ?? "").replace("{choice}", choice) + " (auto-adopted)",
        appliesTo: cp.classId ?? "class",
        count: cp.dependents.length,
        fromCheckpoint: cp.id,
      },
    });
    for (const id of cp.dependents) {
      rec.write({ type: "data-decisionUpdate", data: { id, patch: { decided: `read as ${choice}`, status: "auto-resolved" } } });
    }
    return;
  }
  if (e.pendingDecision) {
    rec.write({ type: "data-decision", data: { ...e.pendingDecision, status: "auto-resolved" } });
  }
}

function applyResolution(
  rec: ThreadRecorder,
  script: ScriptEvent[],
  res: Resolution,
): void {
  const cp = script
    .filter((e): e is Extract<ScriptEvent, { t: "checkpoint" }> => e.t === "checkpoint")
    .map((e) => e.checkpoint)
    .find((c) => c.id === res.checkpointId);
  rec.clearPending();
  if (!cp) return;

  // Class checkpoint → promote to a policy that resolves every dependent at once.
  if (cp.dependents && cp.dependents.length) {
    const choice = res.value ?? cp.suggestion ?? "";
    rec.write({
      type: "data-policy",
      data: {
        id: `pol-${cp.id}`,
        rule: (cp.policyRule ?? "").replace("{choice}", choice),
        appliesTo: cp.classId ?? "class",
        count: cp.dependents.length,
        fromCheckpoint: cp.id,
      },
    });
    for (const id of cp.dependents) {
      rec.write({ type: "data-decisionUpdate", data: { id, patch: { decided: `read as ${choice}`, status: "policy-applied", confidence: 1 } } });
    }
    return;
  }

  // Single decision checkpoint.
  if (cp.decisionId) {
    const patch: Partial<Decision> =
      res.action === "correct"
        ? { decided: res.value ?? "", status: "corrected", confidence: 1 }
        : { status: "approved", confidence: 1 };
    rec.write({ type: "data-decisionUpdate", data: { id: cp.decisionId, patch } });
  }
  // Gate checkpoints (proceed) need no ledger change.
}
