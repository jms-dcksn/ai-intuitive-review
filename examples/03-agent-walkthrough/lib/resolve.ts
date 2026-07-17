import type { Checkpoint, CheckpointOption, Decision, Resolution } from "./types";
import type { ThreadRecorder, ThreadState } from "./thread";

// Applying a checkpoint outcome to the ledger — shared verbatim between the
// choreographed mock (`./run`) and the live agent (`./agent`), the same way the
// gate is. An outcome is fully described by the chosen CheckpointOption: it
// patches the pending decision, optionally promotes a standing rule, and
// rewrites every dependent record — whether the user chose it (approved /
// corrected / policy-applied) or the trust dial let the agent take its own lean
// (auto-resolved, amber, audit-worthy).

/** Apply one option's consequences to the ledger. */
export function applyOption(
  rec: ThreadRecorder,
  cp: Checkpoint,
  opt: CheckpointOption | undefined,
  mode: "user" | "auto",
): void {
  const agreed = !opt || opt.value === cp.suggestion;

  if (cp.decisionId) {
    const patch: Partial<Decision> = {
      status: mode === "auto" ? "auto-resolved" : agreed ? "approved" : "corrected",
    };
    if (mode === "user") patch.confidence = 1; // the human's call is the ground truth
    if (opt?.decided) patch.decided = opt.decided;
    rec.write({ type: "data-decisionUpdate", data: { id: cp.decisionId, patch } });
  }

  if (opt?.policyRule && cp.dependents?.length) {
    rec.write({
      type: "data-policy",
      data: {
        id: `pol-${cp.id}`,
        rule: mode === "auto" ? `${opt.policyRule} (auto-adopted)` : opt.policyRule,
        appliesTo: "Medication reconciliation — this chart",
        count: cp.dependents.length + (cp.decisionId ? 1 : 0),
        fromCheckpoint: cp.id,
      },
    });
    for (const id of cp.dependents) {
      rec.write({
        type: "data-decisionUpdate",
        data: {
          id,
          patch: {
            decided: opt.dependentPatches?.[id] ?? `Resolved by rule: ${opt.policyRule}`,
            status: mode === "auto" ? "auto-resolved" : "policy-applied",
            ...(mode === "user" ? { confidence: 1 } : {}),
          },
        },
      });
    }
  }
}

/**
 * Apply the user's resolution to the checkpoint the run stopped on. The
 * authoritative checkpoint is read back from the thread (the recorder mirrored
 * it there when it streamed). Gate `proceed` needs no ledger change.
 */
export function applyResolution(rec: ThreadRecorder, thread: ThreadState, res: Resolution): void {
  rec.clearPending();
  const cp = thread.checkpoints.find((c) => c.id === res.checkpointId);
  if (!cp || cp.type === "gate") return;
  // Remember the choice keyed by checkpoint id — the live agent consults this
  // so later prompts (and resumed runs) stay consistent with the user's call.
  rec.setPolicyChoice(cp.id, res.value ?? cp.suggestion ?? "");
  const opt = cp.options?.find((o) => o.value === res.value);
  applyOption(rec, cp, opt, "user");
}

/** The trust dial let this checkpoint pass — take the agent's lean. */
export function autoResolve(rec: ThreadRecorder, cp: Checkpoint): void {
  const lean = cp.options?.find((o) => o.value === cp.suggestion) ?? cp.options?.[0];
  applyOption(rec, cp, lean, "auto");
}
