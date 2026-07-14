// Repro/verify for: "No object generated: response did not match schema." in lib/agent.ts
//
// Run from a shell that has ANTHROPIC_API_KEY exported:
//   node repro-schema.mjs
//
// Pass 1 uses the ORIGINAL strict schema and prints the exact zod failure.
// Pass 2 uses the lenient schema + salvage now in lib/agent.ts and should succeed.
import { generateObject, NoObjectGeneratedError } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

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

const PROMPT = [
  "Decision: Identify the operative document and decide whether any exit / break mechanism exists.",
  "Subject: #1 — Harborview Plaza",
  "Source (#1):",
  "Single executed lease on file. §11.3: Tenant may terminate this Lease effective on the fifth anniversary of the Commencement Date by giving not less than nine (9) months' prior written notice.",
].join("\n");

const StrictSchema = z.object({
  decided: z.string().describe("The call, one crisp clause."),
  rationale: z.string().describe("One sentence of grounding."),
  evidenceSnippet: z.string().describe("Exact span from the source text."),
  confidence: z.number().min(0).max(1),
  impact: z.enum(["low", "med", "high"]),
  alternatives: z.array(z.string()).describe("Other plausible readings/values."),
});

// Mirrors the lenient schema now in lib/agent.ts.
const ImpactSchema = z.preprocess((v) => {
  const s = String(v ?? "").toLowerCase().trim();
  return s.startsWith("med") ? "med" : s.startsWith("high") ? "high" : s.startsWith("low") ? "low" : v;
}, z.enum(["low", "med", "high"]));

const LenientSchema = z.object({
  decided: z.string().describe("The call, one crisp clause."),
  rationale: z.string().default("").describe("One sentence of grounding."),
  evidenceSnippet: z.string().default("").describe("Exact span from the source text."),
  confidence: z.coerce.number().describe("Calibrated confidence, 0..1."),
  impact: ImpactSchema,
  alternatives: z.array(z.string()).default([]).describe("Other plausible readings/values."),
});

function salvage(err, schema) {
  if (NoObjectGeneratedError.isInstance(err) && err.text) {
    const match = err.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = schema.safeParse(JSON.parse(match[0]));
        if (parsed.success) return parsed.data;
      } catch {
        // fall through to rethrow
      }
    }
  }
  throw err;
}

async function attempt(label, schema, withSalvage) {
  console.log(`\n=== ${label} ===`);
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema,
      system: DECISION_SYSTEM,
      temperature: 0.1,
      prompt: PROMPT,
    });
    console.log("OK:", JSON.stringify(object, null, 2));
  } catch (err) {
    if (withSalvage) {
      try {
        const saved = salvage(err, schema);
        console.log("SALVAGED:", JSON.stringify(saved, null, 2));
        return;
      } catch {
        // fall through to report
      }
    }
    console.log("ERROR:", err?.message);
    if (NoObjectGeneratedError.isInstance(err)) {
      console.log("--- raw model text ---\n" + err.text);
      console.log("--- cause ---\n", err.cause);
    }
  }
}

await attempt("PASS 1: original strict schema", StrictSchema, false);
await attempt("PASS 2: lenient schema + salvage (the fix)", LenientSchema, true);
