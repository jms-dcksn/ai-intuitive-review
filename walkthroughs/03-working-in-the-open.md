# Walkthrough 03 — Working in the Open

> Code: [`examples/03-agent-walkthrough`](../examples/03-agent-walkthrough) ·
> Design rationale: [`PLAN.md`](../examples/03-agent-walkthrough/PLAN.md)

Examples 01 and 02 made a *finished* answer trustworthy. This one makes the
*process* trustworthy — because when an agent works for half an hour over a large
corpus, the finished answer arrives too late and too dense to validate. The trust
has to be built while the work happens.

## The problem in one line

> An agent's analysis is hundreds of small, mostly-invisible decisions. Reveal
> them all at the end and you've handed the user an unauditable wall; interrupt on
> every one and you've rebuilt the manual process. The design goal is to make the
> user's validation effort grow **sublinearly** with the corpus.

Everything in this example is one of four levers toward that goal:
**confidence-gating**, **phase gates**, **policy promotion**, and a **trust dial**.

## The shape of the run

The agent works in three phases over 30 leases, deciding, per property: which
document is operative, whether an exit exists, how to read the notice clause, the
earliest exit date, and the cost. Most of those decisions are routine and stream by
as **receipts**. A few are consequential or uncertain and become **checkpoints**
that stop the run until the user weighs in.

```
 Start ─► Phase 1 Triage ──[#12 blocker]──► [gate] ─► Phase 2 Deep read
            receipts…                                   receipts…
                                      [Meridian ×8 policy] [#19 blocker] [#22]
                                             └─► [gate] ─► Phase 3 Synthesis ─► Done
```

## Step 1 — The corpus is designed to force decisions

[`lib/corpus.ts`](../examples/03-agent-walkthrough/lib/corpus.ts) plants the
ambiguities on purpose:

- **A class of 8** (Meridian Estates leases) share the *identical* "six (6) months'
  notice" wording — ambiguous between calendar and business months. This is the
  policy-promotion set: one ruling should settle all 8.
- **#12** has an original lease plus two amendments — which is operative?
- **#19**'s break fee depends on a figure that's illegible in the scan.
- **#22** has only a consent-gated "surrender for convenience" — a judgment call.
- **#5 / #14 / #27** have no exit at all.

A designed corpus is what lets the demo show *specific* trust moments rather than
generic "the agent decided things."

## Step 2 — Decisions are the unit, and confidence gates them

[`lib/types.ts`](../examples/03-agent-walkthrough/lib/types.ts) makes a `Decision`
the atom: `kind`, `subject`, `decided`, `rationale`, `evidence`, `confidence`,
`impact`, `status`. Confidence and impact are not decoration — they're what decide
whether a decision interrupts. That's the core move: **the agent's uncertainty,
not a fixed rule, chooses what surfaces.**

## Step 3 — The choreographed run

v1 stages the run as data
([`lib/script.ts`](../examples/03-agent-walkthrough/lib/script.ts)): a flat list of
events — `phase`, `decision` (a receipt), `checkpoint` (with a `block` level), and
`done`. The `block` level encodes the confidence gate declaratively:

- `always` — phase gates, and things a human *must* decide (the illegible #19).
- `gated` — blocks unless the dial is at full autonomy (the #12 and Meridian and
  #22 judgment calls).
- `oversight` — blocks only at the most cautious setting (the blank-governing-law
  assumption on #3).

Scripting first is deliberate: the trust beats *are* the deliverable, so we make
them deterministic before wiring a live agent. The event stream is identical to
what a live run would emit.

## Step 4 — The player: stream until something should stop you

[`lib/run.ts`](../examples/03-agent-walkthrough/lib/run.ts) plays the script into an
AI SDK UI-message stream. Its whole job is the gate:

```ts
if (shouldBlock(e.block, dial)) {
  if (e.pendingDecision) write the decision as `pending`
  write the checkpoint          // ← the run stops here
  state.cursor = i + 1;         // remember where to resume
  return;
}
// otherwise: auto-resolve on the agent's own lean and keep going
autoResolve(writer, e);
```

`shouldBlock` is the entire trust-dial mechanism:

```ts
always    → true
gated     → dial !== "autonomy"
oversight → dial === "oversight"
```

So the *same script* produces six checkpoints at Balanced, more at Oversight, and
only the hard blocker + gates at Autonomy — where the gated decisions stream past
as `auto-resolved` receipts (flagged amber, still auditable). That's the dial
turning validation cost up and down.

## Step 5 — Pause and resume

There's no long-lived connection. A checkpoint **ends the turn**; the server
records `cursor` in an in-memory session. When the user acts, the client sends the
resolution in the next request's `body`
([`app/page.tsx`](../examples/03-agent-walkthrough/app/page.tsx)):

```ts
sendMessage({ text: "resolve" }, { body: { sessionId, dial, resolution } });
```

The server applies the resolution, then continues from `cursor`. (In production
this is exactly the seam where LangGraph's `interrupt()`/resume or the AI SDK
tool-approval flow lives — the model here already matches it.)

## Step 6 — Policy promotion: the sublinear moment

This is the centerpiece. The Meridian checkpoint carries `dependents` — the 8
decision ids sharing the wording. When the user picks an interpretation,
`applyResolution` in [`lib/run.ts`](../examples/03-agent-walkthrough/lib/run.ts)
emits **one policy part and eight decision-update parts**:

```ts
write data-policy   { rule, count: 8, appliesTo: "Meridian" }
for (id of dependents) write data-decisionUpdate { id, patch: { decided, status: "policy-applied" } }
```

On the client, [`lib/ledger.ts`](../examples/03-agent-walkthrough/lib/ledger.ts)
folds those updates over the existing rows — so all 8 ledger entries visibly rewrite
themselves and the sidebar shows **"1 decision → 8 resolved."** One human action
retired eight validations. Do that across a 300-lease portfolio and the user's
effort barely moves — which is the whole thesis, made literal.

## Step 7 — The ledger, and what "trust" means

[`components/DecisionLedger.tsx`](../examples/03-agent-walkthrough/components/DecisionLedger.tsx)
renders every decision — auto receipts quiet, anything that needed the user
highlighted, evidence one click away. The **"Needed you"** filter is the point in
miniature: trust doesn't mean *review everything*, it means *the things that needed
you are findable, and the rest are sampleable*. The auto-decisions aren't hidden;
they're just not in your face.

## Step 8 — Phases and the gate

[`components/Sidebar.tsx`](../examples/03-agent-walkthrough/components/Sidebar.tsx)
tracks the three phases; the gate checkpoints at each boundary are `always`-block.
Gating the phase boundary is what stops a wrong triage call from silently poisoning
27 deep reads — you confirm the shape of the work before the agent invests in it.

## What to take to the other examples

- **Surface decisions, not just answers**, and let **confidence gate** which ones
  interrupt. This is the reusable core.
- **Promote corrections to policies.** Whenever a fix generalizes to a class,
  resolving the class in one action is what keeps validation sublinear.
- **Gate the phases** so errors are caught before they compound.
- **Give the user the dial.** The trust/productivity trade-off isn't yours to hard-
  code — it's a control the user turns as their trust and the risk change.
- **Pause/resume is just data.** A checkpoint that ends the turn plus a resolution
  in the next request is enough to build human-in-the-loop on the AI SDK; swap in
  LangGraph `interrupt()` when you need durable threads.
