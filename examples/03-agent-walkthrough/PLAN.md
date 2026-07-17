# Example 03 (v2 spec) — Working in the Open: Clinical Chart Review

> **Status: v2 built** (mock + live agent, verified end-to-end on all three
> dial settings). This spec replaced v1 (a 30-lease exit analysis), keeping the
> streaming/HITL architecture. The v1 design history and the two architecture
> decisions (no LangGraph; LangSmith tracing) are in git history — the
> decisions themselves carry forward unchanged, summarized at the bottom.
> Build deltas vs. this spec: options carry their consequences
> (`CheckpointOption.decided/policyRule/dependentPatches`) instead of a
> separate consequence enum; the live agent gained a structural block-level
> *ceiling* for routine checks (mirror of the safety floor) after live testing
> showed the model over-blocking agenda items; `lib/resolve.ts` was factored
> out so mock and live apply outcomes through one code path.

## Why respec

What v1 got right: the machinery. Pause/resume checkpoints, a decision ledger
folded from typed stream parts, a shared confidence gate across mock and live
modes, a durable server-authoritative thread. None of that changes.

What v1 got wrong: **legibility**. The demo is a wall of 59 ledger rows over 30
leases the viewer has no relationship with. Evidence is a one-line metadata
string, not a document. The user is asked to adjudicate "#12's operative
amendment" without ever seeing the documents. Six-plus interruptions and two
phase gates make it long, and the volume actively obscures the one idea that
matters:

> **Working in the open = the agent pairs a verbatim source excerpt with a
> recommendation and its rationale, and asks: do you agree?**

v2 optimizes for that transaction. Fewer decisions, each one rich: real
document excerpts you can read in five seconds, a plainly stated
recommendation, an explicit consequence on each button, and a visible payoff
when decisions build on each other.

## The new scenario

**Pre-visit clinical chart review.** A primary-care physician has a
post-discharge follow-up visit tomorrow. The agent reviews the patient's chart
tonight and prepares a visit brief — flagging only what needs the doctor's
judgment, logging every routine check as an auditable receipt.

Why this domain wins:

- **A chart is a genuinely heterogeneous small corpus** — discharge summary,
  med list, labs, consult note, intake form — where the interesting findings
  live *between* documents, not inside one. Cross-document conflict is the
  natural state of medical records.
- **The stakes are instantly legible.** Nobody needs training to understand
  "the med list and the discharge summary disagree about what she's taking."
- **The doctor is the perfect reviewer persona.** The agent recommends, the
  physician decides — the authority boundary is real, familiar, and it's
  exactly the trust relationship this repo is about.
- **Safety-critical records give an honest "won't guess" blocker** (the
  allergy conflict) without contrivance like v1's illegible scan.

Everything is synthetic. The patient, clinicians, and documents are invented;
a demo disclaimer ships in the UI footer and README.

## The patient chart (the corpus)

**Eleanor Vance, 68.** Type 2 diabetes, hypertension, CKD stage 3b. Discharged
12 days ago after community-acquired pneumonia complicated by acute kidney
injury. Follow-up visit tomorrow.

Seven documents, each with **full (short) document text** — 10–25 lines of
realistic content, not metadata one-liners. Every evidence snippet in the demo
is a verbatim span from one of these, and clicking any citation opens the full
document with the span highlighted.

| Doc | Title | Date | The load-bearing content |
|-----|-------|------|--------------------------|
| `discharge` | Hospital discharge summary | 12 days ago | CAP + AKI on CKD. **Lisinopril held, NOT restarted** — "resume pending renal recovery, re-evaluate at PCP follow-up." **Metformin resumed at 1000 mg BID.** Completed course: amoxicillin-clavulanate ×7 days. |
| `medlist` | Active medication list (EHR) | 3 months ago | **Still shows lisinopril 20 mg daily** and metformin 1000 mg BID; also amlodipine 5 mg, atorvastatin 40 mg, aspirin 81 mg. Stale — predates the admission. |
| `labs` | Basic metabolic panel + trend | 5 days ago | Creatinine 1.7, **eGFR 38** — trend 52 → 47 → 38 over 6 months. K 4.8. (HbA1c 8.1%, 3 months ago, shown in trend block.) |
| `cards` | Cardiology consult note | 4 months ago | "Continue ACE inhibitor for cardio-renal protection; consider SGLT2i at next review." — sets up the lisinopril tension for the brief. |
| `intake` | Patient intake form (patient-completed) | 6 days ago | **Allergies: "penicillin — rash as a child."** Also reports dizziness on standing since discharge. |
| `pcpnote` | Prior PCP visit note | 3 months ago | **Allergies: NKDA.** BP 138/84. "Recheck BMP in 3 months." |
| `imaging` | Chest X-ray report (discharge) | 13 days ago | "Improving right lower lobe consolidation; no follow-up imaging required." — pure receipt material. |

