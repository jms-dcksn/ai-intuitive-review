# Walkthrough 06 — Approval / Human-in-the-loop (the agent asks before it acts)

> Code: [`examples/06-approval-hitl`](../examples/06-approval-hitl) ·
> Design rationale: [`PLAN.md`](../examples/06-approval-hitl/PLAN.md)

Examples 01–05 answer "should I believe this?"; 06 answers the question that
actually gates deployment: **"are you about to do something I didn't
approve?"** An agent resolves a support ticket — a customer double-charged
$49.00 for a renewal — with three read tools that run freely and three write
tools (`issue_refund`, `create_ticket`, `send_email`) that **stop the run**
until a human clicks. This closes the repo's arc: review → trust → authorize.

## The problem in one line

> A bare "Allow?" dialog transfers no understanding — the user rubber-stamps a
> function name. Approval only means something when the user has watched the
> work that led to the proposal, can see and change the actual arguments,
> knows the consequence in plain language, and can say *no* productively.

## The shape of the run

```
 Start ─► read: ticket ─► read: account ─► read: billing history
              receipts stream freely (AUTO-RAN)
         ─► [APPROVAL: issue_refund  · money · irreversible · red]
               approve / edit-approve ──► [APPROVAL: send_email · amber]
               reject (+ your note) ───► [APPROVAL: create_ticket · blue]
                                              └────► [APPROVAL: send_email]
         ─► done: audit trail — "0 actions fired without a click"
```

The email draft is honest to whichever branch ran: refund confirmed, escalation
promised, or "we're investigating" if you refused both.

## Step 1 — Reads run freely; that's how the agent earns the ask

The sidebar's **tool permissions** card states the standing policy before
anything runs: `get_ticket` / `lookup_account` / `billing_history` — *runs
freely*; the three writes — *asks first*. The read receipts streaming into the
feed are not decoration: by the time the refund card appears, you've watched
the agent find INV-8841 and INV-8842, identical, 41 seconds apart. The
evidence is legible in one line, so you can genuinely judge the proposal.

## Step 2 — The approval card renders the arguments, not a description

[`components/ApprovalCard.tsx`](../examples/06-approval-hitl/components/ApprovalCard.tsx)
has a fixed anatomy:

1. **Severity flag** — `WANTS TO MOVE MONEY` (red) / `…CONTACT THE CUSTOMER`
   (amber) / `…CHANGE INTERNAL STATE` (blue).
2. **The rationale** — why the agent chose this action (model-authored in live
   mode).
3. **The literal args** — invoice, amount, reason; email to/subject/body.
   Editable fields become inputs on "Edit the details".
4. **What this will do** — plain-language consequences plus a
   `CANNOT BE UNDONE` / `REVERSIBLE` badge.
5. **Consequence-labeled buttons** — never a bare "Approve":
   *"Approve — refund $49.00 to Visa ending 4242"*.

The provenance split is the trust design
([PLAN.md](../examples/06-approval-hitl/PLAN.md), Decision 2): the *args* come
from the agent, but the labels, editability, consequence bullets, and approve
text are pure functions in
[`lib/scenario.ts`](../examples/06-approval-hitl/lib/scenario.ts)'s
`TOOL_META`. A model can't sweet-talk the card — edit the amount to 98.00 and
"what this will do" recomputes to *"Returns $98.00…"* live, because it's
derived from the field values, not written by the model.

## Step 3 — The interrupt is the AI SDK's own tool contract

In live mode ([`lib/agent.ts`](../examples/06-approval-hitl/lib/agent.ts))
there is no framework interrupt at all. Read tools have `execute` and run
inside the `generateText` step loop. Write tools define **only an
`inputSchema`** — so when the model calls one, the loop has no result to
continue with and `generateText` returns with an unresolved tool call. That
*is* the pause: the server surfaces the call as an approval card, parks the
transcript and pending call ids in the durable thread, and ends the turn.

The resolution is a fresh POST.
[`lib/resolve.ts`](../examples/06-approval-hitl/lib/resolve.ts) — the **only**
code path that executes a write, in either mode — applies it, and the outcome
goes back as the parked call's **tool result**:

> `The reviewer APPROVED this action after editing the arguments… Receipt: RF-2209`
> `The reviewer REJECTED this action with the note: "…". It was NOT executed. Do not retry it as-is — adapt or wrap up honestly.`

The model reads that like any other tool output — which is why the best beat
in the demo, reject-and-adapt, needs **zero orchestration code**: reject the
refund with "billing has to touch the money, not us" and the live model
proposes a high-priority `billing-escalations` ticket with your note quoted in
it, then drafts a customer email that promises escalation instead of a refund.
The mock ([`lib/run.ts`](../examples/06-approval-hitl/lib/run.ts)) stages the
same branch deterministically with a stage-machine cursor instead of a
transcript.

## Step 4 — The audit trail is derived, not asserted

Every tool touch is a feed row that ends in a terminal state: `AUTO-RAN`
(reads), `EXECUTED` with a receipt (`RF-2209 · $49.00 to Visa •4242`),
`EXECUTED · EDITED BY YOU`, or `REJECTED` (never fired) with your quoted note.
The done card's stats line — *"3 read-only calls ran freely · 2 actions
executed with your approval · 1 rejected (never fired) · 0 actions fired
without a click"* — is computed from those rows
([`lib/resolve.ts`](../examples/06-approval-hitl/lib/resolve.ts) →
`auditStats`), not hand-written. The sidebar counts update live. "Nothing
fires without a click" is true **by construction**: the executor only runs
inside `applyResolution`, which only runs on a human resolution.

Same recoverability spine as 03: the server thread is authoritative, every
streamed part is mirrored into it, and a page refresh rehydrates the feed and
the open card via `GET /api/act`.

## What this pattern generalizes to

- **The permission split is the product.** Reads free / writes gated is the
  policy users actually want to read — per-action dialogs without a standing
  policy feel arbitrary; a standing policy without per-action cards feels
  blind.
- **Edit is the underrated verb.** Approve/reject makes the human a gate;
  edit-then-approve makes them a collaborator — and the executed action
  records that it ran with *their* values.
- **Rejection must flow back as information.** If "no" just halts the run,
  users learn to always say yes. Route the reason into the agent's context
  and refusal becomes steering.
- **Production swap:** thread `Map` → DB row; stub executors → real services
  with idempotency keys derived from the approval id; the hand-built seam →
  AI SDK `needsApproval` / LangGraph `interrupt()` / AG-UI HITL events, which
  wrap this exact flow.
