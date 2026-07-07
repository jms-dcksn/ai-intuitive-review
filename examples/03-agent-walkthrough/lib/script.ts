import type { Checkpoint, Decision, Phase } from "./types";
import { LEASES, MERIDIAN_IDS, NO_EXIT_IDS } from "./corpus";

// The choreographed run. A flat list of events the server "plays" — streaming
// receipts until it reaches a checkpoint that, given the trust dial, should block.
// This is the v1 substitute for a live agent: it lets us stage the exact trust
// beats (the #12 blocker, the 8-lease policy moment, the phase gates) precisely.

export type BlockLevel =
  | "always" // blocks at every dial setting (gates, and things a human MUST decide)
  | "gated" // blocks unless the dial is at full autonomy
  | "oversight"; // blocks only at the most cautious dial setting

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
  | { t: "done"; summary: string; stats: string };

let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

function dec(d: Partial<Decision> & Pick<Decision, "subject" | "decided">): Decision {
  return {
    id: d.id ?? nextId("d"),
    phase: d.phase ?? 1,
    kind: d.kind ?? "scope",
    rationale: d.rationale ?? "",
    confidence: d.confidence ?? 0.95,
    impact: d.impact ?? "low",
    status: d.status ?? "auto",
    evidence: d.evidence,
    classId: d.classId,
    ...d,
  };
}

