// The scenario: a mid-term contract exit with real money riding on how two
// clauses interact. Chosen so the model's reasoning has visible texture — clause
// interpretation interleaved with arithmetic the user can check by hand against
// the documents on the right. See PLAN.md for why each detail is planted.
//
// Paragraphs are single lines (the pane renders `pre-wrap`, so hard wraps here
// would render as ragged mid-sentence breaks); the uptime table keeps its
// intentional line breaks.

export interface ScenarioDoc {
  id: string;
  title: string;
  text: string;
}

export const SCENARIO_DOCS: ScenarioDoc[] = [
  {
    id: "msa",
    title: "Master Subscription Agreement — excerpts",
    text: [
      "§3.1 Fees. Customer shall prepay the annual subscription fee for each Subscription Term. Fees are stated per annum and accrue monthly in equal installments for accounting purposes.",
      '§4.1 Service Level. Provider will maintain Monthly Uptime of at least 99.5% ("Service Level").',
      "§4.2 Service Credits. For each calendar month in which Monthly Uptime falls below the Service Level, Customer is entitled to a service credit equal to 10% of the monthly installment of the annual fee. Except as provided in §4.3, service credits are Customer's sole and exclusive remedy for any failure to meet the Service Level.",
      "§4.3 Chronic Failure. Monthly Uptime below the Service Level in three (3) consecutive calendar months constitutes a material breach of this Agreement by Provider. A chronic failure under this §4.3 is deemed not subject to cure, and §4.2 does not limit Customer's termination rights under §9.2 in respect of it.",
      "§9.1 Termination for Convenience. Customer may terminate the Agreement for convenience on sixty (60) days' written notice. Upon such termination, Provider shall refund the prepaid fees attributable to each whole unused calendar month remaining in the Subscription Term after the effective date, less an early termination charge of 15% of the refunded amount.",
      "§9.2 Termination for Cause. Either party may terminate the Agreement on written notice if the other party materially breaches the Agreement and fails to cure within thirty (30) days of notice, except that no cure period applies to breaches deemed not subject to cure. Termination under this §9.2 takes effect at the end of the calendar month in which notice is given. Upon Customer's termination under this §9.2, Provider shall refund all prepaid fees attributable to the unused portion of the Subscription Term after the effective date, with no early termination charge.",
      "§9.3 Accrued Rights. Termination does not affect rights or credits accrued before the effective date of termination.",
    ].join("\n\n"),
  },
  {
    id: "case",
    title: "Account file — Brightline Logistics",
    text: [
      "Subscription Term: March 1, 2025 – February 28, 2026 (12 months).",
      "Annual fee, prepaid March 1: $86,400 (monthly installment: $7,200).",
      "Monthly Uptime, from the availability dashboard:\n  March    99.9%\n  April    99.8%\n  May      99.7%\n  June     99.1%   ← below Service Level\n  July     98.7%   ← below Service Level\n  August   99.3%   ← below Service Level",
      "September 10, 2025: Brightline delivers written notice of termination, citing the June–August availability record. No service credits have been paid out to date.",
    ].join("\n\n"),
  },
];

export const SAMPLE_QUESTION =
  "Brightline wants out. Under this contract, can they terminate for cause — and exactly how much should we refund them?";
