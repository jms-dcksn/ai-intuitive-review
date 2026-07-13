import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { AISDKExporter } from "langsmith/vercel";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { z } from "zod";

import type {
  Checkpoint,
  Decision,
  DecisionKind,
  Impact,
  Phase,
  Resolution,
} from "./types";
import { LEASES, MERIDIAN_IDS, NO_EXIT_IDS, type Lease } from "./corpus";
import { levelFor, shouldBlock, type BlockLevel } from "./gate";
import type { ThreadRecorder, ThreadState } from "./thread";

// ---------------------------------------------------------------------------
// The live agent. Same control flow as the choreographed player (`./run`) — walk
// a linear plan, stream receipts, stop at the first checkpoint the trust dial
// says should block, remember the cursor, resume on the user's resolution — but
// the *content* of each decision (what was decided, on what evidence, and how
// confidently) comes from a real model call per item rather than a script.
//
// Two design calls from PLAN.md are realized here:
//   • No LangGraph. The interrupt is `return` + a saved cursor in the durable
//     thread; a resolution is a fresh POST that re-enters and resumes.
//   • The gate stays `shouldBlock` (shared, verbatim). Confidence-gating is real:
//     the model self-scores each decision and `levelFor` turns that into whether
//     it interrupts — with a few structural floors the orchestration knows a
//     priori (an illegible figure must block; the operative-doc call is high
//     stakes).
// ---------------------------------------------------------------------------

const MODEL = process.env.DECISION_MODEL || "claude-sonnet-5";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DECISION_SYSTEM = [
  "You are a commercial-real-estate analyst working through a lease portfolio to",
  "find exit options. You make ONE small decision at a time and you are rigorously",
  "honest about your confidence.",
  "",
  "Return, for the single decision asked of you:",
  "- decided: the call you're making, in one crisp clause.",
  "- rationale: one sentence of why, grounded in the text provided.",
  "- evidenceSnippet: the exact span from the source that the call rests on.",
  "- confidence: 0..1, CALIBRATED. Reserve >0.9 for calls the text makes",
  "  unambiguous. Use 0.4–0.7 for genuine ambiguity (a phrase that reads two ways,",
  "  a term two documents disagree on, a judgment call). Use <0.35 only when the",
  "  source cannot support a responsible answer at all (e.g. a figure is illegible).",
  "- impact: 'high' if this call drives many downstream numbers or the whole",
  "  property's plan (e.g. which document is operative); 'med' if it moves one",
  "  property's exit date or cost; 'low' otherwise.",
  "- alternatives: other readings/values a careful reviewer might pick instead",
  "  (empty if there is genuinely nothing to read).",
].join("\n");

const DecisionSchema = z.object({
  decided: z.string().describe("The call, one crisp clause."),
  rationale: z.string().describe("One sentence of grounding."),
  evidenceSnippet: z.string().describe("Exact span from the source text."),
  confidence: z.number().min(0).max(1),
  impact: z.enum(["low", "med", "high"]),
  alternatives: z.array(z.string()).describe("Other plausible readings/values."),
});

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

/** Take the stronger of two block levels (null < oversight < gated < always). */
function stronger(a: BlockLevel | null, b: BlockLevel | null): BlockLevel | null {
  const rank = (l: BlockLevel | null) => (l === "always" ? 3 : l === "gated" ? 2 : l === "oversight" ? 1 : 0);
  return rank(a) >= rank(b) ? a : b;
}

interface DecideInput {
  id: string;
  phase: number;
  kind: DecisionKind;
  subject: string;
  question: string; // what to decide
  source: string; // evidence source label, e.g. "#12 — documents on file"
  material: string; // the clause/note text the model reads
  dial: ThreadState["dial"];
  minLevel?: BlockLevel; // structural floor the orchestration knows a priori
  impactFloor?: Impact; // force at least this impact (e.g. operative-doc = high)
  status?: Decision["status"];
  classId?: string;
}

/**
 * One decision, made by the model, scored for confidence, and run through the
 * gate. Traced as a `decideOne` span with the model call nested underneath and
 * the gate outcome attached as metadata — so a trace shows *why* each item
 * blocked or auto-resolved, which is the thing worth inspecting in this app.
 */
