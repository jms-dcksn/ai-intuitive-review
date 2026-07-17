import type { BriefItem, Checkpoint, Decision, Phase } from "./types";
import type { BlockLevel } from "./gate";
import { evidenceFor, PATIENT } from "./chart";

// The choreographed run. A flat list of events the server "plays" — streaming
// receipts until it reaches a checkpoint that, given the trust dial, should
// block. Three decisions carry the demo, and they build on each other:
//
//   1. cp-med-recon  — the med list and the discharge summary disagree about
//      lisinopril. Agreeing promotes a reconciliation rule that resolves two
//      more discrepancies live ("1 decision → 3 records reconciled").
//   2. cp-metformin  — eGFR 38 and falling, metformin resumed at 1000 mg BID.
//      Explicitly chained to decision 1: *because* the discharge summary
//      governs, she's on the full dose against guidance.
//   3. cp-allergy    — intake says penicillin rash, chart says NKDA, and she
//      just completed a penicillin-class antibiotic. Category-gated: blocks at
//      every dial setting; the agent won't adjudicate a safety record.
//
// `BlockLevel` and the gate live in `./gate`, shared with the live agent.

export type { BlockLevel } from "./gate";

export type ScriptEvent =
  | { t: "phase"; phase: Phase }
  | { t: "decision"; decision: Decision }
  | {
      t: "checkpoint";
      checkpoint: Checkpoint;
      block: BlockLevel;
      /** Single-decision checkpoints carry their pending decision here so the
       * player can emit it as `pending` (blocked) or `auto-resolved` (not). */
      pendingDecision?: Decision;
    }
  | { t: "done"; summary: string; stats: string; brief: BriefItem[] };

function dec(d: Partial<Decision> & Pick<Decision, "id" | "subject" | "decided">): Decision {
  return {
    phase: 1,
    kind: "routine-check",
    rationale: "",
    confidence: 0.95,
    impact: "low",
    status: "auto",
    ...d,
  };
}

