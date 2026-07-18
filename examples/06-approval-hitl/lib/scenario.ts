// The world the agent acts in: one support ticket, the customer's account and
// billing history, the refund policy, and the tools. All synthetic — both modes
// (choreographed mock and live agent) act on exactly these facts, and the mock
// "systems" the write tools touch are stubs that mint reference numbers.
//
// TOOL_META is the product-design layer: per write tool, how its arguments are
// labeled and which are editable, what the approval card says it will do, and
// how the approve button states its consequence. The *args* come from the agent
// (scripted or model-chosen); the *framing* is deterministic and lives here —
// same philosophy as example 03's structural checkpoint options.

import type { ActionArgField, WriteClass } from "./types";

export const COMPANY = "Halyard Analytics";

export const TASK =
  "Resolve support ticket #4821 — a customer reports being double-charged for their July renewal. Investigate, make it right, and reply to them.";

export const TICKET = {
  id: "#4821",
  from: "Dana Okafor <dana.okafor@corvidrobotics.com>",
  subject: "Charged twice for our July renewal",
  received: "Jul 15, 2026 · 9:12 AM",
  body:
    `Hi — our card statement shows two $49.00 charges from ${COMPANY} on July 2, ` +
    "but we only have one Team subscription. Please sort this out and confirm " +
    "what happened.\n\n— Dana Okafor, Corvid Robotics",
};

export const ACCOUNT = {
  id: "ACCT-3310",
  name: "Corvid Robotics",
  contact: "Dana Okafor",
  email: "dana.okafor@corvidrobotics.com",
  plan: "Team — $49.00/month",
  card: "Visa ending 4242",
  since: "March 2024",
  standing: "Good standing · 14 seats",
};

export const INVOICES = [
  { id: "INV-8583", date: "May 2, 2026", amount: 49.0, note: "Team plan renewal — paid" },
  { id: "INV-8712", date: "Jun 2, 2026", amount: 49.0, note: "Team plan renewal — paid" },
  { id: "INV-8841", date: "Jul 2, 2026", amount: 49.0, note: "Team plan renewal — paid" },
  {
    id: "INV-8842",
    date: "Jul 2, 2026",
    amount: 49.0,
    note: "Team plan renewal — paid (same card, 41 seconds after INV-8841)",
  },
];

export const REFUND_POLICY = [
  "Duplicate charges are refundable in full within 60 days, to the original payment method (5–10 business days).",
  "Support agents may refund up to $200 without manager sign-off.",
  "Every customer-visible remedy gets a written confirmation to the account contact.",
];

// ---------------------------------------------------------------------------
// Read tools — auto-run, land in the feed as receipts. `payload` is what the
// live model reads; `detail` is the one-line receipt the feed shows.
// ---------------------------------------------------------------------------

export interface ReadResult {
  title: string;
  detail: string;
  payload: string;
}

export const READ_TOOLS: Record<string, { label: string; run: () => ReadResult }> = {
  get_ticket: {
    label: "Read a support ticket",
    run: () => ({
      title: `Read ticket ${TICKET.id}`,
      detail: `${TICKET.subject} — from ${ACCOUNT.contact}, ${ACCOUNT.name}`,
      payload: `Ticket ${TICKET.id} · received ${TICKET.received}\nFrom: ${TICKET.from}\nSubject: ${TICKET.subject}\n\n${TICKET.body}`,
    }),
  },
  lookup_account: {
    label: "Look up the customer account",
    run: () => ({
      title: `Looked up account ${ACCOUNT.id}`,
      detail: `${ACCOUNT.name} · ${ACCOUNT.plan} · ${ACCOUNT.card}`,
      payload: [
        `Account ${ACCOUNT.id}: ${ACCOUNT.name}`,
        `Contact: ${ACCOUNT.contact} <${ACCOUNT.email}>`,
        `Plan: ${ACCOUNT.plan} · Payment method: ${ACCOUNT.card}`,
        `Customer since ${ACCOUNT.since} · ${ACCOUNT.standing}`,
        `Refund policy: ${REFUND_POLICY.join(" ")}`,
      ].join("\n"),
    }),
  },
  billing_history: {
    label: "Pull the billing history",
    run: () => ({
      title: "Pulled the billing history",
      detail: "Two $49.00 charges on Jul 2 — INV-8841 and INV-8842, 41 seconds apart",
      payload: INVOICES.map((i) => `${i.id} · ${i.date} · $${i.amount.toFixed(2)} · ${i.note}`).join("\n"),
    }),
  },
};

