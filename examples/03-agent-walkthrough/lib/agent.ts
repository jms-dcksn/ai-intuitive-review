import { generateObject, NoObjectGeneratedError } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AISDKExporter } from "langsmith/vercel";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { z } from "zod";

import type {
  BriefItem,
  Checkpoint,
  CheckpointOption,
  Decision,
  DecisionKind,
  Impact,
  Phase,
  Resolution,
} from "./types";
import { CHART, evidenceFor, getDoc, PATIENT } from "./chart";
import { levelFor, shouldBlock, type BlockLevel } from "./gate";
import { applyResolution } from "./resolve";
import type { ThreadRecorder, ThreadState } from "./thread";

// ---------------------------------------------------------------------------
// The live agent. Same control flow as the choreographed player (`./run`) — walk
// a linear plan, stream receipts, stop at the first checkpoint the trust dial
// says should block, remember the cursor, resume on the user's resolution — but
// the *content* of each decision (what was decided, why, and how confidently)
// comes from a real model call over the actual chart documents.
//
// Two design calls from PLAN.md are realized here:
//   • No LangGraph. The interrupt is `return` + a saved cursor in the durable
//     thread; a resolution is a fresh POST that re-enters and resumes.
//   • The gate stays `shouldBlock` (shared, verbatim). Confidence-gating is
//     real: the model self-scores each decision and `levelFor` turns that into
//     whether it interrupts — with structural floors the orchestration knows a
//     priori (an allergy-record conflict must block; the source-of-truth call
//     is high stakes). Checkpoint *options* are structural too: what agreeing
//     or overruling does to the ledger is product design, not model output.
// ---------------------------------------------------------------------------

const MODEL = process.env.DECISION_MODEL || "claude-sonnet-5";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DECISION_SYSTEM = [
  "You are a clinical chart-review assistant preparing a physician's pre-visit",
  "brief. You RECOMMEND; the physician decides. You make ONE small decision at a",
  "time and you are rigorously honest about your confidence.",
  "",
  "Return, for the single decision asked of you:",
  "- decided: your call or recommendation, in one crisp sentence.",
  "- rationale: one or two sentences of why, grounded in the documents provided",
  "  (cite what each document says when they disagree).",
  "- confidence: 0..1, CALIBRATED. Reserve >0.9 for calls the documents make",
  "  unambiguous. Use 0.6–0.85 when the right call is clear but has clinical",
  "  consequences a physician should confirm. Use <0.4 for anything you should",
  "  not decide alone (conflicting safety-critical records).",
  "- impact: 'high' only if this call affects medication safety or decides which",
  "  record governs; 'med' if it adds a visit agenda item; 'low' otherwise.",
  "- alternatives: other defensible calls a careful clinician might make",
  "  (empty if there is genuinely only one reading).",
].join("\n");

// Lenient on purpose: a strict schema ("med", required alternatives) fails the
// whole run when the model writes "medium" or omits an empty array. Normalize
// those instead — the JSON schema the model sees keeps the strict enum.
const ImpactSchema = z.preprocess((v) => {
  const s = String(v ?? "").toLowerCase().trim();
  return s.startsWith("med") ? "med" : s.startsWith("high") ? "high" : s.startsWith("low") ? "low" : v;
}, z.enum(["low", "med", "high"]));

// Same leniency for alternatives: models sometimes return a bare string (or
// null) where the schema wants an array — normalize instead of failing the run.
const AlternativesSchema = z.preprocess(
  (v) => (v == null ? [] : typeof v === "string" ? [v] : v),
  z.array(z.string()),
);

const DecisionSchema = z.object({
  decided: z.string().describe("The call or recommendation, one crisp sentence."),
  rationale: z.string().default("").describe("One or two sentences of grounding."),
  confidence: z.coerce.number().describe("Calibrated confidence, 0..1."),
  impact: ImpactSchema,
  alternatives: AlternativesSchema.default([]).describe("Other defensible calls."),
});

