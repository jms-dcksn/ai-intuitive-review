import Anthropic from "@anthropic-ai/sdk";
import type { UIMessageStreamWriter } from "ai";
import type { ScenarioDoc } from "./sample-data";
import type { ReasonUIMessage } from "./types";

const MODEL = process.env.REASONING_MODEL || "claude-opus-4-8";

const SYSTEM = [
  "You advise a SaaS provider's finance and legal team. Answer strictly from",
  "the contract excerpts and account file provided. Work through the relevant",
  "clauses and the arithmetic carefully, then give a direct recommendation:",
  "state the legal position, the exact dollar amounts with the calculation",
  "shown compactly, and any caveat the team should know. Keep the final answer",
  "under ~250 words; the careful deliberation belongs in your thinking, not",
  "the answer.",
].join(" ");

type Writer = UIMessageStreamWriter<ReasonUIMessage>;

/**
 * Stream a reasoned answer into the AI SDK message stream, splitting the model's
 * two output channels into two native part types:
 *
 *   thinking_delta  →  reasoning-* parts   (the working)
 *   text_delta      →  text-* parts        (the answer)
 *
 * Uses **adaptive thinking** with `display: "summarized"` — the current API.
 * (`budget_tokens` is removed on today's models, and the display opt-in matters:
 * the default is `"omitted"`, which streams thinking blocks with *empty* text.)
 * The trace we get is a summarized view of the reasoning, not the raw chain of
 * thought — the returned meta says so, and the UI passes that honesty on.
 *
 * `signature_delta` events are ignored: signatures only matter when replaying
 * thinking blocks back in multi-turn conversations, and this is single-turn.
 */
export async function streamReasonedAnswer(
  out: Writer,
  question: string,
  docs: ScenarioDoc[],
): Promise<{ model: string; redacted: boolean }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const material = docs
    .map((d) => `=== ${d.title} ===\n${d.text}`)
    .join("\n\n");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive", display: "summarized" },
    system: SYSTEM,
    messages: [
      { role: "user", content: `${material}\n\n=== QUESTION ===\n${question}` },
    ],
  });

  // Content blocks arrive sequentially, keyed by index. Each thinking block
  // becomes one reasoning part; each text block one text part.
  const openKind = new Map<number, "reasoning" | "text">();
  let redacted = false;

  for await (const event of stream) {
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block.type === "thinking") {
        openKind.set(event.index, "reasoning");
        out.write({ type: "reasoning-start", id: `b${event.index}` });
      } else if (block.type === "text") {
        openKind.set(event.index, "text");
        out.write({ type: "text-start", id: `b${event.index}` });
      } else if (block.type === "redacted_thinking") {
        // The API withheld this reasoning. Don't fake a trace — flag it so the
        // UI can say so.
        redacted = true;
      }
    } else if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta.type === "thinking_delta") {
        out.write({
          type: "reasoning-delta",
          id: `b${event.index}`,
          delta: delta.thinking,
        });
      } else if (delta.type === "text_delta") {
        out.write({ type: "text-delta", id: `b${event.index}`, delta: delta.text });
      }
      // signature_delta: intentionally ignored (single-turn).
    } else if (event.type === "content_block_stop") {
      const kind = openKind.get(event.index);
      if (kind === "reasoning") {
        out.write({ type: "reasoning-end", id: `b${event.index}` });
      } else if (kind === "text") {
        out.write({ type: "text-end", id: `b${event.index}` });
      }
      openKind.delete(event.index);
    }
  }

  return { model: MODEL, redacted };
}