// ---------------------------------------------------------------------------
// Write tools — never auto-run. Each entry defines how the approval card frames
// the model-chosen args, and a stub executor that mints a reference number.
// ---------------------------------------------------------------------------

export interface WriteToolMeta {
  label: string; // for the permissions card
  klass: WriteClass;
  reversible: boolean;
  title: string; // "The agent wants to issue a refund"
  /** Order, labels, and editability of the args the card renders. */
  fields: (args: Record<string, string>) => ActionArgField[];
  /** Plain-language "what this will do" bullets. */
  willDo: (args: Record<string, string>) => string[];
  /** Consequence-stating approve button. */
  approveLabel: (args: Record<string, string>) => string;
  /** Feed-row title once proposed/executed. */
  feedTitle: (args: Record<string, string>) => string;
  /** Execute against the (mock) system; returns the receipt line. */
  execute: (args: Record<string, string>) => string;
}

const money = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
};

export const WRITE_TOOLS: Record<string, WriteToolMeta> = {
  issue_refund: {
    label: "Issue a refund",
    klass: "money",
    reversible: false,
    title: "The agent wants to issue a refund",
    fields: (a) => [
      { key: "invoice_id", label: "Invoice", value: a.invoice_id ?? "" },
      { key: "amount_usd", label: "Amount (USD)", value: a.amount_usd ?? "", editable: true },
      { key: "reason", label: "Reason", value: a.reason ?? "", editable: true },
    ],
    willDo: (a) => [
      `Returns ${money(a.amount_usd)} to ${ACCOUNT.card} against ${a.invoice_id}, within 5–10 business days.`,
      "Posts the refund to the account's billing history.",
      "Cannot be undone once submitted to the payment processor.",
    ],
    approveLabel: (a) => `Approve — refund ${money(a.amount_usd)} to ${ACCOUNT.card}`,
    feedTitle: (a) => `Refund ${money(a.amount_usd)} on ${a.invoice_id}`,
    execute: (a) => `RF-2209 · ${money(a.amount_usd)} to ${ACCOUNT.card} · ${a.invoice_id}`,
  },
  create_ticket: {
    label: "File an internal ticket",
    klass: "internal",
    reversible: true,
    title: "The agent wants to file an internal ticket",
    fields: (a) => [
      { key: "queue", label: "Queue", value: a.queue ?? "" },
      { key: "priority", label: "Priority", value: a.priority ?? "", editable: true },
      { key: "title", label: "Title", value: a.title ?? "", editable: true },
      { key: "note", label: "Note", value: a.note ?? "", editable: true, multiline: true },
    ],
    willDo: (a) => [
      `Opens a ${a.priority ?? "normal"}-priority ticket in the ${a.queue ?? "?"} queue.`,
      "The owning team is notified on their next triage pass.",
      "Reversible — a ticket can be closed or rerouted at any time.",
    ],
    approveLabel: (a) => `Approve — file in ${a.queue ?? "the queue"}`,
    feedTitle: (a) => `File ticket: ${a.title ?? "(untitled)"}`,
    execute: () => "OPS-1187 · queued for billing-escalations triage",
  },
  send_email: {
    label: "Email the customer",
    klass: "external",
    reversible: false,
    title: "The agent wants to email the customer",
    fields: (a) => [
      { key: "to", label: "To", value: a.to ?? "" },
      { key: "subject", label: "Subject", value: a.subject ?? "", editable: true },
      { key: "body", label: "Body", value: a.body ?? "", editable: true, multiline: true },
    ],
    willDo: (a) => [
      `Sends this message to ${a.to} from support@halyard.io, over your name.`,
      "Logs the reply on the support ticket and marks it awaiting-customer.",
      "Cannot be unsent once it leaves.",
    ],
    approveLabel: (a) => `Approve — send to ${(a.to ?? "").replace(/\s*<.*>/, "") || "the customer"}`,
    feedTitle: (a) => `Email ${ACCOUNT.contact}: ${a.subject ?? "(no subject)"}`,
    execute: () => `MSG-5521 · delivered to ${ACCOUNT.email}`,
  },
};

export function isWriteTool(tool: string): boolean {
  return tool in WRITE_TOOLS;
}
