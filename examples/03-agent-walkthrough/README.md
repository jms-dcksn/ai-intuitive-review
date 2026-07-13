# 03 · Working in the Open

An agent analyzes a 30-lease portfolio for exit options and **surfaces its
consequential decisions as it works** — instead of dropping a 30-minute wall of
conclusions you'd have to validate cold. You approve, correct, or set a policy
that resolves a whole class at once. A **trust dial** sets how much it stops you.

The trust question this answers: **"don't make me validate 300 implicit decisions
at the end — work with me as you go."**

```
 TRUST DIAL:  ( Oversight ) [ Balanced ] ( Autonomy )

 ┌ NEEDS YOUR CALL · resolves 8 at once ───────────────────┐
 │ "Six months' notice" is ambiguous — and it's in 8 leases │
 │ §12.2 …not less than six (6) months' notice…             │
 │  [ calendar months · agent's lean ]  [ business months ] │
 └──────────────────────────────────────────────────────────┘
 Decision ledger — 59 decisions          Phases  ● Deep read
 interpretation  #7 notice     55%  policy   Policies adopted
 interpretation  #11 notice    55%  policy   1 decision → 8 resolved
 scope           #12 operative 50%  approved  Read Meridian 'months'
 scope           #13 …         96%  auto       as business months
 …
```

## The idea

A long analysis over a big corpus isn't one decision — it's hundreds of small,
mostly-invisible ones (which document is operative, how an ambiguous clause reads,
what to assume for a blank field). Dump them all at the end and the user must
validate everything at once, cold — which destroys the productivity the agent was
supposed to create. But interrupting on *every* decision is just as bad.

**The goal: make the user's validation effort grow sublinearly with the corpus.**
Four levers get there, all visible in this demo:

- **Confidence-gating** — only uncertain / high-impact decisions interrupt; the
  rest stream as auditable receipts.
- **Phase gates** — batch approvals at phase boundaries stop a bad call from
  compounding downstream.
- **Policy promotion** — one correction resolves a whole class (here, 8 leases with
  identical wording) and rewrites their ledger rows live.
- **The trust dial** — the user sets the autonomy/oversight threshold, and can move
  it mid-run.

See [`PLAN.md`](./PLAN.md) for the full design rationale.

## Stack

- **Next.js** + **React** + **TypeScript**
- **Vercel AI SDK** (`useChat` + `createUIMessageStream`) — the **third** streaming
  shape in this repo: a stream of typed data parts (`data-decision`,
  `data-checkpoint`, `data-decisionUpdate`, `data-policy`, `data-phase`) that the
  client folds into a live decision ledger.
- **Human-in-the-loop via pause/resume:** a checkpoint ends the turn; the user's
  resolution rides the next request's `body`, and the server resumes the run.

This is the same `useChat` + custom-data-parts spine as example 01, extended to a
stateful, multi-turn, interruptible run.

## Run it

```bash
cd examples/03-agent-walkthrough
npm install
npm run dev        # http://localhost:3000
```

**Two modes, same UI:**

- **No key → choreographed mock.** Deterministic, staged to hit the exact trust
  beats (the `#12` blocker, the 8-lease policy moment, the phase gates). This is
  the primary artifact — it lets us control the demo precisely.
