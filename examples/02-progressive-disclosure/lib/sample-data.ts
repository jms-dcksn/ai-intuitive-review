import type { Report } from "./schema";

// The *input*: raw, messy source material about a vendor, the kind an agent would
// be handed for a procurement review. Deliberately mixed signal — strong security
// posture, but a residency gap, an unresolved incident, and an off-list
// subprocessor — so the report has genuinely different severities to tier.

export const VENDOR = "Northwind Analytics";

export const SOURCE_MATERIAL = `
=== Security questionnaire (returned 2026-05) ===
Q: Encryption at rest?  A: Yes — AES-256 on all data stores.
Q: Encryption in transit?  A: Yes — TLS 1.2 or higher enforced, HSTS enabled.
Q: SSO / SAML?  A: Yes, SAML 2.0 and SCIM provisioning.
Q: Data residency options?  A: All customer data is stored in AWS us-east-1. No EU or other regional option at this time.
Q: Penetration testing?  A: Annual third-party pen test; most recent Feb 2026, no critical findings.

=== SOC 2 report (auditor summary) ===
SOC 2 Type II, reporting period Jan–Dec 2025. Opinion: unqualified (clean).
No exceptions noted in the control testing.

=== Data Processing Agreement (excerpt, §7) ===
"Processor stores and processes Customer Personal Data solely within the United
States (AWS us-east-1). Cross-border transfer mechanisms are not currently offered."

=== Subprocessor list ===
- Amazon Web Services (hosting) — on approved list
- Datadog (observability) — on approved list
- SendGrid (transactional email) — on approved list
- "Clearbit-style enrichment vendor" (lead enrichment) — NOT on the approved subprocessor list

=== Incident history ===
2025-08-14: P1 outage, 3h12m, root cause = expired TLS cert on an internal service.
  Post-mortem: PUBLISHED, action items closed.
2025-11-02: P1 data-exposure near-miss — a misconfigured S3 bucket was flagged by
  their own scanner before any external access. Post-mortem: NOT published; status
  "in progress" as of this review. No customer notification was issued.
`.trim();

export const TASK = `Assess ${VENDOR} for procurement approval. Weigh the material and produce a tiered report: a one-line verdict, then the findings that drive it, each with a deeper explanation and the raw evidence behind it. Order findings by how much they should influence the decision.`;

// Recorded answer for the no-key path. Mirrors what a good tiering pass produces
// from the material above — approve, but with real conditions surfaced up front.
export const SAMPLE_REPORT: Report = {
  verdict: "Approve with conditions — strong security baseline, but close the data-residency and incident gaps first.",
  recommendation: "approve-with-conditions",
  confidence: "medium",
  findings: [
    {
      title: "Unresolved P1 near-miss with no published post-mortem",
      severity: "critical",
      summary: "A November 2025 data-exposure near-miss is still open, with no post-mortem and no customer notification.",
      detail:
        "Their own scanner caught a misconfigured S3 bucket before external access, which is a point in their favor — but four+ months later the post-mortem is unpublished and the status is still 'in progress'. Contrast with the August TLS-cert outage, which was closed cleanly. The gap is process follow-through on the highest-severity events, which is exactly what a procurement review should gate on.",
      evidence: [
        {
          label: "November 2025 near-miss",
          detail: "P1 data-exposure near-miss — misconfigured S3 bucket flagged by their own scanner before any external access. Post-mortem NOT published; status 'in progress'. No customer notification issued.",
          source: "Incident history",
        },
        {
          label: "Contrasting closed incident",
          detail: "2025-08-14 P1 outage (expired TLS cert), 3h12m. Post-mortem published, action items closed.",
          source: "Incident history",
        },
      ],
    },
    {
      title: "US-only data residency — no EU option",
      severity: "caution",
      summary: "All customer data lives in AWS us-east-1; there is no regional residency option, which may block EU use cases.",
      detail:
        "Both the questionnaire and the DPA are explicit that data is stored and processed solely in the United States, and that cross-border transfer mechanisms are not offered. This is not a security defect, but it is a hard constraint: any team with EU data-residency obligations cannot use this vendor as-is. Treat it as a scoping condition, not a blocker.",
      evidence: [
        {
          label: "DPA §7",
          detail: "\"Processor stores and processes Customer Personal Data solely within the United States (AWS us-east-1). Cross-border transfer mechanisms are not currently offered.\"",
          source: "Data Processing Agreement",
        },
        {
          label: "Questionnaire — residency",
          detail: "All customer data is stored in AWS us-east-1. No EU or other regional option at this time.",
          source: "Security questionnaire",
        },
      ],
    },
    {
      title: "One subprocessor is not on the approved list",
      severity: "caution",
      summary: "Three of four subprocessors are pre-approved; the lead-enrichment vendor is not, and needs review before sign-off.",
      detail:
        "AWS, Datadog, and SendGrid are all on the approved subprocessor list. The lead-enrichment vendor is not, and its data flows aren't described in the material provided. This should be reviewed and either approved or contractually excluded as a condition of onboarding.",
      evidence: [
        {
          label: "Subprocessor list",
          detail: "AWS, Datadog, SendGrid — on approved list. Lead-enrichment vendor — NOT on the approved subprocessor list.",
          source: "Subprocessor list",
        },
      ],
    },
    {
      title: "Clean SOC 2 Type II, no exceptions",
      severity: "positive",
      summary: "A full-year SOC 2 Type II with an unqualified opinion and no testing exceptions.",
      detail:
        "The audit covers Jan–Dec 2025 (a full Type II reporting period, not a point-in-time Type I) and returned a clean, unqualified opinion with no exceptions noted. This is strong third-party assurance of the control environment.",
      evidence: [
        {
          label: "SOC 2 auditor summary",
          detail: "SOC 2 Type II, Jan–Dec 2025. Opinion: unqualified (clean). No exceptions noted in control testing.",
          source: "SOC 2 report",
        },
      ],
    },
    {
      title: "Solid encryption and access baseline",
      severity: "positive",
      summary: "AES-256 at rest, TLS 1.2+ in transit, SAML SSO with SCIM, and a recent clean pen test.",
      detail:
        "The fundamentals are all present: encryption at rest and in transit, enforced HSTS, SAML 2.0 SSO with SCIM provisioning, and a February 2026 third-party penetration test with no critical findings. Nothing here raises a flag.",
      evidence: [
        {
          label: "Questionnaire — crypto & access",
          detail: "AES-256 at rest; TLS 1.2+ enforced with HSTS; SAML 2.0 + SCIM. Annual pen test, most recent Feb 2026, no critical findings.",
          source: "Security questionnaire",
        },
      ],
    },
  ],
};
