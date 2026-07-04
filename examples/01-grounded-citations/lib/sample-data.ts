import type { SourceDoc } from "./types";

// A tiny, *known* corpus. Deterministic inputs make the demo reviewable: you can
// eyeball whether a citation's char range actually lands on the right sentence.
//
// The docs deliberately (a) contain the answer, (b) spread it across two
// documents, and (c) include a near-miss distractor, so grounding has to do real
// work rather than echoing one obvious paragraph.

export const SAMPLE_DOCS: SourceDoc[] = [
  {
    id: "refund-policy",
    title: "Refund Policy (v4)",
    text: [
      "Refund Policy",
      "",
      "All paid plans are eligible for a refund if cancelled within the refund window for that plan tier.",
      "Self-serve plans (Starter and Pro) have a 14-day refund window from the date of purchase.",
      "Enterprise plans have a 30-day refund window from the invoice date. Refunds on Enterprise plans require sign-off from the account's assigned Customer Success Manager.",
      "Refunds are issued to the original payment method within 10 business days of approval.",
    ].join("\n"),
  },
  {
    id: "enterprise-terms",
    title: "Enterprise Terms & Conditions",
    text: [
      "Enterprise Terms & Conditions",
      "",
      "Section 3 — Billing. Enterprise customers are invoiced annually in advance.",
      "Section 4 — Cancellation. An Enterprise customer may cancel for convenience at any time with 60 days' written notice.",
      "A pro-rated refund is available only when cancellation occurs within the refund window defined in the Refund Policy; after that window, prepaid fees are non-refundable.",
    ].join("\n"),
  },
  {
    id: "support-thread",
    title: "Support Ticket #4821 (thread)",
    text: [
      "Support Ticket #4821",
      "",
      "Customer: How long do we have to get our money back on the enterprise account?",
      "Agent (draft, unsent): I think it's the standard two weeks like everyone else, but let me confirm with billing before I promise anything.",
      "Internal note: Do NOT quote the 14-day figure to Enterprise customers — that is the self-serve window and does not apply here.",
    ].join("\n"),
  },
];

export const SAMPLE_QUESTION =
  "What's our refund window for enterprise plans, and are there any conditions on it?";
