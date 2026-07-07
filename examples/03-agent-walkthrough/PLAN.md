# Example 03 (planning) — Working in the Open

> **Status: plan, not built.** This doc frames the problem, lays out scenario and
> UX options, recommends an approach, and defines the build. Nothing here is code
> yet — it's the thing to agree on before writing any.

## Reframing this example

The top-level [README](../../README.md) sketched 03 as *"Agent Walkthrough —
trajectory replay,"* i.e. scrub back through a finished run. That's too passive for
what matters. The sharper goal:

> When an agent makes **many implicit decisions** across a **lengthy analysis of a
> large corpus**, it must reveal those decisions **incrementally and live** — get
> the consequential ones validated as it goes, so trust is built along the way and
> the human never faces a 30-minute wall of unaudited conclusions.

So 03 becomes **live, incremental decision surfacing with checkpoints** — and it
pulls the human-in-the-loop idea forward from example 06. (06 stays: it's about
approving an *external action*. 03 is about validating *analytical decisions*
mid-flight. Same machinery, different object.)

## The problem, precisely

An agent working over a big corpus doesn't make one decision — it makes hundreds
of small, mostly-invisible ones. Four things go wrong if they all surface only at
the end:

1. **Deferred validation.** A wall of findings arrives at once. The user must
   validate all of it, cold, against a corpus they haven't held in their head.
