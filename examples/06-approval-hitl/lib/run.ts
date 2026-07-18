import { ACCOUNT, READ_TOOLS, TICKET, WRITE_TOOLS } from "./scenario";
import { applyResolution, auditStats, type Outcome } from "./resolve";
import type { Resolution } from "./types";
import type { ThreadRecorder, ThreadState } from "./thread";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Play the choreographed run into the AI SDK stream. Read tools stream by as
 * auto-executed receipts; each write tool stops the run with an approval card
 * and the player returns, remembering which stage to resume. The user's
 * resolution rides the next request: `applyResolution` executes (or refuses)
 * the write, and `advanceStage` picks the branch — notably, rejecting the
 * refund doesn't dead-end the run, it re-plans to an escalation ticket.
 *
 * Unlike example 03's linear script-with-cursor, the cursor here is a named
 * {@link ThreadState.stage} because the run genuinely branches on the human's
 * answer. The live agent (`./agent`) branches by letting the model read the
 * rejection; this player stages the same behavior deterministically.
 */
export async function playRun(
  rec: ThreadRecorder,
  thread: ThreadState,
  resolution?: Resolution,
): Promise<void> {
  if (resolution) {
    const out = applyResolution(rec, thread, resolution);
    if (out) advanceStage(thread, out);
  }

  while (true) {
    switch (thread.stage) {
      case "investigate":
        await investigate(rec, thread);
        break;
      case "fallback":
        await fallback(rec, thread);
        break;
      case "notify":
        await notify(rec, thread);
        break;
      case "wrap":
        await wrap(rec, thread);
        break;
      case "awaiting": // paused on an open approval card
      case "done":
        return;
    }
  }
}

/** The user's answer decides where the run goes next. */
function advanceStage(thread: ThreadState, out: Outcome): void {
  if (out.approvalId === "ap-refund") {
    thread.stage = out.approved ? "notify" : "fallback";
  } else if (out.approvalId === "ap-escalate") {
    thread.stage = "notify"; // remedy settled either way — tell the customer something true
  } else if (out.approvalId === "ap-email") {
    thread.stage = "wrap";
  }
}

// ---------------------------------------------------------------------------
// Stages.
// ---------------------------------------------------------------------------

let stepSeq = 0;
function step(rec: ThreadRecorder, text: string): void {
  rec.write({ type: "data-step", data: { id: `s-${++stepSeq}-${Date.now()}`, text } });
}

/** Stream one read tool: appears as running, resolves to a receipt. */
async function readTool(rec: ThreadRecorder, id: string, tool: string): Promise<void> {
  const r = READ_TOOLS[tool].run();
  rec.write({
    type: "data-action",
    data: { id, tool, risk: "read", title: r.title, detail: "querying…", status: "running" },
  });
  await sleep(500);
  rec.write({ type: "data-actionUpdate", data: { id, patch: { status: "ok", detail: r.detail } } });
}

/** Propose a write: an awaiting feed row + the blocking approval card. Ends the turn. */
function proposeWrite(
  rec: ThreadRecorder,
  thread: ThreadState,
  opts: { approvalId: string; actionId: string; tool: string; args: Record<string, string>; rationale: string },
): void {
  const meta = WRITE_TOOLS[opts.tool];
  const fields = meta.fields(opts.args);
  rec.write({
    type: "data-action",
    data: {
      id: opts.actionId,
      tool: opts.tool,
      risk: "write",
      title: meta.feedTitle(opts.args),
      detail: "Proposed — waiting for your approval",
      args: fields,
      status: "awaiting",
    },
  });
  rec.write({
    type: "data-approval",
    data: {
      id: opts.approvalId,
      actionId: opts.actionId,
      tool: opts.tool,
      klass: meta.klass,
      title: meta.title,
      rationale: opts.rationale,
      willDo: meta.willDo(opts.args),
      reversible: meta.reversible,
      args: fields,
      approveLabel: meta.approveLabel(opts.args),
    },
  });
  thread.stage = "awaiting";
}

async function investigate(rec: ThreadRecorder, thread: ThreadState): Promise<void> {
  step(rec, "Reading the ticket and pulling the account — nothing gets written yet.");
  await sleep(300);
  await readTool(rec, "a-ticket", "get_ticket");
  await readTool(rec, "a-account", "lookup_account");
  await readTool(rec, "a-billing", "billing_history");
  await sleep(350);
  step(
    rec,
    "Two identical $49.00 charges 41 seconds apart — INV-8842 is a duplicate of INV-8841. " +
      "Policy covers a full refund without sign-off, so I'm preparing one for your approval.",
  );
  await sleep(400);
  proposeWrite(rec, thread, {
    approvalId: "ap-refund",
    actionId: "a-refund",
    tool: "issue_refund",
    args: {
      invoice_id: "INV-8842",
      amount_usd: "49.00",
      reason: "Duplicate charge for the July Team renewal — INV-8841 already covers it",
    },
    rationale:
      "The billing history shows INV-8841 and INV-8842 for the same $49.00 renewal on the same card, " +
      "41 seconds apart. That matches the duplicate-charge pattern the refund policy covers in full.",
  });
}