/**
 * Last-resort recovery when generateObject rejects the response: the raw text
 * often contains valid JSON wrapped in prose or fences. Re-parse it through the
 * same lenient schema; rethrow the original error if that fails too.
 */
function salvage<T>(err: unknown, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  if (NoObjectGeneratedError.isInstance(err) && err.text) {
    const match = err.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = schema.safeParse(JSON.parse(match[0]));
        if (parsed.success) return parsed.data;
        console.error("[salvage] schema still failing:", parsed.error.issues);
      } catch {
        // fall through to rethrow
      }
    }
    console.error("[salvage] unrecoverable model text:", err.text.slice(0, 2000));
  }
  throw err;
}

type DecideResult = {
  decision: Decision;
  alternatives: string[];
  level: BlockLevel | null;
  blocked: boolean;
};

/** Attach gate/telemetry facts to the active LangSmith span (no-op when tracing is off). */
function annotateSpan(meta: Record<string, unknown>): void {
  try {
    const rt = getCurrentRunTree();
    if (rt) rt.metadata = { ...rt.metadata, ...meta };
  } catch {
    // No active trace (tracing disabled) — nothing to annotate.
  }
}

const levelRank = (l: BlockLevel | null) => (l === "always" ? 3 : l === "gated" ? 2 : l === "oversight" ? 1 : 0);

/** Take the stronger of two block levels (null < oversight < gated < always). */
function stronger(a: BlockLevel | null, b: BlockLevel | null): BlockLevel | null {
  return levelRank(a) >= levelRank(b) ? a : b;
}

/** Cap a block level (a routine check may ask, but only at the cautious dial). */
function capped(level: BlockLevel | null, max: BlockLevel | undefined): BlockLevel | null {
  if (!max || level === null) return level;
  return levelRank(level) > levelRank(max) ? max : level;
}

/** Full document text (markers stripped) for the model to read. */
function docText(docId: string): string {
  const doc = getDoc(docId);
  if (!doc) return "";
  const body = doc.body.replace(/⟦hl:[a-z0-9-]+⟧|⟦\/hl⟧/g, "");
  return `=== ${doc.title} (${doc.date}) ===\n${body}`;
}

interface DecideInput {
  id: string;
  phase: number;
  kind: DecisionKind;
  subject: string;
  question: string; // what to decide
  docIds: string[]; // which chart documents the model reads
  evidence: { docId: string; spanId: string }; // the primary citation (panel-linked)
  dial: ThreadState["dial"];
  minLevel?: BlockLevel; // structural floor the orchestration knows a priori
  maxLevel?: BlockLevel; // structural ceiling (routine checks shouldn't gate the run)
  impactFloor?: Impact; // force at least this impact
  status?: Decision["status"];
  context?: string; // earlier calls this one builds on
}

/**
 * One decision, made by the model over the actual chart documents, scored for
 * confidence, and run through the gate. Traced as a `decideOne` span with the
 * model call nested underneath and the gate outcome attached as metadata — so a
 * trace shows *why* each item blocked or auto-resolved.
 */