export function buildScript(): ScriptEvent[] {
  const ev: ScriptEvent[] = [];

  // ---- Phase 1: Reconcile medications --------------------------------------
  ev.push({
    t: "phase",
    phase: { index: 1, name: "Reconcile medications", note: "Compare the EHR medication list against what actually changed during the admission." },
  });

  ev.push({ t: "decision", decision: dec({
    id: "d-inventory",
    subject: "Chart inventory",
    decided: "7 documents on file; newest is the Jul 10 metabolic panel",
    rationale: "Discharge summary, med list, labs, cardiology consult, intake form, prior visit note, chest X-ray.",
    confidence: 0.99,
  }) });

  for (const [id, med, span] of [
    ["d-amlodipine", "Amlodipine 5 mg daily", "amlodipine"],
    ["d-atorvastatin", "Atorvastatin 40 mg nightly", "atorvastatin"],
    ["d-aspirin", "Aspirin 81 mg daily", "aspirin"],
  ] as const) {
    ev.push({ t: "decision", decision: dec({
      id, subject: med,
      decided: "Consistent across the med list and discharge summary — unchanged",
      rationale: "Listed as active in the EHR; the discharge summary says all other home medications continued unchanged.",
      confidence: 0.97,
      evidence: evidenceFor("medlist", span),
    }) });
  }

  // The two discrepancies the reconciliation rule will resolve — streamed as
  // pending *before* the checkpoint, so the user watches the open questions
  // accumulate and then sees one decision close all three.
  ev.push({ t: "decision", decision: dec({
    id: "d-met-recon", kind: "record-conflict", impact: "med", confidence: 0.8, status: "pending",
    subject: "Metformin — which record is current?",
    decided: "Provisional: resumed at 1000 mg twice daily, per the discharge summary",
    rationale: "The med list predates the admission; the discharge summary documents a hold and resume.",
    evidence: evidenceFor("discharge", "metformin-resumed"),
  }) });
  ev.push({ t: "decision", decision: dec({
    id: "d-abx-recon", kind: "record-conflict", impact: "low", confidence: 0.85, status: "pending",
    subject: "Amoxicillin-clavulanate — active medication?",
    decided: "Provisional: a completed 7-day course, not an active medication",
    rationale: "Prescribed at discharge with a fixed end date (Jul 10); absent from the EHR list.",
    evidence: evidenceFor("discharge", "abx-course"),
  }) });

  // Decision 1 — the source-of-truth call.
  ev.push({
    t: "checkpoint",
    block: "gated",
    pendingDecision: dec({
      id: "d-lisinopril", kind: "record-conflict", impact: "high", confidence: 0.85, status: "pending",
      subject: "Lisinopril 20 mg daily — conflicting records",
      decided: "Provisional: not currently taking — held at discharge, never restarted",
      rationale: "The EHR list still shows it active, but the list is 3 months old and the discharge summary explicitly documents the hold.",
      evidence: evidenceFor("medlist", "lisinopril-active"),
    }),
    checkpoint: {
      id: "cp-med-recon", type: "decision", phase: 1, kind: "record-conflict",
      decisionId: "d-lisinopril",
      dependents: ["d-met-recon", "d-abx-recon"],
      title: "The medication list and the discharge summary disagree",
      body: "The EHR medication list still shows lisinopril 20 mg daily as active — but it was last reconciled three months ago, and the discharge summary from 12 days ago says it was held for acute kidney injury and never restarted.",
      recommendation: "Treat the discharge summary as the current record: Eleanor is not taking lisinopril today. It's three months newer and explicitly documents the change. Agreeing sets a rule for this chart — where the two records conflict, the discharge summary governs — which also settles the two open metformin and antibiotic questions above.",
      evidence: [
        evidenceFor("medlist", "lisinopril-active"),
        evidenceFor("discharge", "lisinopril-held"),
      ],
      suggestion: "discharge",
      options: [
        {
          value: "discharge",
          label: "Agree — treat the discharge summary as current",
          decided: "Not currently taking — discharge summary governs; restart is a visit decision",
          policyRule: "Where the medication list and discharge summary conflict, the discharge summary governs.",
          dependentPatches: {
            "d-met-recon": "Resumed at 1000 mg twice daily (discharge summary governs)",
            "d-abx-recon": "Completed course — not an active medication (discharge summary governs)",
          },
        },
        {
          value: "medlist",
          label: "Disagree — keep the medication list as the record",
          decided: "Medication list kept as the record — lisinopril 20 mg daily treated as active",
          policyRule: "Where the records conflict, keep the EHR medication list until manually reconciled.",
          dependentPatches: {
            "d-met-recon": "Metformin 1000 mg twice daily, per the medication list",
            "d-abx-recon": "Not on the medication list — treated as not active",
          },
        },
      ],
    },
  });

  // ---- Phase 2: Review results ----------------------------------------------
  ev.push({
    t: "phase",
    phase: { index: 2, name: "Review results", note: "Check the post-discharge labs, vitals, and reports against her history." },
  });

  ev.push({ t: "decision", decision: dec({
    id: "d-cxr", phase: 2,
    subject: "Chest X-ray follow-up",
    decided: "No follow-up imaging required — pneumonia resolving",
    rationale: "The radiologist's impression closes the loop; nothing to schedule.",
    confidence: 0.97,
    evidence: evidenceFor("imaging", "cxr-fu"),
  }) });
  ev.push({ t: "decision", decision: dec({
    id: "d-bp", phase: 2,
    subject: "Blood pressure control",
    decided: "At goal at the last recorded visit (138/84)",
    rationale: "No newer reading on file; worth a recheck tomorrow as routine.",
    confidence: 0.9,
    evidence: evidenceFor("pcpnote", "bp"),
  }) });
  ev.push({ t: "decision", decision: dec({
    id: "d-k", phase: 2,
    subject: "Potassium",
    decided: "4.8 mmol/L — within range",
    rationale: "Relevant given the held ACE inhibitor and CKD; nothing to flag.",
    confidence: 0.96,
    evidence: evidenceFor("labs", "potassium"),
  }) });
  ev.push({ t: "decision", decision: dec({
    id: "d-a1c", phase: 2, impact: "med",
    subject: "HbA1c 8.1%",
    decided: "Above goal — added diabetes review to the visit agenda",
    rationale: "April result; cardiology also suggested considering an SGLT2 inhibitor at the next review.",
    confidence: 0.92,
    evidence: evidenceFor("labs", "a1c"),
  }) });

  // Oversight-only checkpoint: a judgment the cautious dial confirms and the
  // default dial takes on its own (amber, audit-worthy).
  ev.push({
    t: "checkpoint",
    block: "oversight",
    pendingDecision: dec({
      id: "d-dizzy", phase: 2, kind: "clinical-flag", impact: "med", confidence: 0.8, status: "pending",
      subject: "Dizziness on standing since discharge",
      decided: "Provisional: add a standing blood-pressure check to the visit agenda",
      rationale: "Patient-reported on intake; plausible orthostatic symptom after illness and medication changes.",
      evidence: evidenceFor("intake", "dizziness"),
    }),
    checkpoint: {
      id: "cp-dizzy", type: "decision", phase: 2, kind: "clinical-flag",
      decisionId: "d-dizzy",
      title: "She reports dizziness on standing since coming home",
      body: "The intake form mentions dizziness when standing since discharge — new since the admission and the medication changes.",
      recommendation: "Add a standing (orthostatic) blood-pressure check to tomorrow's agenda. Cheap to do, and it matters for the lisinopril-restart discussion.",
      evidence: [evidenceFor("intake", "dizziness")],
      suggestion: "add",
      options: [
        { value: "add", label: "Agree — add a standing-BP check to the agenda", decided: "Standing blood-pressure check added to the visit agenda" },
        { value: "skip", label: "Disagree — don't add it", decided: "Not added — likely post-illness deconditioning; monitor" },
      ],
    },
  });

  // Decision 2 — the clinical flag that builds on decision 1.
  ev.push({
    t: "checkpoint",
    block: "gated",
    pendingDecision: dec({
      id: "d-metformin-dose", phase: 2, kind: "clinical-flag", impact: "high", confidence: 0.7, status: "pending",
      subject: "Metformin 1000 mg BID vs eGFR 38",
      decided: "Provisional: flag dose reduction as the top visit agenda item",
      rationale: "eGFR has fallen 52 → 47 → 38 over six months; at eGFR 30–45 guidance is to reassess and typically halve the dose.",
      evidence: evidenceFor("labs", "egfr-trend"),
    }),
    checkpoint: {
      id: "cp-metformin", type: "decision", phase: 2, kind: "clinical-flag",
      decisionId: "d-metformin-dose",
      dependsOn: { decisionId: "d-lisinopril", label: "Builds on your call: the discharge summary is the current med record" },
      title: "Her metformin dose now exceeds guidance for her kidney function",
      body: "You confirmed the discharge summary governs — so she resumed metformin at 1000 mg twice daily. The new panel puts her eGFR at 38, and the six-month trend is falling (52 → 47 → 38). At eGFR 30–45, guidance is to reassess metformin and typically reduce to half dose.",
      recommendation: "Put metformin dose reduction at the top of tomorrow's agenda. I'm flagging this for your judgment, not changing anything — dosing is your call.",
      evidence: [
        evidenceFor("labs", "egfr-trend"),
        evidenceFor("discharge", "metformin-resumed"),
      ],
      suggestion: "flag",
      options: [
        { value: "flag", label: "Agree — put dose reduction on the visit agenda", decided: "Dose reduction flagged — top of tomorrow's visit agenda" },
        { value: "keep", label: "Disagree — current dose is acceptable", decided: "Dose left as-is per physician — no agenda item" },
      ],
    },
  });

  // Decision 3 — the safety blocker. Category-gated: blocks at every dial.
  ev.push({
    t: "checkpoint",
    block: "always",
    pendingDecision: dec({
      id: "d-allergy", phase: 2, kind: "safety", impact: "high", confidence: 0.3, status: "pending",
      subject: "Penicillin allergy — records conflict",
      decided: "Won't adjudicate — the allergy record needs your call",
      rationale: "The intake form and the chart disagree, and she just completed a penicillin-class antibiotic.",
      evidence: evidenceFor("intake", "allergy-intake"),
    }),
    checkpoint: {
      id: "cp-allergy", type: "decision", phase: 2, kind: "safety",
      decisionId: "d-allergy",
      title: "Her allergy records can't all be right",
      body: "The intake form she filled out last week says \"penicillin — rash as a child.\" The chart says NKDA. And the discharge summary shows she just completed a 7-day course of amoxicillin-clavulanate — a penicillin — with no reaction documented.",
      recommendation: "I won't adjudicate an allergy record on my own — this blocks at every trust setting. My lean: ask her directly tomorrow and keep the chart flagged until then, since the recent uneventful course argues against a true allergy but doesn't prove it.",
      evidence: [
        evidenceFor("intake", "allergy-intake"),
        evidenceFor("pcpnote", "allergy-nkda"),
        evidenceFor("discharge", "abx-course"),
      ],
      suggestion: "verify",
      options: [
        { value: "verify", label: "Verify with her at the visit — flag the chart until then", decided: "Flagged for verification at tomorrow's visit; chart annotated" },
        { value: "update", label: "Update the record: penicillin allergy", decided: "Allergy record updated to penicillin (per intake form)" },
        { value: "keep-nkda", label: "Keep NKDA — childhood rash unconfirmed", decided: "NKDA kept; intake report documented in the note" },
      ],
    },
  });

  // The one gate: confirm before the deliverable is assembled.
  ev.push({
    t: "checkpoint",
    block: "always",
    checkpoint: {
      id: "cp-gate-brief", type: "gate", phase: 2,
      title: "Chart review complete",
      body: "Medications reconciled, results reviewed, three calls made. Assemble the visit brief?",
      gateStats: "3 decisions needed you · 8 checks ran clean",
    },
  });

  // ---- Phase 3: Visit brief ---------------------------------------------------
  ev.push({
    t: "phase",
    phase: { index: 3, name: "Visit brief", note: "The ranked agenda for tomorrow — every line cites its decision and its source." },
  });

  const brief: BriefItem[] = [
    { rank: 1, text: "Metformin 1000 mg BID vs eGFR 38 — discuss dose reduction", decisionId: "d-metformin-dose", evidence: evidenceFor("labs", "egfr-trend") },
    { rank: 2, text: "Lisinopril restart decision — held since the admission; cardiology recommends continuing an ACE inhibitor", decisionId: "d-lisinopril", evidence: evidenceFor("cards", "acei-rec") },
    { rank: 3, text: "Allergy verification — intake reports a penicillin rash; the chart says NKDA", decisionId: "d-allergy", evidence: evidenceFor("intake", "allergy-intake") },
    { rank: 4, text: "Standing BP check — dizziness on standing since discharge", decisionId: "d-dizzy", evidence: evidenceFor("intake", "dizziness") },
    { rank: 5, text: "Diabetes review — HbA1c 8.1% in April; SGLT2 inhibitor suggested by cardiology", decisionId: "d-a1c", evidence: evidenceFor("labs", "a1c") },
  ];

  ev.push({
    t: "done",
    summary: `Visit brief ready for ${PATIENT.name}. Item 2 carries a real tension the agenda should surface: the discharge team held her ACE inhibitor, and cardiology wants one continued — that's a physician call, so it's framed as one.`,
    stats: "3 decisions needed you · 1 rule reconciled 3 records · 8 routine checks logged · every line cites its source",
    brief,
  });

  return ev;
}
