# 06 · Approval / Human-in-the-loop — the agent asks before it acts

A support agent investigates a billing complaint with read-only tools that
stream by as auditable receipts — then **stops before every external action**.
Each write tool it wants to use (refund, internal ticket, customer email)
renders an **approval card**: the exact arguments the model chose (editable), a
plain-language *what this will do* with a reversibility badge, and
consequence-labeled Approve / Reject. **Nothing fires without a click** — and a
rejection isn't a dead end: your reason goes back to the agent as a tool
result, and it adapts.

The trust question this answers: **"are you about to do something I didn't
approve?"** Examples 01–05 build understanding; this one gates *action* — the
bridge from review to authorize.

```
 ┌ WANTS TO MOVE MONEY · APPROVAL REQUIRED ────────────────────────┐
 │ The agent wants to issue a refund                               │
 │ INVOICE       INV-8842                                          │
 │ AMOUNT (USD)  49.00                          ← editable         │
 │ REASON        Duplicate charge for the July Team renewal        │
 │ WHAT THIS WILL DO                 [ CANNOT BE UNDONE ]          │
 │  • Returns $49.00 to Visa ending 4242, within 5–10 days.        │
 │  • Cannot be undone once submitted to the processor.            │
 │ [ Approve — refund $49.00 to Visa •4242 ] [ Edit ] [ Reject ]   │
 └──────────────────────────────────────────────────────────────────┘
```

## The idea

Tool use is where agent trust gets real: a wrong *analysis* wastes your time, a
wrong *action* spends money and emails customers. The design rules:

1. **Reads run freely, writes ask.** The permission split is a standing policy
   the user can read before the run (the sidebar's tool-permissions card), not
   a per-run negotiation. The read receipts are how the agent *earns* its
   proposal — by the time the refund card appears, you've watched it find the
   duplicate.
2. **Render the arguments, not a description of them.** The card shows the
   literal args the model chose, and the human can edit them before approving —
   the consequences and the approve label recompute live from the edited
   values. Approve / edit / reject are all one gesture.
3. **State the consequence, not the mechanism.** "Returns $49.00 to Visa
   ending 4242 · cannot be undone" — severity styling (money / external /
   internal) and a reversibility badge do the calibration.
4. **Reject is feedback, not a brake.** The rejection (plus your optional note)
   goes back to the agent as the tool's result. In the demo, rejecting the
   refund makes the agent re-plan to a billing-escalation ticket — and the
   customer email it drafts afterward stays honest about whichever remedy
   actually executed.

The payoff is the audit trail: *N read-only calls ran freely · N actions
executed with your approval · N rejected (never fired) · 0 actions fired
without a click* — by construction, not by promise.

## Stack

- **Next.js** + **React** + **TypeScript**
- **Vercel AI SDK** (`useChat` + `createUIMessageStream`) — a stream of typed
  data parts (`data-action`, `data-actionUpdate`, `data-approval`,
  `data-step`, `data-done`) the client folds into a live activity feed.
- **Human-in-the-loop via interrupt-and-resume:** an approval card ends the
  turn; the user's resolution rides the next request's `body`, and the server
  resumes the run. In live mode the interrupt is the AI SDK's own seam — write
  tools have **no `execute`**, so the first write the model proposes ends
  `generateText` with an unresolved tool call, and the resolution returns to
  the model as that call's tool result.

## Run it

```bash
cd examples/06-approval-hitl
npm install
npm run dev        # http://localhost:3000
```

**Two modes, same UI:**

- **No key → choreographed mock.** Deterministic, staged to hit the exact
  approval beats — including the reject-and-adapt branch.
