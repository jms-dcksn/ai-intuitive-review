// The corpus: one synthetic patient chart, seven short documents with full text.
// Every evidence snippet in the demo is extracted verbatim from these bodies —
// the one hard rule of this example is that no snippet exists that isn't in a
// document. Highlight spans are marked inline with ⟦hl:span-id⟧…⟦/hl⟧; the
// document panel resolves them, and `evidenceFor` extracts them as snippets.
//
// The planted material (all synthetic — no real patient, clinician, or facility):
//   • The EHR medication list (3 months old) and the discharge summary (12 days
//     old) disagree about lisinopril → the source-of-truth decision, which
//     promotes a reconciliation rule covering two more discrepancies.
//   • eGFR has slid 52 → 47 → 38 while metformin was resumed at 1000 mg BID →
//     the clinical flag that builds on the reconciliation decision.
//   • The patient-completed intake says "penicillin — rash"; the chart says
//     NKDA; she just completed amoxicillin-clavulanate → the safety blocker the
//     agent refuses to adjudicate at any dial setting.

import type { Evidence } from "./types";

export interface ChartDoc {
  id: string;
  title: string;
  date: string; // display date + recency, e.g. "Jul 3 · 12 days ago"
  body: string; // full text with ⟦hl:id⟧…⟦/hl⟧ span markers
}

export const PATIENT = {
  name: "Eleanor Vance",
  age: 68,
  summary: "T2DM · HTN · CKD 3b · discharged Jul 3 (pneumonia + AKI)",
};

export const TASK =
  "Review Eleanor Vance's chart ahead of tomorrow's follow-up visit. Reconcile her medications, check results, and prepare a visit brief — flag only what needs my judgment.";