const decideOne = traceable(
  async function decideOne(input: DecideInput): Promise<DecideResult> {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: DecisionSchema,
      system: DECISION_SYSTEM,
      temperature: 0.1,
      prompt: [
        `Decision: ${input.question}`,
        `Subject: ${input.subject}`,
        `Source (${input.source}):`,
        input.material,
      ].join("\n"),
      experimental_telemetry: AISDKExporter.getSettings({ runName: `decide:${input.subject}` }),
    });

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
      evidence: { source: input.source, snippet: object.evidenceSnippet || input.material },
      classId: input.classId,
    };

    const level = stronger(levelFor(decision), input.minLevel ?? null);
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
// The plan — the deterministic choreography of *beats*. Same structure as the
// mock's script, but each model-driven step carries only metadata; the decision
// content is filled at runtime by `decideOne`. Gates and the policy class are
// structural (a human always confirms a phase boundary; the 8 identical clauses
// are one class by construction), so they live here rather than being inferred.
// ---------------------------------------------------------------------------

type PlanStep =
  | { t: "phase"; phase: Phase }
  | {
      t: "decide";
      lease: Lease;
      kind: DecisionKind;
      question: string;
      minLevel?: BlockLevel;
      impactFloor?: Impact;
    }
  | { t: "class"; leases: Lease[] } // the Meridian 8 — one policy resolves all
  | { t: "gate"; checkpoint: Checkpoint }
  | { t: "synthesis" };

function phase(index: number, name: string, note: string): PlanStep {
  return { t: "phase", phase: { index, name, note } };
}

function buildPlan(): PlanStep[] {
  const steps: PlanStep[] = [];

  // ---- Phase 1: Triage ----------------------------------------------------
  steps.push(phase(1, "Triage", "Identify the operative document and whether any exit mechanism exists, per property."));
  for (const lease of LEASES) {
    if (lease.id === "#3") {
      steps.push({
        t: "decide", lease, kind: "assumption", minLevel: "oversight", impactFloor: "med",
        question: "The governing-law clause is left blank. Decide what governing law to assume for this property, or flag it.",
      });
    } else if (lease.id === "#12") {
      steps.push({
        t: "decide", lease, kind: "scope", minLevel: "gated", impactFloor: "high",
        question: "Three documents are on file (an original lease and two amendments). Decide which one's break term is operative — this drives every downstream number for the property.",
      });
    } else {
      steps.push({
        t: "decide", lease, kind: "scope",
        question: "Identify the operative document and decide whether any exit / break mechanism exists.",
      });
    }
  }
  steps.push({ t: "gate", checkpoint: gate1() });

  // ---- Phase 2: Deep read -------------------------------------------------
  steps.push(phase(2, "Deep read", "For each exitable lease, determine the earliest exit date and the break cost."));
  const exitable = LEASES.filter((l) => l.hasExit);
  const meridian = exitable.filter((l) => l.classId);
  const normal = exitable.filter((l) => !l.classId && !["#12", "#19", "#22"].includes(l.id));

  for (const lease of normal.slice(0, 8)) steps.push(deepRead(lease));
  steps.push({ t: "class", leases: meridian });
  for (const lease of normal.slice(8)) steps.push(deepRead(lease));

  steps.push({
    t: "decide", lease: LEASES.find((l) => l.id === "#19")!, kind: "extraction", minLevel: "always", impactFloor: "high",
    question: "Extract the break-fee figure. The penalty is the greater of three months' rent or the unamortized fit-out balance; if the fit-out figure can't be read from the scan, do NOT guess.",
  });
  steps.push({
    t: "decide", lease: LEASES.find((l) => l.id === "#22")!, kind: "classification", minLevel: "gated", impactFloor: "med",
    question: "There is no break clause, only a 'surrender for convenience' subject to landlord consent, with no fixed date or fee. Decide whether to count it as a firm exit option.",
  });
  steps.push({ t: "gate", checkpoint: gate2() });

  // ---- Phase 3: Synthesis -------------------------------------------------
  steps.push(phase(3, "Synthesis", "Rank the exit plan by feasibility and cost."));
  steps.push({ t: "synthesis" });

  return steps;
}