const decideOne = traceable(
  async function decideOne(input: DecideInput): Promise<DecideResult> {
    const prompt = [
      `Patient: ${PATIENT.name}, ${PATIENT.age} — ${PATIENT.summary}`,
      input.context ? `Established earlier in this review: ${input.context}` : "",
      `Decision: ${input.question}`,
      `Subject: ${input.subject}`,
      "Documents:",
      ...input.docIds.map(docText),
    ]
      .filter(Boolean)
      .join("\n\n");

    // Occasionally the model mangles the tool-call JSON outright (fields lost
    // to syntax bleed). Salvage catches wrapped-but-valid JSON; a mangled
    // response gets ONE clean retry before the run fails.
    let object: z.infer<typeof DecisionSchema> | undefined;
    for (let attempt = 0; object === undefined; attempt++) {
      try {
        ({ object } = await generateObject({
          model: anthropic(MODEL),
          schema: DecisionSchema,
          system: DECISION_SYSTEM,
          prompt,
          experimental_telemetry: AISDKExporter.getSettings({ runName: `decide:${input.subject}` }),
        }));
      } catch (err) {
        try {
          object = salvage(err, DecisionSchema);
        } catch (err2) {
          if (attempt >= 1) throw err2;
        }
      }
    }

    const impact: Impact = input.impactFloor
      ? maxImpact(object.impact, input.impactFloor)
      : object.impact;

    const decision: Decision = {
      id: input.id,
      phase: input.phase,
      kind: input.kind,
      subject: input.subject,
      decided: object.decided,
      rationale: object.rationale,
      confidence: round2(object.confidence),
      impact,
      status: input.status ?? "auto",
      evidence: evidenceFor(input.evidence.docId, input.evidence.spanId),
    };

    const level = capped(stronger(levelFor(decision), input.minLevel ?? null), input.maxLevel);
    const blocked = level !== null && shouldBlock(level, input.dial);

    annotateSpan({
      subject: input.subject,
      kind: input.kind,
      confidence: decision.confidence,
      impact: decision.impact,
      blockLevel: level ?? "none",
      dial: input.dial,
      blocked,
    });

    return { decision, alternatives: object.alternatives ?? [], level, blocked };
  },
  { name: "decideOne", run_type: "chain" },
);

// ---------------------------------------------------------------------------
// The plan — the deterministic choreography of *beats*, mirroring the mock's
// script. Each `decide` step carries only metadata; the decision content is
// filled at runtime by `decideOne`. The three structured checkpoints (their
// options, dependents, and ledger consequences) are structural, so they live
// here rather than being inferred.
// ---------------------------------------------------------------------------

type PlanStep =
  | { t: "phase"; phase: Phase }
  | { t: "receipt"; decision: Decision } // structural bookkeeping, no model call
  | {
      t: "decide";
      input: Omit<DecideInput, "dial" | "context">;
      /** Builds the checkpoint if this decision blocks. */
      checkpoint?: (d: Decision, alternatives: string[]) => Checkpoint;
      /** Earlier-call context, resolved against thread state at runtime. */
      context?: (thread: ThreadState) => string;
    }
  | { t: "recon" } // the med-reconciliation class: 3 decisions, 1 checkpoint
  | { t: "gate"; checkpoint: Checkpoint }
  | { t: "synthesis" };

function phase(index: number, name: string, note: string): PlanStep {
  return { t: "phase", phase: { index, name, note } };
}

/** Which record governs, per the user's (or agent's) reconciliation call. */
function reconChoice(thread: ThreadState): string {
  return thread.policyChoices["cp-med-recon"] === "medlist"
    ? "the EHR medication list was kept as the record where documents conflict"
    : "the discharge summary governs where the medication records conflict";
}