export function buildScript(): ScriptEvent[] {
  seq = 0;
  const ev: ScriptEvent[] = [];

  // ---- Phase 1: Triage -----------------------------------------------------
  ev.push({ t: "phase", phase: { index: 1, name: "Triage", note: "Identify the operative document and whether any exit mechanism exists, per property." } });

  for (const lease of LEASES) {
    // #3 — an assumption the most cautious dial wants to confirm.
    if (lease.id === "#3") {
      ev.push({
        t: "checkpoint",
        block: "oversight",
        pendingDecision: dec({
          id: "d-gov-3", phase: 1, kind: "assumption", impact: "med", confidence: 0.72,
          subject: `${lease.id} — governing law`,
          decided: "Assume Colorado (property is in Denver)",
          rationale: "Governing-law clause left blank; defaulting to the property's state.",
          evidence: { source: `${lease.id} — §1`, snippet: "Governing law: __________ (left blank)." },
        }),
        checkpoint: {
          id: "cp-gov-3", type: "decision", phase: 1, kind: "assumption",
          decisionId: "d-gov-3",
          title: "Governing law is blank on #3",
          body: "The lease doesn't state a governing law. I'd assume Colorado, since the property is in Denver. Confirm?",
          options: ["Colorado", "Delaware"], suggestion: "Colorado",
          evidence: { source: `${lease.id} — §1`, snippet: "Governing law: __________ (left blank)." },
        },
      });
      continue;
    }

    // #12 — which of three documents is operative? High impact: everything
    // downstream for this property depends on it, so it always blocks (unless autonomy).
    if (lease.id === "#12") {
      ev.push({
        t: "checkpoint",
        block: "gated",
        pendingDecision: dec({
          id: "d-op-12", phase: 1, kind: "scope", impact: "high", confidence: 0.5,
          subject: `${lease.id} — operative document`,
          decided: "First Amendment (2021): break at month 36",
          rationale: "The 2023 Second Amendment is later but only amends rent and is silent on the break term, so the 2021 break term still governs.",
          evidence: { source: `${lease.id} — documents on file`, snippet: lease.clause! },
        }),
        checkpoint: {
          id: "cp-op-12", type: "decision", phase: 1, kind: "scope",
          decisionId: "d-op-12",
          title: "Three documents on file for #12 — which is operative?",
          body: "The 2023 amendment is newest but only touches rent and is silent on the break clause. I'd treat the 2021 First Amendment's break term (month 36) as operative. This drives every downstream number for #12.",
          options: ["First Amendment (2021) — month 36", "Original Lease (2019) — month 60"],
          suggestion: "First Amendment (2021) — month 36",
          evidence: { source: `${lease.id} — documents on file`, snippet: lease.clause! },
        },
      });
      continue;
    }

    ev.push({
      t: "decision",
      decision: dec({
        phase: 1, kind: "scope", impact: lease.hasExit ? "low" : "med",
        confidence: lease.hasExit ? 0.96 : 0.97,
        subject: `${lease.id} — ${lease.property}`,
        decided: lease.hasExit ? "Operative doc identified; exit mechanism present" : "No exit mechanism (fixed term)",
        rationale: lease.note,
        evidence: { source: `${lease.id}`, snippet: lease.note },
      }),
    });
  }

  // Phase gate 1
  ev.push({
    t: "checkpoint", block: "always",
    checkpoint: {
      id: "cp-gate-1", type: "gate", phase: 1,
      title: "Triage complete",
      body: `${LEASES.length - NO_EXIT_IDS.length} leases have an exit mechanism; ${NO_EXIT_IDS.length} don't (${NO_EXIT_IDS.join(", ")}). Deep-read the exitable ${LEASES.length - NO_EXIT_IDS.length}?`,
      gateStats: `${LEASES.length - NO_EXIT_IDS.length} exitable · ${NO_EXIT_IDS.length} fixed-term`,
    },
  });

  // ---- Phase 2: Deep read --------------------------------------------------
  ev.push({ t: "phase", phase: { index: 2, name: "Deep read", note: "For each exitable lease, determine the earliest exit date and the break cost." } });

  const exitable = LEASES.filter((l) => l.hasExit);
  const meridian = exitable.filter((l) => l.classId);
  const normal = exitable.filter((l) => !l.classId && !["#12", "#19", "#22"].includes(l.id));

  // A batch of straightforward deep reads first.
  for (const lease of normal.slice(0, 8)) {
    ev.push({ t: "decision", decision: dec({
      phase: 2, kind: "interpretation", confidence: 0.9, impact: "low",
      subject: `${lease.id} — earliest exit`,
      decided: `Earliest exit computed from ${lease.note.toLowerCase()}`,
      rationale: "Notice period and break date read directly from the clause.",
      evidence: { source: `${lease.id}`, snippet: lease.note },
    }) });
  }

  // The 8 Meridian leases — same wording, read provisionally as calendar months,
  // low confidence, all pending the class decision.
  for (const lease of meridian) {
    ev.push({ t: "decision", decision: dec({
      id: `d-mer-${lease.id.replace("#", "")}`, phase: 2, kind: "interpretation",
      confidence: 0.55, impact: "med", status: "pending", classId: lease.classId,
      subject: `${lease.id} — notice period`,
      decided: "Provisional: 'six (6) months' = calendar months",
      rationale: "Meridian Estates wording is ambiguous between calendar and business months.",
      evidence: { source: `${lease.id} — §12.2`, snippet: lease.clause! },
    }) });
  }

  // The class checkpoint — one decision that resolves all 8.
  ev.push({
    t: "checkpoint", block: "gated",
    checkpoint: {
      id: "cp-meridian", type: "decision", phase: 2, kind: "interpretation",
      classId: "meridian-notice", dependents: MERIDIAN_IDS.map((id) => `d-mer-${id.replace("#", "")}`),
      title: `"Six months' notice" is ambiguous — and it's in ${MERIDIAN_IDS.length} leases`,
      body: `All ${MERIDIAN_IDS.length} Meridian Estates leases use the identical phrase "six (6) months' notice", which could mean calendar or business months — a ~9-day swing on each exit date. Decide once and I'll apply it to all ${MERIDIAN_IDS.length} as a policy.`,
      options: ["calendar months", "business months"], suggestion: "calendar months",
      policyRule: "Read Meridian Estates 'months' notice as {choice}",
      evidence: { source: "Meridian Estates §12.2 (×8)", snippet: "Either party may terminate upon not less than six (6) months' notice to the other." },
    },
  });

  // A few more normal deep reads.
  for (const lease of normal.slice(8)) {
    ev.push({ t: "decision", decision: dec({
      phase: 2, kind: "interpretation", confidence: 0.9, impact: "low",
      subject: `${lease.id} — earliest exit`,
      decided: `Earliest exit computed from ${lease.note.toLowerCase()}`,
      rationale: "Notice period and break date read directly from the clause.",
      evidence: { source: `${lease.id}`, snippet: lease.note },
    }) });
  }

  // #19 — extraction the agent genuinely can't do: always blocks.
  const l19 = LEASES.find((l) => l.id === "#19")!;
  ev.push({
    t: "checkpoint", block: "always",
    pendingDecision: dec({
      id: "d-fee-19", phase: 2, kind: "extraction", impact: "high", confidence: 0.2, status: "pending",
      subject: "#19 — break fee",
      decided: "Blocked: unamortized fit-out figure is illegible in the scan",
      rationale: "The break fee is the greater of 3 months' rent or the unamortized fit-out balance; the second figure can't be read.",
      evidence: { source: "#19 — §9.4", snippet: l19.clause! },
    }),
    checkpoint: {
      id: "cp-fee-19", type: "decision", phase: 2, kind: "extraction", decisionId: "d-fee-19",
      title: "#19 break fee rests on an illegible figure",
      body: "The penalty is the greater of three months' rent or the unamortized fit-out balance — but the fit-out figure is degraded in the scan. I won't guess. Please supply it (or provide the source).",
      evidence: { source: "#19 — §9.4", snippet: l19.clause! },
    },
  });

  // #22 — a judgment call: does an uncertain option count?
  const l22 = LEASES.find((l) => l.id === "#22")!;
  ev.push({
    t: "checkpoint", block: "gated",
    pendingDecision: dec({
      id: "d-surr-22", phase: 2, kind: "classification", impact: "med", confidence: 0.5, status: "pending",
      subject: "#22 — exit option?",
      decided: "Provisional: exclude (consent-gated, no fixed date or fee)",
      rationale: "'Surrender for convenience' needs landlord consent and fixes neither a date nor a fee, so it isn't a reliable exit.",
      evidence: { source: "#22 — §14.1", snippet: l22.clause! },
    }),
    checkpoint: {
      id: "cp-surr-22", type: "decision", phase: 2, kind: "classification", decisionId: "d-surr-22",
      title: "#22 has only a consent-gated surrender — count it?",
      body: "There's no break clause, only a 'surrender for convenience' subject to landlord consent, with no fixed date or fee. I'd exclude it from the firm exit plan and note it as a maybe. Agree?",
      options: ["Exclude (note as uncertain)", "Count as exit option"], suggestion: "Exclude (note as uncertain)",
      evidence: { source: "#22 — §14.1", snippet: l22.clause! },
    },
  });

  // Phase gate 2
  ev.push({
    t: "checkpoint", block: "always",
    checkpoint: {
      id: "cp-gate-2", type: "gate", phase: 2,
      title: "Deep read complete",
      body: "Earliest exit date and break cost are set for every exitable lease. Proceed to synthesis and ranking?",
      gateStats: "exit date + cost set for all exitable leases",
    },
  });

  // ---- Phase 3: Synthesis --------------------------------------------------
  ev.push({ t: "phase", phase: { index: 3, name: "Synthesis", note: "Rank the exit plan by feasibility and cost." } });

  ev.push({ t: "decision", decision: dec({ phase: 3, kind: "prioritization", confidence: 0.88, subject: "Ranking basis", decided: "Rank by (earliest exit date, then break cost)", rationale: "Soonest, cheapest exits first." }) });
  ev.push({ t: "decision", decision: dec({ phase: 3, kind: "prioritization", confidence: 0.9, impact: "med", subject: "Meridian batch", decided: "Group the 8 Meridian leases as one negotiation lever", rationale: "Same landlord, same clause — better handled as a portfolio conversation." }) });
  ev.push({ t: "decision", decision: dec({ phase: 3, kind: "prioritization", confidence: 0.85, impact: "med", subject: "Conditional items", decided: "List #19 and #22 as conditional pending your inputs", rationale: "Both depend on a decision you made or still owe." }) });

  ev.push({
    t: "done",
    summary: "Ranked exit plan ready: soonest/cheapest exits first, the Meridian eight grouped as one lever, and #19/#22 flagged as conditional.",
    stats: `${LEASES.length} leases analyzed · every decision logged · exit plan ranked`,
  });

  return ev;
}
