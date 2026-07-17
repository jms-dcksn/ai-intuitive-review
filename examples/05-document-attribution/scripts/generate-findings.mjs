// One Citations API call over the full extracted 10-K text → lib/findings.json.
//
// This runs offline, once — the app replays the recording (repo convention:
// deterministic, key-free demos). Citations are incompatible with structured
// outputs, so the finding structure comes from a strict prompted text format;
// the quotes are never model-authored — they're `cited_text` + char ranges
// computed by the API against the exact text we sent.
import Anthropic from "@anthropic-ai/sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = await readFile(path.join(root, "data", "chgg-10k-fy2025.txt"), "utf8");
const sections = JSON.parse(
  await readFile(path.join(root, "data", "sections.json"), "utf8"),
);

const MODEL = process.env.CITATIONS_MODEL || "claude-opus-4-8";

const SYSTEM = [
  "You are an analyst reviewing an SEC Form 10-K. Work strictly from the",
  "provided document. Report findings in EXACTLY this format, one block per",
  "finding, nothing before the first block or after the last:",
  "",
  "FINDING",
  "title: <short headline, max 10 words>",
  "category: <one of: risk-factor | competitive | financial-impact | strategy>",
  "severity: <one of: high | medium | low>",
  "summary: <1-2 sentences stating what the filing says>",
  "",
  "Every factual claim in a summary must be grounded in a citation of the",
  "exact supporting passage. Cite the single most specific passage for each",
  "finding — the sentence(s) that state it, not a whole paragraph. Do not",
  "repeat the same passage across findings.",
].join("\n");

const TASK = [
  "Find every statement in this 10-K where Chegg attributes business risk,",
  "competitive pressure, revenue/subscriber decline, or strategic change to",
  "generative AI, AI technologies, LLMs, or AI-powered competitors (e.g.",
  "ChatGPT). Cover Risk Factors, Business, and MD&A. One finding per distinct",
  "statement or theme; aim for 10-15 findings ordered as they appear in the",
  "document.",
].join(" ");

const client = new Anthropic();

console.log(`calling ${MODEL} with ${text.length} chars of document text...`);
const stream = client.messages.stream({
  model: MODEL,
  max_tokens: 8192,
  system: SYSTEM,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "text", media_type: "text/plain", data: text },
          title: "Chegg, Inc. Form 10-K (FY2025)",
          citations: { enabled: true },
        },
        { type: "text", text: TASK },
      ],
    },
  ],
});
stream.on("text", (t) => process.stdout.write(t));
const message = await stream.finalMessage();
console.log(`\n\nstop_reason=${message.stop_reason}`);

// Re-associate each block's citations with the finding being written at that
// point in the concatenated response text (blocks are fine-grained: a cited
// block carries the citations for exactly its own text).
let full = "";
const citationsByFinding = new Map(); // finding index (1-based) -> citations[]
for (const block of message.content) {
  if (block.type !== "text") continue;
  full += block.text;
  const findingIndex = (full.match(/^FINDING\s*$/gm) || []).length;
  if (!block.citations?.length || findingIndex === 0) continue;
  const list = citationsByFinding.get(findingIndex) ?? [];
  for (const c of block.citations) {
    if (c.type !== "char_location") continue;
    list.push({
      text: c.cited_text ?? "",
      charStart: c.start_char_index ?? 0,
      charEnd: c.end_char_index ?? 0,
    });
  }
  citationsByFinding.set(findingIndex, list);
}

const sectionFor = (offset) => {
  let label = "Front matter";
  for (const s of sections) if (offset >= s.start) label = s.label;
  return label;
};

const CATEGORIES = new Set(["risk-factor", "competitive", "financial-impact", "strategy"]);
const chunks = full.split(/^FINDING\s*$/m).slice(1);
const findings = [];
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  const field = (name) =>
    chunk.match(new RegExp(`^${name}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";
  const rawQuotes = citationsByFinding.get(i + 1) ?? [];
  // Dedupe identical spans; keep document order within the finding.
  const seen = new Set();
  const quotes = rawQuotes
    .filter((q) => {
      const key = `${q.charStart}-${q.charEnd}`;
      if (seen.has(key) || !q.text.trim()) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.charStart - b.charStart)
    .map((q) => ({ ...q, section: sectionFor(q.charStart) }));

  const category = field("category");
  findings.push({
    id: `f${i + 1}`,
    title: field("title") || `Finding ${i + 1}`,
    category: CATEGORIES.has(category) ? category : "risk-factor",
    severity: ["high", "medium", "low"].includes(field("severity"))
      ? field("severity")
      : "medium",
    summary: field("summary"),
    quotes,
  });
}

// Document order makes the minimap read top-to-bottom as findings stream in.
findings.sort(
  (a, b) => (a.quotes[0]?.charStart ?? Infinity) - (b.quotes[0]?.charStart ?? Infinity),
);
findings.forEach((f, i) => (f.id = `f${i + 1}`));

const out = {
  generatedWith: MODEL,
  generatedAt: new Date().toISOString(),
  document: "Chegg, Inc. Form 10-K FY2025 (EDGAR 0001364954-26-000021)",
  task: TASK,
  findings,
};
await mkdir(path.join(root, "lib"), { recursive: true });
await writeFile(
  path.join(root, "lib", "findings.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);

console.log(`\nwrote lib/findings.json: ${findings.length} findings`);
for (const f of findings) {
  const q = f.quotes[0];
  console.log(
    `  ${f.id} [${f.category}/${f.severity}] ${f.title} — ${f.quotes.length} quote(s)` +
      (q ? ` @${q.charStart} (${q.section})` : " ⚠ NO QUOTES"),
  );
}
console.log(
  `usage: in=${message.usage.input_tokens} out=${message.usage.output_tokens}`,
);