function buildPlan(): PlanStep[] {
  return [
    // ---- Phase 1: Reconcile medications ------------------------------------
    phase(1, "Reconcile medications", "Compare the EHR medication list against what actually changed during the admission."),
    {
      t: "receipt",
      decision: {
        id: "d-inventory", phase: 1, kind: "routine-check",
        subject: "Chart inventory",
        decided: `${CHART.length} documents on file; newest is the Jul 10 metabolic panel`,
        rationale: CHART.map((d) => d.title.split(" — ")[0]).join(", ") + ".",
        confidence: 0.99, impact: "low", status: "auto",
      },
    },
    {
      t: "decide",
      input: {
        id: "d-home-meds", phase: 1, kind: "routine-check",
        subject: "Unchanged home medications",
        question: "Check whether amlodipine, atorvastatin, and aspirin are consistent between the medication list and the discharge summary.",
        docIds: ["medlist", "discharge"],
        evidence: { docId: "medlist", spanId: "amlodipine" },
        maxLevel: "oversight",
      },
    },
    { t: "recon" },

    // ---- Phase 2: Review results --------------------------------------------
    phase(2, "Review results", "Check the post-discharge labs, vitals, and reports against her history."),
    {
      t: "decide",
      input: {
        id: "d-cxr", phase: 2, kind: "routine-check",
        subject: "Chest X-ray follow-up",
        question: "Does the chest X-ray report require any follow-up imaging to be scheduled?",
        docIds: ["imaging"],
        evidence: { docId: "imaging", spanId: "cxr-fu" },
        maxLevel: "oversight",
      },
    },
    {
      t: "decide",
      input: {
        id: "d-k", phase: 2, kind: "routine-check",
        subject: "Potassium",
        question: "Assess the potassium result in the context of CKD and the held ACE inhibitor. Anything to flag?",
        docIds: ["labs", "discharge"],
        evidence: { docId: "labs", spanId: "potassium" },
        maxLevel: "oversight",
      },
    },
    {
      t: "decide",
      input: {
        id: "d-a1c", phase: 2, kind: "routine-check",
        subject: "HbA1c 8.1%",
        question: "Should the diabetes control (last HbA1c) go on the visit agenda?",
        docIds: ["labs", "cards"],
        evidence: { docId: "labs", spanId: "a1c" },
        maxLevel: "oversight",
      },
    },
    {
      t: "decide",
      input: {
        id: "d-dizzy", phase: 2, kind: "clinical-flag",
        subject: "Dizziness on standing since discharge",
        question: "The patient reports dizziness on standing since discharge. Recommend whether to add an orthostatic blood-pressure check to tomorrow's agenda.",
        docIds: ["intake", "discharge"],
        evidence: { docId: "intake", spanId: "dizziness" },
        minLevel: "oversight", impactFloor: "med",
      },
      checkpoint: (d) => ({
        id: "cp-dizzy", type: "decision", phase: 2, kind: "clinical-flag",
        decisionId: d.id,
        title: "She reports dizziness on standing since coming home",
        body: d.rationale,
        recommendation: d.decided,
        evidence: [evidenceFor("intake", "dizziness")],
        suggestion: "add",
        options: [
          { value: "add", label: "Agree — add a standing-BP check to the agenda", decided: "Standing blood-pressure check added to the visit agenda" },
          { value: "skip", label: "Disagree — don't add it", decided: "Not added — monitor; revisit if it persists" },
        ],
      }),
    },
    {
      t: "decide",
      input: {
        id: "d-metformin-dose", phase: 2, kind: "clinical-flag",
        subject: "Metformin 1000 mg BID vs eGFR 38",
        question: "Given the eGFR result and trend, and the metformin dose she resumed at discharge, recommend whether metformin dosing should go on tomorrow's agenda. You are flagging for the physician, not changing therapy.",
        docIds: ["labs", "discharge"],
        evidence: { docId: "labs", spanId: "egfr-trend" },
        minLevel: "gated", impactFloor: "high",
      },
      context: (thread) => reconChoice(thread),
      checkpoint: (d) => ({
        id: "cp-metformin", type: "decision", phase: 2, kind: "clinical-flag",
        decisionId: d.id,
        dependsOn: { decisionId: "d-lisinopril", label: "Builds on your call: which medication record governs" },
        title: "Her metformin dose may exceed guidance for her kidney function",
        body: d.rationale,
        recommendation: d.decided,
        evidence: [evidenceFor("labs", "egfr-trend"), evidenceFor("discharge", "metformin-resumed")],
        suggestion: "flag",
        options: [
          { value: "flag", label: "Agree — put dose reduction on the visit agenda", decided: "Dose reduction flagged — top of tomorrow's visit agenda" },
          { value: "keep", label: "Disagree — current dose is acceptable", decided: "Dose left as-is per physician — no agenda item" },
        ],
      }),
    },
    {
      t: "decide",
      input: {
        id: "d-allergy", phase: 2, kind: "safety",
        subject: "Penicillin allergy — records conflict",
        question: "The intake form, the prior visit note, and the discharge summary disagree about a penicillin allergy. Do NOT adjudicate the record — state the conflict and your lean for how the physician should resolve it.",
        docIds: ["intake", "pcpnote", "discharge"],
        evidence: { docId: "intake", spanId: "allergy-intake" },
        minLevel: "always", impactFloor: "high", status: "pending",
      },
      checkpoint: (d) => ({
        id: "cp-allergy", type: "decision", phase: 2, kind: "safety",
        decisionId: d.id,
        title: "Her allergy records can't all be right",
        body: d.rationale,
        recommendation: d.decided,
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
      }),
    },
    {
      t: "gate",
      checkpoint: {
        id: "cp-gate-brief", type: "gate", phase: 2,
        title: "Chart review complete",
        body: "Medications reconciled, results reviewed. Assemble the visit brief?",
        gateStats: "review complete — brief pending your go-ahead",
      },
    },

    // ---- Phase 3: Visit brief -------------------------------------------------
    phase(3, "Visit brief", "The ranked agenda for tomorrow — every line cites its decision and its source."),
    { t: "synthesis" },
  ];
}