async function fallback(rec: ThreadRecorder, thread: ThreadState): Promise<void> {
  await sleep(350);
  step(
    rec,
    "Understood — I won't touch the payment. The charge still looks duplicated, so instead " +
      "I'll hand it to the billing team with your note attached.",
  );
  await sleep(400);
  proposeWrite(rec, thread, {
    approvalId: "ap-escalate",
    actionId: "a-escalate",
    tool: "create_ticket",
    args: {
      queue: "billing-escalations",
      priority: "high",
      title: `Suspected duplicate charge on ${ACCOUNT.id} (INV-8842)`,
      note:
        `Customer ${ACCOUNT.contact} (${ACCOUNT.name}) reports a double charge for the July renewal. ` +
        `INV-8841 and INV-8842 are identical $49.00 charges 41 seconds apart. An agent-proposed refund ` +
        `was rejected by the reviewer${thread.rejectReason ? ` — “${thread.rejectReason}”` : ""}. ` +
        "Please investigate and apply the right remedy.",
    },
    rationale:
      "You rejected the refund, but the duplicate is real and the customer is waiting. Routing it to " +
      "billing keeps a human owner on the money side while the reply below stays honest.",
  });
}

async function notify(rec: ThreadRecorder, thread: ThreadState): Promise<void> {
  await sleep(350);
  step(rec, "Drafting the reply to the customer — it goes out only if you approve it.");
  await sleep(400);

  const refunded = ["approved", "edited"].includes(thread.outcomes["ap-refund"] ?? "");
  const escalated = ["approved", "edited"].includes(thread.outcomes["ap-escalate"] ?? "");
  const amount = refunded
    ? thread.actions.find((a) => a.id === "a-refund")?.args?.find((f) => f.key === "amount_usd")?.value ?? "49.00"
    : null;

  const middle = refunded
    ? `You're right — our system charged your card twice for the July renewal. I've refunded ` +
      `$${Number(amount).toFixed(2)} for the duplicate invoice (INV-8842) to your ${ACCOUNT.card.replace("ending", "ending in")}; ` +
      "it should appear within 5–10 business days."
    : escalated
      ? "You're right — our records show two charges for the July renewal. I've escalated this to our " +
        "billing team as a high-priority case, and you'll hear back from them within one business day."
      : "Thanks for flagging this. We're actively investigating the two July charges on your account " +
        "and will follow up with the resolution shortly.";

  proposeWrite(rec, thread, {
    approvalId: "ap-email",
    actionId: "a-email",
    tool: "send_email",
    args: {
      to: `${ACCOUNT.contact} <${ACCOUNT.email}>`,
      subject: "Re: Charged twice for our July renewal",
      body: `Hi Dana,\n\nThanks for reaching out, and sorry for the trouble.\n\n${middle}\n\nYour Team subscription itself is unaffected. If anything still looks off on your statement, just reply here.\n\nBest,\nHalyard Support`,
    },
    rationale:
      "The customer asked for confirmation of what happened. This states exactly what was done — " +
      "no more, no less — so the reply stays true to the actions you actually approved.",
  });
}

async function wrap(rec: ThreadRecorder, thread: ThreadState): Promise<void> {
  await sleep(400);
  const refunded = ["approved", "edited"].includes(thread.outcomes["ap-refund"] ?? "");
  const escalated = ["approved", "edited"].includes(thread.outcomes["ap-escalate"] ?? "");
  const sent = ["approved", "edited"].includes(thread.outcomes["ap-email"] ?? "");

  const remedy = refunded
    ? "the duplicate charge was refunded"
    : escalated
      ? "the duplicate charge was escalated to billing"
      : "no remedy was executed — the refund was declined";
  const notified = sent ? "and the customer got a confirmation you signed off on" : "and no email was sent";

  rec.write({
    type: "data-done",
    data: {
      summary: `Ticket ${TICKET.id} handled: ${remedy}, ${notified}. Every external effect above traces to a click of yours.`,
      stats: auditStats(thread),
    },
  });
  thread.stage = "done";
}