export const CHART: ChartDoc[] = [
  {
    id: "discharge",
    title: "Discharge summary — St. Vincent Medical Center",
    date: "Jul 3 · 12 days ago",
    body: `DISCHARGE SUMMARY
Patient: Eleanor Vance (68) · MRN 48291-7
Admitted Jun 26 · Discharged Jul 3
Attending: R. Okafor, MD (Hospital Medicine)

DISCHARGE DIAGNOSES
1. Community-acquired pneumonia, right lower lobe
2. Acute kidney injury on chronic kidney disease stage 3b
3. Type 2 diabetes mellitus
4. Hypertension

HOSPITAL COURSE
Admitted with fever, productive cough, and hypoxia; chest X-ray confirmed a
right lower lobe consolidation. Treated with IV ceftriaxone/azithromycin,
narrowed to oral therapy once afebrile. Creatinine peaked at 2.1 mg/dL on
hospital day 2 (recent baseline ~1.4); nephrotoxic and renally cleared
medications were held.

MEDICATION CHANGES THIS ADMISSION
⟦hl:lisinopril-held⟧• Lisinopril 20 mg daily — HELD on admission for AKI. NOT restarted at
  discharge; resume pending renal recovery. Re-evaluate at PCP follow-up.⟦/hl⟧
⟦hl:metformin-resumed⟧• Metformin — held during admission; RESUMED at prior dose, 1000 mg twice
  daily, on discharge.⟦/hl⟧
⟦hl:abx-course⟧• Amoxicillin-clavulanate 875/125 mg twice daily × 7 days — course ends
  Jul 10. Not a continuing medication.⟦/hl⟧
All other home medications continued unchanged.

FOLLOW-UP
PCP visit within two weeks. Repeat basic metabolic panel in one week.`,
  },
  {
    id: "medlist",
    title: "Active medication list (EHR)",
    date: "Apr 14 · 3 months ago",
    body: `ACTIVE MEDICATIONS
Last full reconciliation: Apr 14 office visit.

⟦hl:lisinopril-active⟧1. Lisinopril 20 mg PO daily — active (hypertension / renal protection)⟦/hl⟧
⟦hl:metformin-listed⟧2. Metformin 1000 mg PO twice daily — active (type 2 diabetes)⟦/hl⟧
⟦hl:amlodipine⟧3. Amlodipine 5 mg PO daily — active (hypertension)⟦/hl⟧
⟦hl:atorvastatin⟧4. Atorvastatin 40 mg PO nightly — active (hyperlipidemia)⟦/hl⟧
⟦hl:aspirin⟧5. Aspirin 81 mg PO daily — active⟦/hl⟧`,
  },
  {
    id: "labs",
    title: "Basic metabolic panel + trend",
    date: "Jul 10 · 5 days ago",
    body: `BASIC METABOLIC PANEL — drawn Jul 10 (outpatient, post-discharge recheck)

Sodium 138 mmol/L · ⟦hl:potassium⟧Potassium 4.8 mmol/L⟦/hl⟧ · Chloride 102 · CO2 24
BUN 28 mg/dL
⟦hl:egfr-trend⟧Creatinine 1.7 mg/dL · eGFR 38 mL/min/1.73m²
Six-month trend — Jan: eGFR 52 · Apr: eGFR 47 · Jul: eGFR 38⟦/hl⟧
Glucose (random) 164 mg/dL

Prior result of note: ⟦hl:a1c⟧HbA1c 8.1% (Apr 14)⟦/hl⟧`,
  },
  {
    id: "cards",
    title: "Cardiology consult note",
    date: "Mar 12 · 4 months ago",
    body: `CARDIOLOGY CONSULT — S. Patel, MD
Reason: hypertension management with declining renal function.

ASSESSMENT
Hypertension with CKD stage 3b and type 2 diabetes; moderate ASCVD risk.

RECOMMENDATIONS
⟦hl:acei-rec⟧1. Continue ACE inhibitor (lisinopril) for cardio-renal protection;
   monitor potassium and creatinine.⟦/hl⟧
2. Consider adding an SGLT2 inhibitor at the next diabetes review.
3. Follow up in six months.`,
  },
  {
    id: "intake",
    title: "Patient intake form (patient-completed)",
    date: "Jul 9 · 6 days ago",
    body: `PRE-VISIT INTAKE — completed by patient via portal

Reason for visit: "Follow-up after my hospital stay."

⟦hl:allergy-intake⟧Allergies: penicillin — rash as a child⟦/hl⟧

Current concerns:
⟦hl:dizziness⟧"I have been getting dizzy when I stand up since I came home from the
hospital."⟦/hl⟧

Smoking: never · Alcohol: rare`,
  },
  {
    id: "pcpnote",
    title: "Prior office visit note",
    date: "Apr 14 · 3 months ago",
    body: `OFFICE VISIT — J. Whitfield, MD

⟦hl:allergy-nkda⟧Allergies: NKDA (no known drug allergies)⟦/hl⟧
Vitals: ⟦hl:bp⟧BP 138/84⟦/hl⟧ · HR 72 · BMI 29

ASSESSMENT & PLAN
T2DM — HbA1c 8.1%; reinforced lifestyle measures, continue metformin.
HTN — at goal on lisinopril + amlodipine.
CKD 3b — stable; recheck BMP and HbA1c in three months.`,
  },
  {
    id: "imaging",
    title: "Chest X-ray report",
    date: "Jul 2 · 13 days ago",
    body: `CHEST X-RAY (PA/lateral) — Jul 2
Comparison: Jun 26.

FINDINGS
⟦hl:cxr⟧Improving right lower lobe consolidation. No pleural effusion.⟦/hl⟧

IMPRESSION
Resolving pneumonia. ⟦hl:cxr-fu⟧No follow-up imaging required.⟦/hl⟧`,
  },
];

const MARKER = /⟦hl:([a-z0-9-]+)⟧([\s\S]*?)⟦\/hl⟧/g;

export function getDoc(docId: string): ChartDoc | undefined {
  return CHART.find((d) => d.id === docId);
}

/** The doc body split into renderable segments for the document panel. */
export function docSegments(doc: ChartDoc): { text: string; spanId?: string }[] {
  const out: { text: string; spanId?: string }[] = [];
  let last = 0;
  for (const m of doc.body.matchAll(MARKER)) {
    if (m.index! > last) out.push({ text: doc.body.slice(last, m.index) });
    out.push({ text: m[2], spanId: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < doc.body.length) out.push({ text: doc.body.slice(last) });
  return out;
}

/**
 * Extract the marked span verbatim as an Evidence record. Throws at module load
 * (via script.ts) if a span id doesn't exist — a snippet must come from a doc.
 */
export function evidenceFor(docId: string, spanId: string): Evidence {
  const doc = getDoc(docId);
  const seg = doc && docSegments(doc).find((s) => s.spanId === spanId);
  if (!doc || !seg) throw new Error(`No span ${spanId} in doc ${docId}`);
  const snippet = seg.text.replace(/\s+/g, " ").trim();
  return { docId, spanId, source: doc.title, date: doc.date, snippet };
}