// ---------------------------------------------------------------------------
// The runner.
// ---------------------------------------------------------------------------

/**
 * Resume (or start) the live run from the thread cursor, applying any resolution
 * first, then walking the plan until a checkpoint blocks or the run finishes.
 */
export async function runLiveAgent(
  rec: ThreadRecorder,
  thread: ThreadState,
  resolution?: Resolution,
): Promise<void> {
  await runLiveAgentTraced({ rec, thread, resolution });
}

const runLiveAgentTraced = traceable(
  async function reviewChart(args: {
    rec: ThreadRecorder;
    thread: ThreadState;
    resolution?: Resolution;
  }): Promise<void> {
    const { rec, thread, resolution } = args;
    const plan = buildPlan();

    if (resolution) {
      if (resolution.action === "stop") {
        rec.clearPending();
        rec.write({ type: "data-done", data: { summary: "Paused at your request. Nothing further was decided.", stats: "run paused" } });
        return;
      }
      applyResolution(rec, thread, resolution);
    }

    for (let i = thread.cursor; i < plan.length; i++) {
      const step = plan[i];

      if (step.t === "phase") {
        rec.write({ type: "data-phase", data: step.phase });
        continue;
      }

      if (step.t === "receipt") {
        rec.write({ type: "data-decision", data: step.decision });
        continue;
      }

      if (step.t === "gate") {
        // The one gate: a human confirms before the deliverable is assembled.
        rec.write({ type: "data-checkpoint", data: step.checkpoint });
        rec.setCursor(i + 1);
        return;
      }

      if (step.t === "recon") {
        const blocked = await runRecon(rec, thread);
        if (blocked) {
          rec.setCursor(i + 1);
          return;
        }
        continue;
      }

      if (step.t === "synthesis") {
        await synthesize(rec, thread);
        rec.setCursor(i + 1);
        return;
      }

      // A single model-made decision.
      const res = await decideOne({
        ...step.input,
        dial: thread.dial,
        context: step.context?.(thread),
      });

      if (res.blocked) {
        rec.write({ type: "data-decision", data: { ...res.decision, status: "pending" } });
        const cp = step.checkpoint
          ? step.checkpoint(res.decision, res.alternatives)
          : genericCheckpoint(res.decision, res.alternatives);
        rec.write({ type: "data-checkpoint", data: cp });
        rec.setCursor(i + 1);
        return;
      }

      // Not blocking → record it. If the dial let a would-be checkpoint pass, mark
      // it auto-resolved (amber, audit-worthy); otherwise it's a clean auto receipt.
      rec.write({ type: "data-decision", data: { ...res.decision, status: res.level ? "auto-resolved" : "auto" } });
    }
  },
  { name: "review-chart", run_type: "chain" },
);