function deepRead(lease: Lease): PlanStep {
  return {
    t: "decide", lease, kind: "interpretation",
    question: "Determine the earliest exit date basis and the notice period from the break clause.",
  };
}

function gate1(): Checkpoint {
  const exitable = LEASES.length - NO_EXIT_IDS.length;
  return {
    id: "cp-gate-1", type: "gate", phase: 1,
    title: "Triage complete",
    body: `${exitable} leases have an exit mechanism; ${NO_EXIT_IDS.length} don't (${NO_EXIT_IDS.join(", ")}). Deep-read the exitable ${exitable}?`,
    gateStats: `${exitable} exitable · ${NO_EXIT_IDS.length} fixed-term`,
  };
}

function gate2(): Checkpoint {
  return {
    id: "cp-gate-2", type: "gate", phase: 2,
    title: "Deep read complete",
    body: "Earliest exit date and break cost are set for every exitable lease. Proceed to synthesis and ranking?",
    gateStats: "exit date + cost set for all exitable leases",
  };
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
  async function analyzePortfolio(args: {
    rec: ThreadRecorder;
    thread: ThreadState;
    resolution?: Resolution;
  }): Promise<void> {
    const { rec, thread, resolution } = args;
    const plan = buildPlan();

    if (resolution) {
      applyResolution(rec, thread, resolution);
      if (resolution.action === "stop") {
        rec.write({ type: "data-done", data: { summary: "Paused at your request. Nothing further was decided.", stats: "run paused" } });
        return;
      }
    }

    for (let i = thread.cursor; i < plan.length; i++) {
      const step = plan[i];

      if (step.t === "phase") {
        rec.write({ type: "data-phase", data: step.phase });
        continue;
      }

      if (step.t === "gate") {
        // Phase gates always block — a human confirms the boundary before work
        // compounds past it.
        rec.write({ type: "data-checkpoint", data: step.checkpoint });
        rec.setCursor(i + 1);
        return;
      }

      if (step.t === "class") {
        const blocked = await runClass(rec, thread, step.leases);
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
        id: idFor(step.lease, step.kind),
        phase: phaseOf(step.kind),
        kind: step.kind,
        subject: subjectFor(step.lease, step.kind),
        question: step.question,
        source: sourceFor(step.lease),
        material: step.lease.clause ?? step.lease.note,
        dial: thread.dial,
        minLevel: step.minLevel,
        impactFloor: step.impactFloor,
      });

      if (res.blocked) {
        rec.write({ type: "data-decision", data: { ...res.decision, status: "pending" } });
        rec.write({ type: "data-checkpoint", data: singleCheckpoint(res.decision, res.alternatives) });
        rec.setCursor(i + 1);
        return;
      }

      // Not blocking → record it. If the dial let a would-be checkpoint pass, mark
      // it auto-resolved (amber, audit-worthy); otherwise it's a clean auto receipt.
      rec.write({ type: "data-decision", data: { ...res.decision, status: res.level ? "auto-resolved" : "auto" } });
    }
  },
  { name: "analyze-portfolio", run_type: "chain" },
);

/**
 * The policy class: the 8 Meridian leases share identical wording, so we make the
 * reading ONCE, stream it as 8 provisional (pending) rows, then raise a single
 * checkpoint that — resolved once — rewrites all 8. This is the sublinear moment.
 */