- **`ANTHROPIC_API_KEY` set → live agent.** The same UI runs a real
  tool-calling loop: the model investigates the fixtures itself, chooses its
  own arguments, and genuinely re-plans off your rejection note. The approval
  *framing* (labels, consequences, editability) stays deterministic product
  design either way — only the args and rationale are model-authored.

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY for live mode
```

## What to try

1. **Start the agent.** Three reads stream by as receipts; the run stops at
   **"wants to issue a refund"** (red — money, irreversible).
2. **Edit the details** — change the amount and watch *what this will do* and
   the approve button recompute to your value. Approve: the feed row lands
   green with an **edited by you** tag and a receipt (`RF-2209 …`), and the
   confirmation email the agent drafts next quotes *your* amount.
3. **Restart and reject the refund** with a note ("billing has to touch the
   money, not us"). The agent doesn't stall — it proposes a
   **billing-escalations ticket** (blue — internal, reversible) with your note
   quoted in it, and the customer email now promises escalation, not a refund.
4. **Reject the email too** — the run ends honestly: "no email was sent", and
   the audit trail counts it as rejected (never fired).
5. Refresh the page mid-run — the feed and the open card **rehydrate** from
   the server-side thread.

## Files

| File | Role |
|------|------|
| `lib/scenario.ts` | The world: ticket, account, invoices, policy + `TOOL_META` — per write tool, how args are framed, what "will do" says, and the stub executor |
| `lib/run.ts` | Mock player: a stage machine that branches on the user's answer (reject refund → escalate) |
| `lib/agent.ts` | **Live agent**: real `generateText` tool loop; writes have no `execute`, so proposing one pauses the run |
| `lib/resolve.ts` | Applying an approval outcome — the only place a write executes, shared verbatim by both modes |
| `lib/thread.ts` | Durable thread store (feed + model transcript + parked tool calls) + the recorder that mirrors every part |
| `lib/feed.ts` | Client reducer: parts → interleaved activity feed |
| `lib/types.ts` | ActionEvent / ApprovalRequest / Resolution model + typed message |
| `app/api/act/route.ts` | `createUIMessageStream` endpoint (mock vs live) + GET rehydrate |
| `components/ApprovalCard.tsx` | The blocking card: args (editable, consequences recompute live) → what-this-will-do → approve/edit/reject |
| `components/ActionFeed.tsx` | The run transcript: narration + one row per tool touch, receipts and rejections |
| `components/Sidebar.tsx` | Ticket card · tool permissions (runs freely / asks first) · live audit trail |
| `app/page.tsx` | Orchestration + pause/resume wiring |

Full step-by-step:
[`../../walkthroughs/06-approval-hitl.md`](../../walkthroughs/06-approval-hitl.md).

## How the live interrupt works

There's no LangGraph and no bespoke interrupt machinery — the pause *is* the
AI SDK's tool contract (see [`PLAN.md`](./PLAN.md)):

- Read tools carry `execute` and run inside the `generateText` step loop,
  streaming feed receipts as they go.
- Write tools define only an `inputSchema`. When the model calls one, the step
  loop can't produce a tool result, so `generateText` returns with an
  unresolved tool call. The server surfaces it as an approval card, parks the
  transcript + pending call ids in the durable thread, and ends the turn.
- The resolution is a fresh POST: `lib/resolve.ts` executes (or refuses) the
  action, and the outcome is appended as the parked call's **tool result** —
  `"APPROVED … Receipt: RF-2209"` or `"REJECTED … adapt or wrap up honestly"`.
  The model reads it like any other tool output, which is why reject-and-adapt
  needs zero extra orchestration code.

## Notes & next steps

- **Relationship to 03.** Same pause/resume spine and server-authoritative
  thread. 03 validates analytical *decisions*; 06 gates external *actions* —
  together they close the review → trust → authorize arc.
- **Production swap.** The in-memory `Map` thread store becomes a DB row keyed
  by `sessionId`; the stub executors become real service calls. The AI SDK's
  `needsApproval` / AG-UI HITL events are the framework-native versions of the
  same seam this example builds by hand to keep it inspectable.
- **Idempotency matters in real life.** Here executors mint fake receipts; a
  real refund executor needs an idempotency key derived from the approval id,
  so a retried request can't double-fire an approved action.