/**
 * The medication-reconciliation class: three record conflicts, one source-of-
 * truth call. The model decides each conflict for real; the lisinopril decision
 * carries the checkpoint, and resolving it (either way) patches all three —
 * the sublinear moment.
 */
async function runRecon(rec: ThreadRecorder, thread: ThreadState): Promise<boolean> {
  const met = await decideOne({
    id: "d-met-recon", phase: 1, kind: "record-conflict",
    subject: "Metformin — which record is current?",
    question: "The medication list and the discharge summary both mention metformin. Decide, provisionally, what her current metformin status is.",
    docIds: ["medlist", "discharge"],
    evidence: { docId: "discharge", spanId: "metformin-resumed" },
    dial: thread.dial, status: "pending",
  });
  rec.write({ type: "data-decision", data: { ...met.decision, status: "pending" } });

  const abx = await decideOne({
    id: "d-abx-recon", phase: 1, kind: "record-conflict",
    subject: "Amoxicillin-clavulanate — active medication?",
    question: "Decide, provisionally, whether the discharge antibiotic is a current active medication.",
    docIds: ["medlist", "discharge"],
    evidence: { docId: "discharge", spanId: "abx-course" },
    dial: thread.dial, status: "pending",
  });
  rec.write({ type: "data-decision", data: { ...abx.decision, status: "pending" } });

  const lis = await decideOne({
    id: "d-lisinopril", phase: 1, kind: "record-conflict",
    subject: "Lisinopril 20 mg daily — conflicting records",
    question: "The EHR medication list shows lisinopril as active; the discharge summary says it was held and not restarted. Decide which record should be treated as current, and what that means for whether she is taking lisinopril today.",
    docIds: ["medlist", "discharge"],
    evidence: { docId: "medlist", spanId: "lisinopril-active" },
    dial: thread.dial,
    minLevel: "gated", impactFloor: "high", status: "pending",
  });

  const cp: Checkpoint = {
    id: "cp-med-recon", type: "decision", phase: 1, kind: "record-conflict",
    decisionId: "d-lisinopril",
    dependents: ["d-met-recon", "d-abx-recon"],
    title: "The medication list and the discharge summary disagree",
    body: lis.decision.rationale,
    recommendation: lis.decision.decided,
    evidence: [evidenceFor("medlist", "lisinopril-active"), evidenceFor("discharge", "lisinopril-held")],
    suggestion: "discharge",
    options: reconOptions(met.decision, abx.decision),
  };

  if (lis.blocked) {
    rec.write({ type: "data-decision", data: { ...lis.decision, status: "pending" } });
    rec.write({ type: "data-checkpoint", data: cp });
    return true; // blocked — wait for the user's source-of-truth call
  }

  // Autonomy dial: the agent takes its lean, amber for audit.
  rec.setPolicyChoice("cp-med-recon", "discharge");
  rec.write({ type: "data-decision", data: { ...lis.decision, status: "auto-resolved" } });
  const lean = cp.options!.find((o) => o.value === cp.suggestion)!;
  rec.write({
    type: "data-policy",
    data: { id: "pol-cp-med-recon", rule: `${lean.policyRule} (auto-adopted)`, appliesTo: "Medication reconciliation — this chart", count: 3, fromCheckpoint: cp.id },
  });
  for (const [id, decided] of Object.entries(lean.dependentPatches ?? {})) {
    rec.write({ type: "data-decisionUpdate", data: { id, patch: { decided, status: "auto-resolved" } } });
  }
  return false;
}