async function runClass(rec: ThreadRecorder, thread: ThreadState, leases: Lease[]): Promise<boolean> {
  const rep = leases[0];
  const res = await decideOne({
    id: `d-mer-${rep.id.replace("#", "")}`,
    phase: 2, kind: "interpretation", classId: rep.classId,
    subject: `${rep.id} — notice period`,
    question: "The phrase \"six (6) months' notice\" is ambiguous between calendar and business months. Give your PROVISIONAL reading and score it low if it is genuinely ambiguous.",
    source: `${rep.id} — §12.2`,
    material: rep.clause ?? rep.note,
    dial: thread.dial,
    minLevel: "gated",
    status: "pending",
  });

  const dependents = MERIDIAN_IDS.map((id) => `d-mer-${id.replace("#", "")}`);

  // Stream all 8 provisional rows (the representative's reading applied to each).
  for (const lease of leases) {
    rec.write({
      type: "data-decision",
      data: {
        ...res.decision,
        id: `d-mer-${lease.id.replace("#", "")}`,
        subject: `${lease.id} — notice period`,
        evidence: { source: `${lease.id} — §12.2`, snippet: lease.clause ?? res.decision.evidence!.snippet },
        status: "pending",
        classId: lease.classId,
      },
    });
  }

  const cp: Checkpoint = {
    id: "cp-meridian", type: "decision", phase: 2, kind: "interpretation",
    classId: "meridian-notice", dependents,
    title: `"Six months' notice" is ambiguous — and it's in ${MERIDIAN_IDS.length} leases`,
    body: `All ${MERIDIAN_IDS.length} Meridian Estates leases use the identical phrase "six (6) months' notice", which could mean calendar or business months — a ~9-day swing on each exit date. Decide once and I'll apply it to all ${MERIDIAN_IDS.length} as a policy.`,
    options: ["calendar months", "business months"],
    suggestion: res.decision.decided.toLowerCase().includes("business") ? "business months" : "calendar months",
    policyRule: "Read Meridian Estates 'months' notice as {choice}",
    evidence: { source: "Meridian Estates §12.2 (×8)", snippet: rep.clause ?? "" },
  };

  if (shouldBlock("gated", thread.dial)) {
    rec.write({ type: "data-checkpoint", data: cp });
    return true; // blocked — wait for the user's policy call
  }

  // Autonomy dial: auto-adopt the lean as a policy across the class.
  const choice = cp.suggestion!;
  rec.setPolicyChoice("meridian-notice", choice);
  rec.write({
    type: "data-policy",
    data: { id: "pol-cp-meridian", rule: `Read Meridian Estates 'months' notice as ${choice} (auto-adopted)`, appliesTo: "Meridian Estates leases", count: dependents.length, fromCheckpoint: "cp-meridian" },
  });
  for (const id of dependents) {
    rec.write({ type: "data-decisionUpdate", data: { id, patch: { decided: `read as ${choice}`, status: "auto-resolved" } } });
  }
  return false;
}

/** Phase 3 — a short model-authored ranking rationale plus the final plan. */
async function synthesize(rec: ThreadRecorder, thread: ThreadState): Promise<void> {
  const SynthSchema = z.object({
    priorities: z.array(z.object({ subject: z.string(), decided: z.string(), rationale: z.string() })).min(2).max(3),
    summary: z.string(),
  });

  const meridianChoice = thread.policyChoices["meridian-notice"] ?? "as decided at the checkpoint";

  const synth = traceable(
    async function synthesize() {
      const { object } = await generateObject({
        model: anthropic(MODEL),
        schema: SynthSchema,
        system: "You are ranking a portfolio of lease exits into a plan. Be concise and concrete.",
        temperature: 0.2,
        prompt: [
          "Produce 2–3 prioritization decisions and a one-paragraph summary for a ranked exit plan.",
          `Context: ${LEASES.length} leases analyzed. ${MERIDIAN_IDS.length} are Meridian Estates leases sharing one notice clause, now read ${meridianChoice}. #19's break fee awaited a figure the user supplied; #22 is a consent-gated surrender flagged as conditional.`,
          "Rank by (earliest exit date, then break cost). Treat the Meridian eight as one negotiation lever.",
        ].join("\n"),
        experimental_telemetry: AISDKExporter.getSettings({ runName: "synthesize" }),
      });
      return object;
    },
    { name: "synthesize", run_type: "chain" },
  );

  const object = await synth();

  object.priorities.forEach((p, i) => {
    rec.write({
      type: "data-decision",
      data: {
        id: `d-synth-${i + 1}`, phase: 3, kind: "prioritization",
        subject: p.subject, decided: p.decided, rationale: p.rationale,
        confidence: 0.88, impact: "med", status: "auto",
      },
    });
  });

  const total = thread.decisions.length;
  rec.write({
    type: "data-done",
    data: { summary: object.summary, stats: `${LEASES.length} leases analyzed · ${total} decisions logged · exit plan ranked` },
  });
}

