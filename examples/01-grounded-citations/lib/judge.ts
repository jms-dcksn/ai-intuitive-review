import Anthropic from "@anthropic-ai/sdk";
import type {
  AnswerSegment,
  FaithfulnessSegment,
  FaithfulnessVerdict,
  SourceDoc,
} from "./types";

// A *different, stronger* model than the generator (claude-sonnet-5). Independence
// matters for a trust demo: same-model self-grading has a documented leniency
// bias, so the model shouldn't grade its own homework.
const JUDGE_MODEL = process.env.JUDGE_MODEL || "claude-opus-4-8";

const SYSTEM = [
  "You are a strict faithfulness judge for a retrieval-grounded answer.",
  "The answer is split into numbered SEGMENTS. Judge each segment against the",
  "full SOURCE DOCUMENTS: `supported` only if it is entailed by a document,",
  "`contradicted` if a document conflicts with it, `unsupported` if no document",
  "establishes it. A segment marked CITED includes the span the model cited —",
  "verify the span actually supports the segment; if it does not, the segment is",
  "NOT supported even though it was cited. A segment marked UNCITED may still be",
  "`supported` if the documents establish it. Judge faithfulness to the sources",
  "only, not style or completeness. Report every segment via the tool.",
].join(" ");

/**
 * Forced structured output: the `input` of the returned `tool_use` block is the
 * verdict. We ask only for the per-segment judgement — `index`, `status`,
 * `rationale`, `docId` — and stamp the structural facts (`text`, `cited`) back on
 * ourselves, since those are ground truth, not the judge's to decide.
 */
const TOOL: Anthropic.Tool = {
  name: "report_faithfulness",
  description: "Report a faithfulness judgement for each answer segment.",
  input_schema: {
    type: "object",
    properties: {
      score: {
        type: "number",
        description: "Holistic faithfulness score from 0 (fabricated) to 100.",
      },
      segments: {
        type: "array",
        description: "One entry per numbered segment, in any order.",
        items: {
          type: "object",
          properties: {
            index: { type: "number", description: "The segment number." },
            status: {
              type: "string",
              enum: ["supported", "unsupported", "contradicted"],
            },
            rationale: {
              type: "string",
              description: "One line: why this status.",
            },
            docId: {
              type: "string",
              description: "id of the supporting/contradicting source, if any.",
            },
          },
          required: ["index", "status", "rationale"],
        },
      },
    },
    required: ["score", "segments"],
  },
};

type JudgedSegment = Pick<
  FaithfulnessSegment,
  "index" | "status" | "rationale" | "docId"
>;

/**
 * Score each rendered answer `segment` for faithfulness against the **full**
 * `docs`. Returns per-segment verdicts aligned 1:1 with the answer's text runs,
 * so the UI can reconcile each one against its structural (cited / ungrounded)
 * signal. Throws if the model returns no tool call.
 */
export async function judgeFaithfulness(
  question: string,
  docs: SourceDoc[],
  segments: AnswerSegment[],
): Promise<FaithfulnessVerdict> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const sources = docs
    .map((d) => `<document id="${d.id}" title="${d.title}">\n${d.text}\n</document>`)
    .join("\n\n");

  const rendered = segments
    .map((s, i) => {
      const tag = s.cites.length
        ? `CITED (${s.cites
            .map((c) => `"${c.citedText}" → ${c.docTitle}`)
            .join("; ")})`
        : "UNCITED";
      return `[${i}] ${tag}\n${s.text.trim()}`;
    })
    .join("\n\n");

  const prompt = [
    "SOURCE DOCUMENTS:",
    sources,
    "",
    `QUESTION:\n${question}`,
    "",
    "ANSWER SEGMENTS TO JUDGE:",
    rendered,
  ].join("\n");

  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_faithfulness" },
    messages: [{ role: "user", content: prompt }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Judge returned no structured verdict");
  }

  const out = block.input as { score: number; segments: JudgedSegment[] };
  return assembleVerdict(segments, out.score, out.segments, JUDGE_MODEL);
}

/**
 * Merge the judge's per-segment status onto the structural facts we already know
 * (`text`, `cited`), and derive the overall verdict deterministically: `fail` if
 * any segment isn't supported. Judged segments are keyed by `index` (which matches
 * both the prompt's numbering and the UI's text-run order); any segment the judge
 * skipped falls back to `unsupported` so it can't silently pass.
 */
export function assembleVerdict(
  segments: AnswerSegment[],
  score: number,
  judged: JudgedSegment[],
  model: string,
): FaithfulnessVerdict {
  const byIndex = new Map(judged.map((j) => [j.index, j]));

  const merged: FaithfulnessSegment[] = segments.map((s, i) => {
    const j = byIndex.get(i);
    return {
      index: i,
      text: s.text.trim(),
      cited: s.cites.length > 0,
      status: j?.status ?? "unsupported",
      rationale: j?.rationale ?? "Not judged.",
      docId: j?.docId,
    };
  });

  const verdict = merged.every((s) => s.status === "supported")
    ? "pass"
    : "fail";

  return { verdict, score, segments: merged, model };
}