/** The reconciliation checkpoint's options — structural, with the model's own provisional readings as the agree-path patches. */
function reconOptions(met: Decision, abx: Decision): CheckpointOption[] {
  return [
    {
      value: "discharge",
      label: "Agree — treat the discharge summary as current",
      decided: "Not currently taking — discharge summary governs; restart is a visit decision",
      policyRule: "Where the medication list and discharge summary conflict, the discharge summary governs.",
      dependentPatches: { "d-met-recon": met.decided, "d-abx-recon": abx.decided },
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
  ];
}

/** Phase 3 — a model-authored summary over the actual decisions; the brief lines link back structurally. */
async function synthesize(rec: ThreadRecorder, thread: ThreadState): Promise<void> {
  const SynthSchema = z.object({ summary: z.string().describe("2-3 sentences for the physician: what the brief covers and any tension they should know about.") });

  const outcomes = thread.decisions
    .map((d) => `- ${d.subject}: ${d.decided} [${d.status}]`)
    .join("\n");

  const synth = traceable(
    async function synthesizeBrief() {
      try {
        const { object } = await generateObject({
          model: anthropic(MODEL),
          schema: SynthSchema,
          system: "You are closing out a pre-visit chart review. Be concise and concrete; you are writing to the physician.",
          prompt: [
            `Patient: ${PATIENT.name}, ${PATIENT.age} — ${PATIENT.summary}. Visit is tomorrow.`,
            `Also relevant: cardiology (Mar 12) recommended continuing an ACE inhibitor, but lisinopril was held at discharge — a tension for the physician to resolve.`,
            "Decisions made in this review:",
            outcomes,
            "Write the summary for the visit brief.",
          ].join("\n"),
          experimental_telemetry: AISDKExporter.getSettings({ runName: "synthesize" }),
        });
        return object;
      } catch (err) {
        return salvage(err, SynthSchema);
      }
    },
    { name: "synthesize", run_type: "chain" },
  );

  const { summary } = await synth();

  const brief: BriefItem[] = [
    { rank: 1, text: "Metformin 1000 mg BID vs eGFR 38 — discuss dose reduction", decisionId: "d-metformin-dose", evidence: evidenceFor("labs", "egfr-trend") },
    { rank: 2, text: "Lisinopril restart decision — held since the admission; cardiology recommends continuing an ACE inhibitor", decisionId: "d-lisinopril", evidence: evidenceFor("cards", "acei-rec") },
    { rank: 3, text: "Allergy verification — intake reports a penicillin rash; the chart says NKDA", decisionId: "d-allergy", evidence: evidenceFor("intake", "allergy-intake") },
    { rank: 4, text: "Standing BP check — dizziness on standing since discharge", decisionId: "d-dizzy", evidence: evidenceFor("intake", "dizziness") },
    { rank: 5, text: "Diabetes review — HbA1c 8.1% in April; SGLT2 inhibitor suggested by cardiology", decisionId: "d-a1c", evidence: evidenceFor("labs", "a1c") },
  ];

  const needed = thread.decisions.filter((d) => ["approved", "corrected", "policy-applied"].includes(d.status)).length;
  rec.write({
    type: "data-done",
    data: {
      summary,
      stats: `${thread.decisions.length} decisions logged · ${needed} resolved by you · every line cites its source`,
      brief,
    },
  });
}

/** Fallback card for a decision that blocked without a structural scaffold (a routine check the model scored low). */
function genericCheckpoint(d: Decision, alternatives: string[]): Checkpoint {
  const options: CheckpointOption[] = [
    { value: "accept", label: `Agree — ${d.decided}` },
    ...alternatives.slice(0, 2).map((a, i) => ({ value: `alt-${i}`, label: `Instead: ${a}`, decided: a })),
  ];
  return {
    id: `cp-${d.id}`,
    type: "decision",
    phase: d.phase,
    kind: d.kind,
    decisionId: d.id,
    title: d.subject,
    body: d.rationale,
    recommendation: d.decided,
    evidence: d.evidence ? [d.evidence] : undefined,
    suggestion: "accept",
    options,
  };
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function maxImpact(a: Impact, b: Impact): Impact {
  const rank: Record<Impact, number> = { low: 0, med: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function round2(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}
