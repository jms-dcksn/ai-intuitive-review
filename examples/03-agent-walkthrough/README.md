# 03 · Working in the Open — clinical chart review

An agent reviews a patient chart ahead of tomorrow's visit and **surfaces its
consequential decisions as it works** — instead of dropping a wall of
conclusions you'd have to validate cold. Each decision pairs the **verbatim
source excerpts** it rests on with a recommendation and its rationale; you
agree or overrule in seconds, and every citation opens the full document with
the exact span highlighted. A **trust dial** sets how much it stops you.

The trust question this answers: **"don't make me validate everything at the
end — work with me as you go, and show me your sources."**

```
 ┌ NEEDS YOUR CALL · one call resolves 3 records ──────────────────┐
 │ The medication list and the discharge summary disagree          │
 │ ┌ ACTIVE MEDICATION LIST · 3 months ago ────── open source ↗ ┐  │
 │ │ "Lisinopril 20 mg PO daily — active"                       │  │
 │ └─────────────────────────────────────────────────────────────┘ │
 │ ┌ DISCHARGE SUMMARY · 12 days ago ──────────── open source ↗ ┐  │
 │ │ "Lisinopril — HELD on admission for AKI. NOT restarted."   │  │
 │ └─────────────────────────────────────────────────────────────┘ │
 │ RECOMMENDATION  Treat the discharge summary as current.         │
 │ [ Agree — discharge summary governs ] [ Disagree — keep list ]  │
 └──────────────────────────────────────────────────────────────────┘
 Rules you set: 1 decision → 3 records resolved
```

## The idea

A long analysis over a corpus isn't one decision — it's dozens of small,
mostly-invisible ones (which record is current, whether a result needs action,
how a conflict resolves). Dump them all at the end and the user must validate
everything at once, cold. Interrupt on *every* one and you've rebuilt the
manual process. This demo keeps the interruptions to **three decisions that
build on each other**:

1. **The record conflict** — the EHR med list (3 months old) and the discharge
   summary (12 days old) disagree about lisinopril. Agreeing with the agent's
   recommendation promotes a rule — *the discharge summary governs* — that
   reconciles two more discrepancies live: **1 decision → 3 records**.
2. **The clinical flag** — *because* the discharge summary governs, she resumed
   metformin at 1000 mg BID; the new labs put her eGFR at 38 and falling. The
   card explicitly cites the chain back to decision 1. The agent flags the
   dose for the visit agenda — it recommends, the physician decides.
3. **The safety blocker** — her intake form says "penicillin — rash," the chart
   says NKDA, and she just completed a penicillin-class antibiotic. The agent
   **won't adjudicate an allergy record at any dial setting** — some calls are
   gated by category, not confidence.

Everything else (~10 routine checks) streams into the ledger as auditable
receipts with one-click sources — "trust" means *able to check*, not *must
check*. The payoff is a ranked **visit brief** where every line links back to
its decision and its source span.

All chart content is synthetic — no real patient, clinician, or facility.

## Stack

- **Next.js** + **React** + **TypeScript**
- **Vercel AI SDK** (`useChat` + `createUIMessageStream`) — a stream of typed
  data parts (`data-decision`, `data-checkpoint`, `data-decisionUpdate`,
  `data-policy`, `data-phase`, `data-done`) the client folds into a live
  decision ledger.
- **Human-in-the-loop via pause/resume:** a checkpoint ends the turn; the
  user's resolution rides the next request's `body`, and the server resumes
  the run from a durable cursor.

## Run it

```bash
cd examples/03-agent-walkthrough
npm install
npm run dev        # http://localhost:3000
```

**Two modes, same UI:**

- **No key → choreographed mock.** Deterministic, staged to hit the exact
  trust beats. This is the primary artifact — it lets us control the demo
  precisely.