2. **Implicit decisions are invisible.** The output shows conclusions, not the
   judgment calls behind them ("I read this clause as calendar months," "I treated
   these 12 docs as superseded"). The user can't validate what they can't see.
3. **Errors compound.** A wrong call at decision 3 silently poisons decisions
   4–300. Catching it at the end means redoing the downstream work.
4. **Trust can't calibrate.** With no incremental track record, the user has no
   basis to decide how much to trust the whole — so they either rubber-stamp
   (dangerous) or re-check everything (defeats the point).

### The productivity paradox

The naive fix — "ask the user to approve everything" — is just as bad. Interrupt
on every trivial decision and you've rebuilt the manual process with extra steps.

> **The real design goal: make the user's validation effort grow *sublinearly*
> with the corpus.** A 30-lease analysis and a 300-lease analysis should cost the
> user roughly the same number of decisions to trust.

Everything below is in service of that one goal. Four levers get us there:

- **Confidence-gating** — only *uncertain or high-impact* decisions interrupt.
- **Policy promotion** — one correction resolves a whole *class* of decisions.
- **Phase gates** — catch compounding errors at boundaries, before they spread.
- **Auditable receipts** — the auto-decisions are logged and spot-checkable, so
  "trust" doesn't mean "review," it means "sample and move on."

## Design principles

1. **Surface decisions, not just answers.** The unit of the UI is a *decision*
   (what was decided, why, on what evidence, how confidently) — not a finding.
2. **Confidence gates the interruption.** The agent self-scores each decision.
   High-confidence → silent receipt. Low-confidence / high-impact → blocking
   checkpoint. Nothing else stops the user.
3. **Steer, don't just approve.** A checkpoint offers Approve / Correct / Set a
   policy — not a yes/no. Correction feeds back into the run.
4. **One fix, one class.** When a correction generalizes ("business days, not
   calendar"), promote it to a standing policy the agent applies to every matching
   decision, retroactively and going forward. This is what makes validation
   sublinear.
5. **Gate the phases.** The agent works in phases; each boundary is a natural
   batch-approval point that stops a bad assumption from compounding.
6. **Keep a navigable ledger.** Every decision — auto or checkpointed — lands in a
   running, filterable log with status and a jump-to-evidence link.
7. **Expose the trust dial.** The user sets how aggressively the agent interrupts
   (from "only blockers" to "narrate everything"), and can move it mid-run as
   trust grows or a section gets risky.

## Scenario options

We need a domain with: a genuinely large corpus, many *implicit and consequential*
decisions, decisions that **compound**, real ambiguity (so confidence varies), and
enough legibility that a demo audience gets it without domain training.

### Option A — Lease-portfolio exit analysis  ★ recommended
*"We may shrink our footprint. Across our 30-property lease portfolio, which
leases can we exit in the next 18 months, by when, and at what cost?"*

The agent reads 30 leases (+ amendments) and, per property, decides: which
document is operative, whether an exit mechanism exists, how to read the notice
requirement, the earliest exit date, and the penalty.

- **Corpus:** 30 properties × (lease + 0–2 amendments), short synthetic docs.
- **Implicit decisions with texture:**
  - *Scoping:* #12 has an original + two amendments — which rent/term is operative?
  - *Interpretation (compounds!):* #7 says "six months' notice" — calendar or
    business months? The **same landlord's wording appears in 8 leases**, so one
    policy call resolves 8 at once.
  - *Assumption:* #3's governing law is blank → assume the property's state.
  - *Extraction (low-confidence → blocker):* #19's penalty depends on a rent figure
    that's illegible in the scan.
  - *Classification (low-confidence → blocker):* is #22's "surrender for
    convenience with landlord consent" a real exit option or not?
- **Why it wins:** richest mix of decision *types*, a vivid compounding case, a
  natural policy-promotion moment, and legible stakes. The user validates ~6
  decisions to trust a 30-lease analysis.

### Option B — Transaction / expense-policy audit
*"Review this quarter's 4,000 expense line items and flag policy violations."*

- **Corpus:** thousands of transactions — big, so the sublinear-validation story is
  the most dramatic.
- **Decisions:** interpreting an ambiguous policy, materiality thresholds,
  category judgment, duplicate detection.
- **Why consider it:** best for demonstrating *scale* and *policy promotion* (one
  ruling on "are team lunches over $N a violation?" clears hundreds). Weaker on
  compounding and on decision *variety* — the calls are more repetitive.

### Option C — Data-room / M&A due-diligence memo
*"Read the target's data room and draft the diligence findings."*

- **Corpus:** hundreds of heterogeneous docs.
- **Decisions:** which figures are authoritative, normalizing across periods,
  materiality, related-party flags.
- **Why consider it:** highest stakes and most "enterprise." But less legible to a
  general audience and the decisions are harder to make crisp in a demo.

**Recommendation: Option A**, with the transaction-audit (B) *style* of
policy-promotion baked in via the 8-leases-one-landlord mechanic. If you'd rather
foreground raw scale over decision variety, switch to B.

## Taxonomy of implicit decisions (what the UI must handle)

The checkpoint/receipt card is the same component across all of these; only the
content differs. Naming them makes the agent's `kind` field and the UI filters:

| Kind | Example | Typical confidence |
|------|---------|--------------------|
| **Scope** | which doc is operative; which items are in-corpus | usually high, occasionally a blocker |
| **Interpretation** | "six months" = calendar vs business | medium — prime policy-promotion candidate |
| **Assumption** | governing law not stated → assume state | medium |
| **Extraction** | pull the current rent from a messy scan | varies; low when source is degraded |
| **Classification** | is this a real exit option? severity? | varies |
| **Prioritization** | what's material enough to surface first | high, but worth a receipt |

## UX pattern options

Five building blocks. The recommendation is a specific *combination*, not one.

1. **Blocking checkpoints ("stop-and-ask").** Agent halts, user must respond.
   Max trust, min throughput. Right for the *few* pivotal decisions — wrong as the
   default.
2. **Non-blocking receipts ("narrated decisions").** Agent keeps working and
   streams a live ledger; the user watches and *may* intervene. Preserves
   throughput; steer by exception. Right for the *many* routine decisions.
3. **Confidence-gated hybrid.** The agent's confidence picks 1 vs 2 per decision.
   This is the core mechanism — it's what makes "surface the right decisions"
   automatic rather than a guess.
4. **Phase gates.** Batch-approve at phase boundaries (triage → deep-read →
   synthesis). Fewer, well-timed interruptions; stops compounding at the seams.
5. **Policy learning.** A correction can be promoted to a standing rule applied to
   the whole matching class, retroactively. The sublinear-validation engine.

**Recommended combination:** **3 + 4 + 5.** Confidence-gating decides what
interrupts *within* a phase; phase gates provide the structured batch-approvals
*between* phases; policy promotion makes each correction pay for itself many times
over. Non-blocking receipts (2) are the default rendering for everything that
doesn't trip a gate; blocking checkpoints (1) are what a tripped gate produces.

### The trust dial

A single control that sets the confidence threshold for interrupting:

```
 only blockers ─────●──────────── narrate everything
 (high autonomy)                  (high oversight)
```

Start conservative (more oversight) and let the user relax it as the agent earns
trust within the run — or tighten it when entering a riskier section. This makes
the trust/productivity trade *the user's dial to turn*, which is the whole thesis.

## The interaction, walked through (Option A)

1. **Kickoff.** User submits the task and picks a trust-dial setting. Agent states
   its plan: *"3 phases: triage 30 leases → deep-read the exitable ones →
   synthesize a ranked exit plan."*
2. **Phase 1 — Triage (mostly receipts).** Decisions stream into the ledger:
   *"#1 operative doc = 2021 lease (conf 0.96) ✓ auto,"* … For #12 the operative-doc
   call is ambiguous *and* high-impact (everything downstream depends on it) → it
   **blocks**: a checkpoint card with the three candidate docs and the agent's
   lean. User approves. Two more low-confidence triage items block; the rest auto.
3. **Phase gate 1.** *"27 leases have an exit mechanism, 3 don't. Deep-read the
   27?"* One batched confirmation. Compounding stops here: nothing proceeds on a
   bad triage.
4. **Phase 2 — Deep read (the policy moment).** On #7 the agent flags *"'six
   months' notice' — I read this as calendar months (conf 0.55)."* User corrects to
   **business** and clicks **"apply to all leases with this wording."** The ledger
   shows **8 decisions updated at once**; validation just went sublinear. The
   illegible-rent extraction on #19 blocks; user supplies the figure.
5. **Phase gate 2.** Agent shows the exit table (date + cost per lease) for a batch
   glance before synthesis.
6. **Phase 3 — Synthesis.** Prioritization decisions surface as receipts; final
   ranked plan renders. Every number links back to the decision and the source
   span behind it.
7. **The payoff.** The user made ~6 real decisions, resolved a class of 8 with one
   click, and watched a track record accrue — instead of validating 30 leases cold.

## Tech approach

### Stack continuity
Same spine as 01/02: **Next.js + Vercel AI SDK + Anthropic**. This example uses the
**third streaming shape**: a `useChat` **UI message stream** carrying (a) narration
text, (b) typed `data-decision` receipt parts, (c) `data-phase` / `data-policy`
parts, and (d) **human-in-the-loop tool calls** for blocking checkpoints.

### Checkpoints = tool calls that need approval
The idiomatic AI SDK v5 path for blocking is a tool with approval. The agent calls
`propose_checkpoint({...decision})`; low-confidence/high-impact decisions set
`needsApproval`, which pauses the stream and renders the checkpoint card. The
user's Approve/Correct/Set-policy response becomes the tool result; the run
resumes. High-confidence decisions call a non-approving `record_decision` tool →
they just append to the ledger. Confidence-gating is literally "does this tool call
need approval."

### State & resume
The decision ledger, active phase, corpus cursor, and adopted policies are the
run's state. For the demo, carry it in the message history / a server-side session
keyed by thread id; note in the doc that production would persist a real thread
(LangGraph `interrupt()` is the natural fit and maps 1:1 onto this design).

### Mock-first choreography (primary artifact)
As with 01/02, the **no-key mock is first-class** — and here it's the *main* way we
control the demo, because we want to choreograph the exact trust beats (the #12
blocker, the #7 policy moment, the phase gates). The mock is a scripted analysis
that emits the same part/tool stream a live agent would, at a realistic cadence,
and honors the user's checkpoint responses (approve → continue; correct+promote →
rewrite the 8 dependent ledger entries live). A live mode runs a real agent loop
over the small corpus for authenticity.

### Components (new reusable primitives)
- `DecisionLedger` — the running, filterable log (by kind / status / confidence).
- `DecisionReceipt` — one non-blocking decision row (kind, one-liner, confidence,
  jump-to-evidence).
- `CheckpointCard` — the blocking card: decision + evidence + Approve / Correct /
  **Set policy**.
- `PhaseTimeline` — phases with progress and the batch gate.
- `PolicyBanner` — "1 correction → 8 decisions updated," the sublinear moment made
  visible.
- `TrustDial` — the autonomy/oversight control.
- `ConfidenceBadge` — shared with the receipts and cards.

### Data model (sketch)
```ts
type DecisionKind = "scope" | "interpretation" | "assumption"
                  | "extraction" | "classification" | "prioritization";
interface Decision {
  id: string; phase: number; kind: DecisionKind;
  subject: string;              // "Lease #7 — notice period"
  decided: string;              // "read as calendar months"
  rationale: string; evidenceRef: string;  // → source span
  confidence: number;           // 0..1, gates blocking
  impact: "low" | "med" | "high";
  status: "auto" | "pending" | "approved" | "corrected" | "policy-applied";
}
interface Policy { id: string; rule: string; appliesTo: string; fromDecision: string; }
```

## Build plan / milestones

1. **Corpus + script.** Author the 30-lease synthetic corpus with the planted
   ambiguities (#7 landlord-wording class, #12 operative-doc, #19 illegible, #22
   judgment) and the choreographed decision script for the mock.
2. **Ledger + receipts, streaming.** `useChat` stream of `data-decision` parts →
   `DecisionLedger`. Get the non-blocking narration feel right first.
3. **Checkpoints.** Add the approval-tool path + `CheckpointCard` with
   Approve/Correct. Verify pause/resume.
4. **Policy promotion.** "Set policy" → retroactively rewrite the dependent ledger
   entries live; `PolicyBanner`. This is the demo's centerpiece — build it
   deliberately.
5. **Phases + trust dial.** `PhaseTimeline` gates and the `TrustDial` threshold.
6. **Live mode + docs.** Wire the real agent loop; write the README + walkthrough.

## Open questions for you

These change what I build, so I'd like your call before coding — see the questions
alongside this plan. In short: **(1)** which scenario (A lease exit / B expense
audit / C diligence); **(2)** the default posture (confidence-gated hybrid vs.
something more or less aggressive); **(3)** v1 scope (mock-choreographed only, or
mock + live agent).