- **`ANTHROPIC_API_KEY` set → live agent.** Copy `.env.example` to `.env.local`,
  add a key, and the same UI runs a **real agent loop** that reads the corpus and
  scores each decision itself. The gate is identical (`lib/gate.ts` is shared),
  so which calls interrupt now falls out of the model's own confidence + impact
  rather than a script. Optionally set the `LANGSMITH_*` vars to trace every run.

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY for live mode
```

## What to try

1. **Start analysis** (dial on *Balanced*). Watch triage decisions stream into the
   ledger; the agent stops you at **#12** — three documents on file, which is
   operative? Approve its lean.
2. Pass the **phase gate** into deep read.
3. Hit the **Meridian checkpoint**: the same "six months' notice" wording is in 8
   leases. Pick **business months** → the sidebar shows **"1 decision → 8
   resolved"** and all 8 rows rewrite live. *That's the sublinear moment.*
4. **#19** blocks unconditionally — an illegible figure the agent won't guess.
   Supply it.
5. **#22** is a judgment call (a consent-gated surrender). Exclude it.
6. Pass the second gate → the ranked plan. You made ~6 calls to trust a 30-lease
   analysis of 59 decisions.
7. Now **Restart on *Autonomy*** — only the hard blocker (#19) and the phase gates
   stop you; the judgment calls auto-resolve (flagged amber for audit). Restart on
   **Oversight** to see even the blank-governing-law assumption ask first.
8. Use the ledger's **"Needed you"** filter — the whole point is you can audit just
   the decisions that mattered.

## Files

| File | Role |
|------|------|
| `lib/corpus.ts` | The 30 leases + planted ambiguities |
| `lib/script.ts` | The choreographed event list (phases, receipts, checkpoints) for the mock |
| `lib/run.ts` | Mock player: streams until a checkpoint blocks; resumes on resolution |
| `lib/agent.ts` | **Live agent**: real per-item model loop (`generateObject`) over the corpus, same beats, traced |
| `lib/gate.ts` | The shared gate — `shouldBlock` (verbatim across both modes) + confidence→`BlockLevel` |
| `lib/thread.ts` | Durable, server-authoritative thread store + the recorder that mirrors every part into it |
| `lib/ledger.ts` | Client reducer: parts → decision ledger |
| `lib/types.ts` | Decision / Checkpoint / Policy model + typed message |
| `app/api/analyze/route.ts` | `createUIMessageStream` endpoint (mock vs live) + GET rehydrate |
| `instrumentation.ts` | Wires AI SDK telemetry → LangSmith (live-mode tracing) |
| `components/CheckpointCard.tsx` | The blocking approve / correct / set-policy card |
| `components/DecisionLedger.tsx` | The live, filterable ledger |
| `components/Sidebar.tsx` | Trust dial · phase timeline · policy banner |
| `app/page.tsx` | Orchestration + pause/resume wiring |

Full step-by-step:
[`../../walkthroughs/03-working-in-the-open.md`](../../walkthroughs/03-working-in-the-open.md).

## How the live agent works

The live loop (`lib/agent.ts`) walks the **same linear plan of beats** as the mock
(triage → deep-read → synthesis, with the Meridian class and the phase gates), but
fills each decision's content with a real `generateObject` call that self-scores
confidence, impact, and evidence. `lib/gate.ts` turns those numbers into whether a
call interrupts — so confidence-gating is genuine, not staged. Two design calls
from [`PLAN.md`](./PLAN.md) are realized:

- **No LangGraph.** The interrupt is `return` + a saved cursor in a durable thread
  (`lib/thread.ts`), and a resolution is a fresh POST that re-enters and resumes.
  The thread holds the **authoritative ledger**, so a page refresh rehydrates
  (`GET /api/analyze`) instead of losing everything.
- **LangSmith tracing.** `traceable` wraps the run loop and each `decideOne` (the
  gate outcome — confidence, impact, whether it blocked — is attached as span
  metadata), and `AISDKExporter` nests the model spans underneath. Enabled by env
  vars only; a no-op when unset.

## Notes & next steps

- **Why a mock *and* a live agent?** The trust beats *are* the demo, so the mock
  stays first-class — it's how we choreograph them deterministically. The part
  stream and the client are identical across both modes; only the source of each
  decision differs (script vs. model).
- **Production HITL & durability.** The thread store is an in-memory `Map` — a
  demo-grade stand-in. It's a *persistence* choice, not a framework one: swap it
  for a Postgres/Redis row keyed by `sessionId` and nothing in the agent changes.
- **Relationship to 06.** This is human-in-the-loop for *analytical decisions*;
  example 06 applies the same machinery to approving an *external action*.
