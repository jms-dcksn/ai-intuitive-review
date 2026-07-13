import type { UIMessageStreamWriter } from "ai";
import type { ReasonUIMessage, ReasoningMeta } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Writer = UIMessageStreamWriter<ReasonUIMessage>;

// A recorded reasoning trace for the canned scenario, written the way a
// summarized thinking stream reads: checking clauses, doing the arithmetic,
// catching the sole-remedy tension and the convenience-path decoy. Every number
// here is checkable against lib/sample-data.ts — that's the point of the demo.
const REASONING = `Let me establish which termination path applies before touching any numbers.

The availability record shows June at 99.1%, July at 98.7%, and August at 99.3% — three months, all below the 99.5% Service Level in §4.1, and consecutive. That matches §4.3 exactly: chronic failure, deemed a material breach by the Provider.

Does the cure period save the provider? §9.2 normally requires 30 days to cure, but it carves out breaches "deemed not subject to cure" — and §4.3 says a chronic failure is exactly that. So Brightline's September 10 notice can terminate for cause immediately; no cure window applies.

One objection to check: §4.2 makes service credits the "sole and exclusive remedy" for Service Level failures. Read alone, that would block termination over uptime. But §4.2 says "except as provided in §4.3," and §4.3 states it does not limit termination rights under §9.2. The sole-remedy clause yields. This is the clause interaction that decides the case.

Now the money. §9.2: termination takes effect at the end of the calendar month in which notice is given — notice on September 10, so effective September 30, 2025. The unused portion of the term is October 1, 2025 through February 28, 2026: five months. The annual fee is $86,400 prepaid, so the monthly installment is $86,400 / 12 = $7,200. Refund of unused term: 5 × $7,200 = $36,000, with no early termination charge under §9.2.

Service credits: §4.2 grants 10% of the monthly installment per missed month — $720 each for June, July, August = $2,160. None have been paid, and §9.3 preserves rights accrued before the effective date, so these are owed on top of the refund.

Sanity check against the convenience path, in case the for-cause reading fails: §9.1 needs 60 days' notice, so effective November 9; whole unused calendar months are December–February = 3 × $7,200 = $21,600, less the 15% charge ($3,240) = $18,360, plus the same $2,160 in credits = $20,520. The two readings differ by $17,640 — which is why the §4.3/§4.2 interaction matters.

Conclusion: for-cause termination is available; refund $36,000 plus $2,160 in credits = $38,160 total.`;

const ANSWER = `Yes — Brightline can terminate for cause, and you should refund $38,160 in total.

The June–August record (99.1%, 98.7%, 99.3%) is three consecutive months below the 99.5% Service Level, which §4.3 deems a material breach not subject to cure. The usual 30-day cure period in §9.2 therefore doesn't apply, and §4.3 expressly overrides the sole-remedy limitation in §4.2 — so the September 10 notice validly terminates under §9.2, effective September 30, 2025.

The money:
— Unused term refund (§9.2): October–February = 5 months × $7,200 = $36,000, no early-termination charge.
— Accrued service credits (§4.2, §9.3): 3 missed months × $720 = $2,160, never paid out.
— Total owed: $38,160.

If Brightline were somehow limited to termination for convenience (§9.1), the exposure would be only $20,520 ($21,600 for three whole unused months, less the 15% charge, plus the same credits) — but the chronic-failure clause forecloses that reading. Caveat: confirm the dashboard figures are the contractual measure of Monthly Uptime before conceding the breach in writing.`;

/**
 * Stream the recorded trace + answer through the same part shapes the live path
 * emits, at a realistic cadence — reasoning first (slightly faster, like a
 * thinking ticker), then the answer. The no-key demo shows the identical UX.
 */
export async function streamMockAnswer(out: Writer): Promise<ReasoningMeta> {
  out.write({ type: "reasoning-start", id: "b0" });
  for (const word of REASONING.split(/(\s+)/)) {
    out.write({ type: "reasoning-delta", id: "b0", delta: word });
    if (word.trim()) await sleep(14);
  }
  out.write({ type: "reasoning-end", id: "b0" });

  await sleep(350);

  out.write({ type: "text-start", id: "b1" });
  for (const word of ANSWER.split(/(\s+)/)) {
    out.write({ type: "text-delta", id: "b1", delta: word });
    if (word.trim()) await sleep(22);
  }
  out.write({ type: "text-end", id: "b1" });

  return { model: "recorded-mock", summarized: true, redacted: false };
}