// ---------------------------------------------------------------------------
// Resolution — apply the user's checkpoint response to thread state, streaming
// the ledger updates. Reads the authoritative checkpoint back from the thread.
// ---------------------------------------------------------------------------

function applyResolution(rec: ThreadRecorder, thread: ThreadState, res: Resolution): void {
  const cp = thread.checkpoints.find((c) => c.id === res.checkpointId);
  rec.clearPending();
  if (!cp) return;

  // Class checkpoint → promote to a policy that resolves every dependent at once.
  if (cp.dependents && cp.dependents.length) {
    const choice = res.value ?? cp.suggestion ?? "";
    rec.setPolicyChoice(cp.classId ?? "class", choice);
    rec.write({
      type: "data-policy",
      data: {
        id: `pol-${cp.id}`,
        rule: (cp.policyRule ?? "").replace("{choice}", choice),
        appliesTo: cp.classId ?? "class",
        count: cp.dependents.length,
        fromCheckpoint: cp.id,
      },
    });
    for (const id of cp.dependents) {
      rec.write({ type: "data-decisionUpdate", data: { id, patch: { decided: `read as ${choice}`, status: "policy-applied", confidence: 1 } } });
    }
    return;
  }

  // Single decision checkpoint.
  if (cp.decisionId) {
    const patch: Partial<Decision> =
      res.action === "correct"
        ? { decided: res.value ?? "", status: "corrected", confidence: 1 }
        : { status: "approved", confidence: 1 };
    rec.write({ type: "data-decisionUpdate", data: { id: cp.decisionId, patch } });
  }
  // Gate checkpoints (proceed) need no ledger change.
}

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function singleCheckpoint(d: Decision, alternatives: string[]): Checkpoint {
  const options = Array.from(new Set([d.decided, ...alternatives])).slice(0, 3);
  // Extraction blockers (an illegible figure) always take a typed value — never
  // offer the agent's non-answer as a clickable option.
  const hasChoices = d.kind !== "extraction" && options.length >= 2;
  return {
    id: `cp-${d.id}`,
    type: "decision",
    phase: d.phase,
    kind: d.kind,
    decisionId: d.id,
    title: d.subject,
    body: `${d.decided}. ${d.rationale}${hasChoices ? " — confirm, or choose another reading." : " I won't guess — please supply the value."}`,
    options: hasChoices ? options : undefined,
    suggestion: hasChoices ? d.decided : undefined,
    evidence: d.evidence,
  };
}

function maxImpact(a: Impact, b: Impact): Impact {
  const rank: Record<Impact, number> = { low: 0, med: 1, high: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function round2(n: number): number {
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}

function phaseOf(kind: DecisionKind): number {
  if (kind === "scope" || kind === "assumption") return 1;
  if (kind === "prioritization") return 3;
  return 2;
}

function idFor(lease: Lease, kind: DecisionKind): string {
  if (lease.id === "#12") return "d-op-12";
  if (lease.id === "#3") return "d-gov-3";
  if (lease.id === "#19") return "d-fee-19";
  if (lease.id === "#22") return "d-surr-22";
  return `d-${kind}-${lease.id.replace("#", "")}`;
}

function subjectFor(lease: Lease, kind: DecisionKind): string {
  if (lease.id === "#12") return `${lease.id} — operative document`;
  if (lease.id === "#3") return `${lease.id} — governing law`;
  if (lease.id === "#19") return `${lease.id} — break fee`;
  if (lease.id === "#22") return `${lease.id} — exit option?`;
  if (kind === "interpretation") return `${lease.id} — earliest exit`;
  return `${lease.id} — ${lease.property}`;
}

function sourceFor(lease: Lease): string {
  if (lease.id === "#12") return `${lease.id} — documents on file`;
  if (lease.id === "#3") return `${lease.id} — §1`;
  if (lease.id === "#19") return `${lease.id} — §9.4`;
  if (lease.id === "#22") return `${lease.id} — §14.1`;
  return lease.id;
}
