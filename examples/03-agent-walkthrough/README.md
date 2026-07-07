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

v1 is a **choreographed run** — no model key needed. It's staged to hit the exact
trust beats deterministically (the `#12` blocker, the 8-lease policy moment, the
phase gates). A live agent loop is the documented next step.

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
| `lib/script.ts` | The choreographed event list (phases, receipts, checkpoints) |
| `lib/run.ts` | Server player: streams until a checkpoint blocks; resumes on resolution; confidence-gating + policy promotion |
| `lib/ledger.ts` | Client reducer: parts → decision ledger |
| `lib/types.ts` | Decision / Checkpoint / Policy model + typed message |
| `app/api/analyze/route.ts` | `createUIMessageStream` endpoint |
| `components/CheckpointCard.tsx` | The blocking approve / correct / set-policy card |
| `components/DecisionLedger.tsx` | The live, filterable ledger |
| `components/Sidebar.tsx` | Trust dial · phase timeline · policy banner |
| `app/page.tsx` | Orchestration + pause/resume wiring |

Full step-by-step:
[`../../walkthroughs/03-working-in-the-open.md`](../../walkthroughs/03-working-in-the-open.md).

## Notes & next steps

- **Why choreographed first?** The trust beats *are* the demo; scripting them makes
  the experience deterministic and reviewable before wiring a live agent. The part
  stream and the client are identical to what a live run would emit.
- **Production HITL.** The pause/resume here is deliberately simple (a checkpoint
  ends the turn; the resolution rides the next request). In production this is
  exactly where **LangGraph `interrupt()`** or the **AI SDK tool-approval** flow
  fits — the data model already matches.
- **Relationship to 06.** This is human-in-the-loop for *analytical decisions*;
  example 06 applies the same machinery to approving an *external action*.
