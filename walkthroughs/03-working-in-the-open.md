# Walkthrough 03 — Working in the Open (clinical chart review)

> Code: [`examples/03-agent-walkthrough`](../examples/03-agent-walkthrough) ·
> Design rationale: [`PLAN.md`](../examples/03-agent-walkthrough/PLAN.md)

Examples 01 and 02 made a *finished* answer trustworthy. This one makes the
*process* trustworthy — because when an agent works over a corpus, the finished
answer arrives too late and too dense to validate. The trust has to be built
while the work happens, and each moment of it has the same anatomy: **a verbatim
source excerpt, paired with a recommendation and its rationale, closed by the
user's agree/disagree.**

## The problem in one line

> An agent's analysis is dozens of small, mostly-invisible decisions. Reveal
> them all at the end and you've handed the user an unauditable wall; interrupt
> on every one and you've rebuilt the manual process. The design goal is to make
> the user's validation effort grow **sublinearly** with the corpus.

## The shape of the run

A physician has a post-discharge follow-up visit tomorrow. The agent reviews the
patient's 7-document chart tonight — discharge summary, EHR med list, labs,
cardiology consult, patient intake form, prior visit note, chest X-ray — and
prepares a visit brief. Routine checks stream by as **receipts**; exactly three
decisions become **checkpoints**, and they build on each other:

```
 Start ─► Reconcile medications ─[1 record conflict]─► Review results
             receipts…                                    receipts…
                            [2 clinical flag (builds on 1)] [3 safety blocker]
                                          └─► [gate] ─► Visit brief ─► Done
```

1. **Record conflict.** The med list (3 months old) says lisinopril is active;
   the discharge summary (12 days old) says it was held and never restarted.
   Which record governs?
2. **Clinical flag.** *Because* the discharge summary governs, she resumed
   metformin at 1000 mg BID — and the new labs put her eGFR at 38 and falling.
3. **Safety blocker.** Intake says "penicillin — rash"; the chart says NKDA;
   she just completed a penicillin-class antibiotic. The agent won't touch an
   allergy record alone.

## Step 1 — The corpus is real documents, and snippets can't lie

[`lib/chart.ts`](../examples/03-agent-walkthrough/lib/chart.ts) holds seven
short but *complete* synthetic documents, with the load-bearing spans marked
inline (`⟦hl:lisinopril-held⟧…⟦/hl⟧`). The one hard rule: **every evidence
snippet in the app is extracted verbatim from a document** via `evidenceFor()`,
which throws if the span doesn't exist. There is no snippet that isn't backed by
a document you can open.

That's what makes "clearly citing a source" literal:
[`components/DocumentPanel.tsx`](../examples/03-agent-walkthrough/components/DocumentPanel.tsx)
opens the *full* document for any citation — from a checkpoint card, a ledger
receipt, or a brief line — scrolled to the highlighted span.

## Step 2 — Decisions are the unit, and confidence gates them

[`lib/types.ts`](../examples/03-agent-walkthrough/lib/types.ts) makes a
`Decision` the atom: `kind`, `subject`, `decided`, `rationale`, `evidence`,
`confidence`, `impact`, `status`. Confidence and impact decide whether a
decision interrupts — **the agent's uncertainty, not a fixed rule, chooses what
surfaces.** With one exception, and it's the interesting one: the allergy
conflict is `kind: "safety"` and blocks at **every** dial setting. Some calls
are gated by *category*, not confidence — autonomy is never for sale on a
safety record.

## Step 3 — The checkpoint card is evidence-first

[`components/CheckpointCard.tsx`](../examples/03-agent-walkthrough/components/CheckpointCard.tsx)
renders the trust transaction in a fixed order:

1. **The situation** — what the agent saw ("the two records disagree").
2. **The excerpts** — up to three document quotes, each with source, date, and
   an open-source link. For the record conflict you see both records side by
   side; for the safety blocker, all three contradicting spans.
3. **The recommendation** — the agent's lean and why, in its own block.
4. **Consequence-labeled buttons** — never a bare "Approve":
   *"Agree — treat the discharge summary as current"* vs
   *"Disagree — keep the medication list as the record."*

Each `CheckpointOption` carries everything choosing it does — the pending
decision's new text, an optional promoted rule, per-dependent ledger patches —
so the server applies an outcome by looking up the option, identically in both
modes ([`lib/resolve.ts`](../examples/03-agent-walkthrough/lib/resolve.ts)).

## Step 4 — The player: stream until something should stop you

[`lib/run.ts`](../examples/03-agent-walkthrough/lib/run.ts) plays the script
into an AI SDK UI-message stream. Its whole job is the gate:

```ts
if (shouldBlock(e.block, dial)) {
  if (e.pendingDecision) write the decision as `pending`
  write the checkpoint          // ← the run stops here
  state.cursor = i + 1;         // remember where to resume
  return;
}
// otherwise: the agent takes its own lean, amber in the ledger
autoResolve(rec, e.checkpoint);
```

