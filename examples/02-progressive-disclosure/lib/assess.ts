import { anthropic } from "@ai-sdk/anthropic";
import { streamObject } from "ai";
import { reportSchema } from "./schema";
import { SOURCE_MATERIAL, TASK } from "./sample-data";

const MODEL = process.env.ASSESS_MODEL || "claude-sonnet-4-5";

const SYSTEM = [
  "You are a procurement risk reviewer. Read the source material and produce a",
  "tiered report that conforms to the schema. Put the most decision-relevant",
  "findings first. Keep each `summary` to one sentence a busy reviewer can scan;",
  "reserve depth for `detail`; and put the raw underlying facts in `evidence`,",
  "quoting the source material closely. Do not invent facts that aren't supported",
  "by the material.",
].join(" ");

/**
 * Stream a tiered {@link reportSchema} object with the AI SDK's `streamObject`.
 * The response is the object serialized as it's generated, so the client's
 * `useObject` hook can render the tree top-down as fields arrive — verdict first,
 * then findings filling in one at a time. This is the generative-UI counterpart
 * to example 01's custom data parts: structured streaming instead of text+parts.
 */
export function streamReport() {
  return streamObject({
    model: anthropic(MODEL),
    schema: reportSchema,
    system: SYSTEM,
    prompt: `${TASK}\n\n=== SOURCE MATERIAL ===\n${SOURCE_MATERIAL}`,
  });
}