Implementation: `lib/chart.ts` replaces `lib/corpus.ts`. Each doc is
`{ id, title, date, body }` where `body` contains highlight markers
(`⟦hl:lisinopril-held⟧…⟦/hl⟧`) that the document panel resolves; evidence
references are `{ docId, spanId }` so a snippet is *always* extracted from the
real document text — the spec's one hard rule: **no snippet that isn't in a
document.**

## The run: 3 decisions that build on each other

One pass through the chart. ~14 routine receipts stream into the ledger
(examples: "Chest X-ray — no follow-up imaging required ✓", "BP controlled on
amlodipine, last 3 readings <140/90 ✓", "Statin/aspirin unchanged ✓",
"HbA1c 8.1% — added to visit agenda"). Three checkpoints interrupt. Then the
brief.

### Decision 1 — The med list and the discharge summary disagree
*(kind: scope / source-of-truth · confidence 0.85 · impact high · blocks on balanced+)*

**Evidence (two excerpts, side by side):**
> **Active medication list** · updated 3 months ago
> "Lisinopril 20 mg PO daily — active"

> **Discharge summary** · 12 days ago
> "Lisinopril HELD during admission for AKI. Not restarted at discharge —
> resume pending renal recovery, re-evaluate at PCP follow-up."

**Recommendation:** Treat the discharge summary as the current record —
Eleanor is *not* taking lisinopril today. **Rationale:** it's 3 months newer
and explicitly documents the change; the med list predates the admission.

**Buttons:** `Agree — treat discharge summary as current` (lean) ·
`Disagree — keep the med list as the record`

**The build-up payoff:** agreeing promotes a reconciliation rule — *"where
the med list and discharge summary conflict, the discharge summary governs"* —
and the agent immediately applies it to the two remaining discrepancies
**as receipts, live**: metformin resumed at 1000 mg BID (per discharge), and
amoxicillin-clavulanate marked *completed course, not an active med*. Policy
banner: **"1 decision → 3 records reconciled."** Sublinear validation, scaled
honestly.

### Decision 2 — Metformin dose vs. declining kidney function
*(kind: interpretation / clinical flag · confidence 0.7 · impact high · blocks on balanced+ · **depends on Decision 1**)*

**Evidence (two excerpts):**
> **BMP + trend** · 5 days ago
> "eGFR 38 mL/min/1.73m² (six-month trend: 52 → 47 → 38)"

> **Discharge summary** · 12 days ago
> "Metformin resumed at 1000 mg twice daily."

**Recommendation:** Flag as the top agenda item for tomorrow — at eGFR 30–45,
guidance is to reassess and typically halve metformin (max ~1000 mg/day); she
resumed at double that, and the trend is downward. **Rationale is explicit
about the chain:** *"You confirmed the discharge summary is current (Decision 1),
so she's taking 1000 mg BID against an eGFR of 38."* The card shows the chain:
`Decision 1 ✓ → eGFR 38 → dose exceeds guidance`.

**Buttons:** `Agree — put dose reduction on the visit agenda` (lean) ·
`Disagree — dose is acceptable, log and move on`

Note what the agent does *not* do: prescribe. It flags for the physician's
judgment. The recommendation is about the *agenda*, not the dose — that's the
authority boundary, stated on the card.

### Decision 3 — Conflicting allergy records (the agent won't guess)
*(kind: safety verification · confidence — refuses to score · **always blocks**, every dial setting)*

**Evidence (three excerpts):**
> **Intake form (patient-completed)** · 6 days ago
> "Allergies: penicillin — rash as a child"

> **Prior PCP note** · 3 months ago
> "Allergies: NKDA (no known drug allergies)"

> **Discharge summary** · 12 days ago
> "Completed: amoxicillin-clavulanate 875/125 mg BID × 7 days"

**The agent's position:** "These can't all be right — and she just completed a
penicillin-class antibiotic with no documented reaction. I won't adjudicate an
allergy record. How do you want to handle it?"

**Buttons:** `Verify with patient at tomorrow's visit — flag chart until then`
(lean) · `Update record: penicillin allergy` · `Keep NKDA`

This is v1's "illegible figure" beat done honestly: the blocker exists because
the *stakes* forbid guessing, not because the data is unreadable.

### The finish — visit brief (single gate)

No intermediate phase gates. One closing checkpoint renders the deliverable:
a ranked **visit brief** where every line links back to its decision and its
source spans:

1. **Metformin 1000 mg BID vs eGFR 38** — consider dose reduction *(Decision 2)*
2. **Lisinopril restart decision** — held since admission; cardiology
   recommends continuing an ACEi *(Decision 1 + cardiology consult — a tension
   the agent surfaces but explicitly leaves to the doctor)*
3. **Allergy verification** — intake vs chart conflict *(Decision 3)*
4. Orthostatic dizziness reported since discharge — check standing BP *(receipt)*
5. HbA1c 8.1% — diabetes management review *(receipt)*

Closing stats line: **"3 decisions needed you · 14 checks logged · every line
cites its source."** That's the thesis in one sentence.