`shouldBlock` ([`lib/gate.ts`](../examples/03-agent-walkthrough/lib/gate.ts))
is the entire trust-dial mechanism:

```ts
always    → true            // safety + the final gate
gated     → dial !== "autonomy"
oversight → dial === "oversight"
```

The *same script* produces three checkpoints at Balanced, four at Oversight
(the dizziness judgment call asks too), and only the safety blocker + gate at
Autonomy — where decisions 1–2 stream past as `auto-resolved` receipts (amber,
still auditable). That's the dial turning validation cost up and down.

## Step 5 — Pause and resume

There's no long-lived connection. A checkpoint **ends the turn**; the server
saves a cursor in a durable thread
([`lib/thread.ts`](../examples/03-agent-walkthrough/lib/thread.ts)) that also
mirrors every streamed part — the ledger is server-authoritative, so a page
refresh rehydrates via `GET /api/analyze` instead of losing the run. When the
user acts, the resolution rides the next request's `body`:

```ts
sendMessage({ text: "resolve" }, { body: { sessionId, dial, resolution } });
```

The server applies it and continues from the cursor. (In production this is
exactly the seam where LangGraph's `interrupt()`/resume or the AI SDK
tool-approval flow lives — the model here already matches it.)

## Step 6 — One decision, three records: the sublinear moment

The record-conflict checkpoint carries `dependents` — the metformin and
antibiotic discrepancies streamed as `pending` rows *before* the card appeared,
so you watched the open questions accumulate. Resolving it (either way!) emits
one policy part and patches all three:

```ts
write data-policy { rule: "…the discharge summary governs", count: 3 }
for (id of dependents) write data-decisionUpdate { id, patch: { decided, status: "policy-applied" } }
```

The client reducer
([`lib/ledger.ts`](../examples/03-agent-walkthrough/lib/ledger.ts)) folds the
updates over the existing rows — they visibly rewrite, and the sidebar shows
**"1 decision → 3 records resolved."** Scale the corpus and this is what keeps
the user's effort flat.

## Step 7 — Decisions that build on each other

The metformin card opens with a green chain line: *"Builds on your call: the
discharge summary is the current med record."* Its body spells the chain out —
you confirmed the record, the record says 1000 mg BID, the labs say eGFR 38,
guidance says reassess. This is the difference between an agent that narrates
findings and one that shows **which of your answers it's standing on** — an
error you make at decision 1 is visible, not buried, at decision 2.

The card also states the authority boundary: the agent puts dose reduction on
the *agenda*; it does not touch the dose. Recommend, don't prescribe.

## Step 8 — The ledger, and what "trust" means

[`components/DecisionLedger.tsx`](../examples/03-agent-walkthrough/components/DecisionLedger.tsx)
renders every decision — receipts quiet, anything that needed the user
highlighted, source one click away. The **"Needed you"** filter is the point in
miniature: trust doesn't mean *review everything*, it means *the things that
needed you are findable, and the rest are sampleable*. The run ends in a ranked
**visit brief** whose every line links back to its decision and source span —
including the one tension the agent deliberately *didn't* resolve (discharge
held the ACE inhibitor; cardiology wants one continued) because that's the
physician's call, and framing it as such is itself the trust behavior.

## The live agent

With `ANTHROPIC_API_KEY` set, [`lib/agent.ts`](../examples/03-agent-walkthrough/lib/agent.ts)
walks the same plan with a real `generateObject` call per decision, over the
actual document text. The model self-scores confidence and impact;
`levelFor` + `shouldBlock` (shared verbatim with the mock) decide what
interrupts. The orchestration contributes structural priors: the safety call
has a floor (`always`), routine checks a ceiling (at most Oversight asks), and
checkpoint options stay hand-designed — what agreeing does to the ledger is
product design, not model output. LangSmith tracing (env-var gated) records
every gate outcome as span metadata.

## What to take to the other examples

- **Pair every recommendation with its verbatim source**, and make the citation
  open the real document. A snippet that can't be clicked is an assertion; one
  that can is evidence.
- **Label buttons with consequences**, not verbs. "Approve" is a ritual;
  "Agree — treat the discharge summary as current" is a decision.
- **Promote corrections to rules.** Whenever a call generalizes, resolving the
  class in one action is what keeps validation sublinear.
- **Show the chain.** When decision N stands on decision N−1, say so on the
  card — that's how errors surface early instead of compounding silently.
- **Gate by category as well as confidence.** Some decisions (safety records)
  should ignore the dial entirely; users trust the dial *more* once they see
  it has limits.
- **Pause/resume is just data.** A checkpoint that ends the turn plus a
  resolution in the next request is enough for human-in-the-loop on the AI
  SDK; swap in LangGraph `interrupt()` when you need durable threads.
