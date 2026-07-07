import type { UIMessageStreamWriter } from "ai";
import type {
  Decision,
  LeaseUIMessage,
  Resolution,
  TrustDial,
} from "./types";
import { buildScript, type BlockLevel, type ScriptEvent } from "./script";

type Writer = UIMessageStreamWriter<LeaseUIMessage>;

interface RunState {
  cursor: number;
  dial: TrustDial;
}

// In-memory session state. Fine for a single-instance demo; production would
// persist a real thread (LangGraph's interrupt()/resume maps 1:1 onto this).
const SESSIONS = new Map<string, RunState>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shouldBlock(level: BlockLevel, dial: TrustDial): boolean {
  if (level === "always") return true;
  if (level === "gated") return dial !== "autonomy";
  return dial === "oversight"; // level === "oversight"
}

/**
 * Play the choreographed run into the AI SDK stream. Streams receipts until it
 * reaches a checkpoint that should block at the current trust-dial setting; when
 * it does, it emits the checkpoint and stops, remembering where to resume. If a
 * checkpoint doesn't block, it's auto-resolved (the agent proceeds on its own
 * lean) and the run continues — that's the trust dial in action.
 */
export async function playRun(
  writer: Writer,
  input: { sessionId: string; dial: TrustDial; resolution?: Resolution },
): Promise<void> {
  const script = buildScript();
  let state = SESSIONS.get(input.sessionId);

  if (!state) {
    state = { cursor: 0, dial: input.dial };
    SESSIONS.set(input.sessionId, state);
    writer.write({ type: "data-mode", data: { mocked: true }, transient: true });
  }
  state.dial = input.dial; // the dial can move mid-run

  // Apply the user's resolution to the checkpoint we stopped on.
  if (input.resolution) {
    applyResolution(writer, script, input.resolution);
    if (input.resolution.action === "stop") {
      writer.write({ type: "data-done", data: { summary: "Paused at your request. Nothing further was decided.", stats: "run paused" } });
      return;
    }
  }

  for (let i = state.cursor; i < script.length; i++) {
    const e = script[i];

    if (e.t === "phase") {
      await sleep(280);
      writer.write({ type: "data-phase", data: e.phase });
      continue;
    }

    if (e.t === "decision") {
      await sleep(85);
      writer.write({ type: "data-decision", data: e.decision });
      continue;
    }

    if (e.t === "done") {
      await sleep(200);
      writer.write({ type: "data-done", data: { summary: e.summary, stats: e.stats } });
      state.cursor = i + 1;
      return;
    }

    // checkpoint
    if (shouldBlock(e.block, state.dial)) {
      if (e.pendingDecision) {
        await sleep(85);
        writer.write({ type: "data-decision", data: { ...e.pendingDecision, status: "pending" } });
      }
      await sleep(160);
      writer.write({ type: "data-checkpoint", data: e.checkpoint });
      state.cursor = i + 1; // resume after this checkpoint
      return;
    }

    // Not blocking → the agent proceeds on its own lean (trust dial permits it).
    autoResolve(writer, e);
  }
}

function autoResolve(writer: Writer, e: Extract<ScriptEvent, { t: "checkpoint" }>): void {
  const cp = e.checkpoint;
  if (cp.dependents && cp.dependents.length) {
    // Class checkpoint: auto-adopt the lean as a policy across the class.
    const choice = cp.suggestion ?? cp.options?.[0] ?? "";
    writer.write({
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
      writer.write({ type: "data-decisionUpdate", data: { id, patch: { decided: `read as ${choice}`, status: "auto-resolved" } } });
    }
    return;
  }
  if (e.pendingDecision) {
    writer.write({ type: "data-decision", data: { ...e.pendingDecision, status: "auto-resolved" } });
  }
}

function applyResolution(
  writer: Writer,
  script: ScriptEvent[],
  res: Resolution,
): void {
  const cp = script
    .filter((e): e is Extract<ScriptEvent, { t: "checkpoint" }> => e.t === "checkpoint")
    .map((e) => e.checkpoint)
    .find((c) => c.id === res.checkpointId);
  if (!cp) return;

  // Class checkpoint → promote to a policy that resolves every dependent at once.
  if (cp.dependents && cp.dependents.length) {
    const choice = res.value ?? cp.suggestion ?? "";
    writer.write({
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
      writer.write({ type: "data-decisionUpdate", data: { id, patch: { decided: `read as ${choice}`, status: "policy-applied", confidence: 1 } } });
    }
    return;
  }

  // Single decision checkpoint.
  if (cp.decisionId) {
    const patch: Partial<Decision> =
      res.action === "correct"
        ? { decided: res.value ?? "", status: "corrected", confidence: 1 }
        : { status: "approved", confidence: 1 };
    writer.write({ type: "data-decisionUpdate", data: { id: cp.decisionId, patch } });
  }
  // Gate checkpoints (proceed) need no ledger change.
}