## Trust dial (kept, simplified role)

Same three positions, same shared `lib/gate.ts`:

- **Oversight** — one extra medium-confidence item asks first (the orthostatic
  dizziness receipt becomes a checkpoint: "add standing BP to agenda?").
- **Balanced** (default) — the 3 decisions above.
- **Autonomy** — Decisions 1–2 auto-resolve on the agent's lean (amber
  `auto-resolved` rows for audit); **Decision 3 still blocks** — the dial
  never buys autonomy over a safety record. That asymmetry is worth a line in
  the README: some decisions are gated by confidence, some by category.

Restarting on a different dial remains the "what to try" step that proves the
gate is real.

## UI changes (where the quality boost lands)

1. **CheckpointCard v2 — evidence-first.** The card leads with 1–3 document
   excerpts rendered as document chrome (doc title, date, quoted text with the
   key span highlighted), then a clearly separated **Recommendation** block,
   then the rationale, then buttons. Every button label states its
   consequence — never bare "Approve." For Decision 2, a small dependency
   line shows the chain from Decision 1.
2. **DocumentPanel (new).** Clicking any citation — on a card, a receipt, or
   a brief line — opens the full source document in a side panel, scrolled to
   the highlighted span. This is "clearly citing a source" made literal, and
   it works because the corpus is now real document text.
3. **Ledger, humanized.** ~18 rows total (14 receipts + the decisions), each a
   plain-English sentence with a source chip. Filters stay ("Needed you" is
   still the payoff filter). Kind taxonomy shrinks to what this scenario uses:
   `record-conflict · clinical-flag · safety · routine-check`.
4. **Sidebar.** Trust dial + a small patient header card + the policy banner.
   The phase timeline collapses to a 3-step progress label (Reconcile meds →
   Review results → Brief) with no blocking gates until the brief.

## Data-model deltas (`lib/types.ts`)

```ts
interface Evidence { docId: string; spanId: string; source: string; date: string; snippet: string; }
// snippet + source are derived from chart.ts at build time — single source of truth.

interface CheckpointOption { label: string; consequence: "approve" | "correct"; value: string; }

interface Checkpoint {
  // ...as today, except:
  evidence: Evidence[];        // was single — cards render up to 3 excerpts
  options: CheckpointOption[]; // consequence-labeled buttons
  dependsOn?: string;          // Decision 2 → Decision 1, for the chain line
}
```

`Decision.kind` becomes the 4-item clinical taxonomy. Everything else —
`Resolution`, `Policy`, the `data-*` part names, `gate.ts`, `thread.ts`,
`run.ts`'s player loop, the ledger reducer shape — is unchanged.

## What we keep / drop from v1

| Keep | Drop |
|------|------|
| Pause/resume via cursor + durable thread | 30-item corpus and 59-row ledger |
| Shared confidence gate, mock + live parity | Two intermediate phase gates |
| Policy promotion (scaled to 1→3, honest) | 6-kind decision taxonomy |
| Trust dial with restart comparison | Metadata-string "evidence" |
| Rehydrate-on-refresh (GET) | The #19 illegible-scan contrivance |

## Build plan

1. **`lib/chart.ts`** — the seven documents, full text, highlight-span markers,
   and the snippet-extraction helper. This is the demo's content and gets the
   most care; write the documents like documents.
2. **`lib/types.ts` + `lib/script.ts`** — model deltas above; new choreography
   (~14 receipts, 3 checkpoints, dial variants, brief). Verify the player
   (`run.ts`) needs no changes beyond the type updates.
3. **`components/CheckpointCard.tsx` v2 + `components/DocumentPanel.tsx`** —
   evidence-first card, consequence buttons, dependency line; the panel with
   span highlighting wired from card, ledger, and brief citations.
4. **Ledger / Sidebar / page pass** — copy, patient header, progress label,
   brief rendering, disclaimer footer.
5. **`lib/agent.ts` live-mode re-target** — same beat plan over the chart docs;
   per-document `generateObject` with the clinical prompt; category-gated
   blocking for the allergy beat (gate override, not confidence). LangSmith
   wiring unchanged.
6. **Docs** — README rewrite and `walkthroughs/03-working-in-the-open.md`
   rewrite to the new script; update the repo-root README row if it names the
   lease scenario.

## Architecture (carried forward from v1, unchanged)

- **No LangGraph.** Interrupt = `return` + saved cursor in a durable thread
  keyed by session; resolution = fresh POST that resumes. Linear workflow,
  AI-SDK-native streaming, server-authoritative ledger with GET rehydrate.
- **LangSmith tracing** via `traceable` (run loop + per-item decide, gate
  outcome as span metadata) + `AISDKExporter` in `instrumentation.ts`. Env-var
  gated, no-op when unset.
- **Mock-first.** The choreographed no-key run is the primary artifact; live
  mode (`ANTHROPIC_API_KEY`) walks the same beats with real model calls
  through the same gate.
