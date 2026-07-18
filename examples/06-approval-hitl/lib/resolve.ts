import { WRITE_TOOLS } from "./scenario";
import type { Resolution } from "./types";
import type { ThreadRecorder, ThreadState } from "./thread";

// Applying an approval outcome — shared verbatim between the choreographed mock
// (`./run`) and the live agent (`./agent`). This is the only place a write tool
// actually executes, and it runs strictly *after* a human resolution: approve
// executes with the (possibly edited) args and stamps the receipt on the feed
// row; reject marks the row and executes nothing.

export interface Outcome {
  approvalId: string;
  tool: string;
  approved: boolean;
  args: Record<string, string>; // final args, after any edits
  edited: boolean;
  receipt?: string;
  reason?: string; // reject only
}

export function applyResolution(
  rec: ThreadRecorder,
  thread: ThreadState,
  res: Resolution,
): Outcome | null {
  rec.clearPending();
  const ap = thread.approvals.find((a) => a.id === res.approvalId);
  if (!ap) return null;
  const meta = WRITE_TOOLS[ap.tool];
  const base = Object.fromEntries(ap.args.map((f) => [f.key, f.value]));

  if (res.action === "reject") {
    rec.write({
      type: "data-actionUpdate",
      data: {
        id: ap.actionId,
        patch: {
          status: "rejected",
          detail: res.reason ? `Rejected — “${res.reason}”` : "Rejected — nothing was executed",
        },
      },
    });
    thread.outcomes[ap.id] = "rejected";
    thread.rejectReason = res.reason;
    return { approvalId: ap.id, tool: ap.tool, approved: false, args: base, edited: false, reason: res.reason };
  }

  const args = { ...base, ...(res.editedArgs ?? {}) };
  const edited = Object.entries(res.editedArgs ?? {}).some(([k, v]) => base[k] !== v);
  const receipt = meta.execute(args);
  rec.write({
    type: "data-actionUpdate",
    data: {
      id: ap.actionId,
      patch: {
        status: "executed",
        title: meta.feedTitle(args),
        args: meta.fields(args),
        receipt,
        edited,
        detail: edited ? "Executed with your edits" : "Executed with your approval",
      },
    },
  });
  thread.outcomes[ap.id] = edited ? "edited" : "approved";
  return { approvalId: ap.id, tool: ap.tool, approved: true, args, edited, receipt };
}

/** Audit line for the done card — derived from the feed, not hand-written. */
export function auditStats(thread: ThreadState): string {
  const reads = thread.actions.filter((a) => a.risk === "read").length;
  const executed = thread.actions.filter((a) => a.status === "executed").length;
  const rejected = thread.actions.filter((a) => a.status === "rejected").length;
  return (
    `${reads} read-only calls ran freely · ${executed} action${executed === 1 ? "" : "s"} executed with your approval` +
    (rejected ? ` · ${rejected} rejected (never fired)` : "") +
    " · 0 actions fired without a click"
  );
}