- **`ANTHROPIC_API_KEY` set → live agent.** The same UI runs a real agent loop
  that reads the chart documents and scores each decision itself. The gate is
  identical (`lib/gate.ts` is shared), so which calls interrupt falls out of
  the model's own confidence + impact — plus structural category floors
  (safety always blocks) and ceilings (routine checks never gate the run).
  Optionally set the `LANGSMITH_*` vars to trace every run.

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY for live mode
```

## What to try

1. **Start the chart review** (dial on *Balanced*). Routine checks stream into
   the ledger; the agent stops you at the **medication record conflict**. Read
   the two excerpts, click **open source ↗** to see the full discharge summary
   with the span highlighted, then **Agree** — watch the sidebar show
   **"1 decision → 3 records resolved"** and the two pending rows rewrite live.
   *That's the sublinear moment.*
2. The **metformin dose flag** stops you next — note the green *"builds on
   your call"* line: this decision exists because of the one you just made.
3. The **allergy conflict** blocks in red. Three records can't all be right;
   the agent states its lean but won't touch a safety record alone.
4. Pass the single gate → the ranked **visit brief**, every line with a
   source link. You made 3 calls (+1 go-ahead) to trust a full chart review.
5. **Restart on *Autonomy*** — decisions 1–2 auto-resolve on the agent's lean
   (amber, audit-worthy), but the allergy conflict *still* blocks. Restart on
   **Oversight** and even the dizziness judgment call asks first.
6. Use the ledger's **"Needed you"** filter — audit only the decisions that
   mattered.

## Files

| File | Role |
|------|------|
| `lib/chart.ts` | The patient chart: 7 full-text synthetic documents with highlight spans; every snippet is extracted verbatim from these |
| `lib/script.ts` | The choreographed event list (receipts, checkpoints, brief) for the mock |
| `lib/run.ts` | Mock player: streams until a checkpoint blocks; resumes on resolution |
| `lib/agent.ts` | **Live agent**: real per-decision model loop over the chart, same beats, traced |
| `lib/gate.ts` | The shared gate — `shouldBlock` (verbatim across both modes) + confidence→`BlockLevel` |
| `lib/resolve.ts` | Applying a checkpoint outcome to the ledger (shared verbatim, like the gate) |
| `lib/thread.ts` | Durable, server-authoritative thread store + the recorder that mirrors every part into it |
| `lib/ledger.ts` | Client reducer: parts → decision ledger |
| `lib/types.ts` | Decision / Checkpoint / Evidence model + typed message |
| `app/api/analyze/route.ts` | `createUIMessageStream` endpoint (mock vs live) + GET rehydrate |
| `instrumentation.ts` | Wires AI SDK telemetry → LangSmith (live-mode tracing) |
| `components/CheckpointCard.tsx` | The evidence-first blocking card: excerpts → recommendation → consequence-labeled buttons |
| `components/DocumentPanel.tsx` | Click any citation → the full document, scrolled to the highlighted span |
| `components/DecisionLedger.tsx` | The live, filterable ledger |
| `components/Sidebar.tsx` | Patient card · trust dial · progress · rules banner |
| `app/page.tsx` | Orchestration + pause/resume wiring |

Full step-by-step:
[`../../walkthroughs/03-working-in-the-open.md`](../../walkthroughs/03-working-in-the-open.md).

## How the live agent works

The live loop (`lib/agent.ts`) walks the **same linear plan of beats** as the
mock (reconcile → review → brief), but fills each decision's content with a
real `generateObject` call over the actual document text, self-scoring
confidence and impact. `lib/gate.ts` turns those numbers into whether a call
interrupts — so confidence-gating is genuine, not staged — while the
orchestration contributes what it knows *a priori*: the allergy conflict has a
structural floor (`always` blocks) and routine checks a structural ceiling
(at most the cautious dial asks). Checkpoint *options* — what agreeing or
overruling does to the ledger — stay structural in both modes; that's product
design, not model output. Two design calls from [`PLAN.md`](./PLAN.md):

- **No LangGraph.** The interrupt is `return` + a saved cursor in a durable
  thread (`lib/thread.ts`); a resolution is a fresh POST that re-enters and
  resumes. The thread holds the **authoritative ledger**, so a page refresh
  rehydrates (`GET /api/analyze`) instead of losing everything.
- **LangSmith tracing.** `traceable` wraps the run loop and each `decideOne`
  (the gate outcome — confidence, impact, whether it blocked — is span
  metadata), and `AISDKExporter` nests the model spans underneath. Enabled by
  env vars only; a no-op when unset.

## Notes & next steps

- **Why a mock *and* a live agent?** The trust beats *are* the demo, so the
  mock stays first-class — it's how we choreograph them deterministically. The
  part stream and the client are identical across both modes; only the source
  of each decision differs (script vs. model).
- **Production HITL & durability.** The thread store is an in-memory `Map` — a
  demo-grade stand-in. Swap it for a Postgres/Redis row keyed by `sessionId`
  and nothing in the agent changes.
- **Relationship to 06.** This is human-in-the-loop for *analytical
  decisions*; example 06 applies the same machinery to approving an *external
  action*.
