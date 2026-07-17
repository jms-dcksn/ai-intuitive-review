import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import recorded from "@/lib/findings.json";
import type { AttributionUIMessage, Finding } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Replays the recorded analysis run (repo convention: the expensive grounded
 * call — one Citations API pass over ~92K tokens of 10-K text — happens once
 * in scripts/generate-findings.mjs; the demo is deterministic and key-free).
 * Findings stream as typed `data-finding` parts at reading cadence, then a
 * short text wrap-up lands as the answer.
 */
export async function POST(): Promise<Response> {
  const findings = recorded.findings as Finding[];

  const stream = createUIMessageStream<AttributionUIMessage>({
    execute: async ({ writer }) => {
      writer.write({
        type: "data-mode",
        data: {
          recorded: true,
          model: recorded.generatedWith,
          document: recorded.document,
        },
        transient: true,
      });

      await sleep(500);
      for (const finding of findings) {
        writer.write({ type: "data-finding", data: finding });
        await sleep(650);
      }

      const bySection = new Map<string, number>();
      for (const f of findings) {
        const s = f.quotes[0]?.section ?? "Unlocated";
        bySection.set(s, (bySection.get(s) ?? 0) + 1);
      }
      const distribution = [...bySection.entries()]
        .map(([s, n]) => `${n} in ${s}`)
        .join(", ");
      const summary =
        `Found ${findings.length} statements attributing risk, competitive ` +
        `pressure, or decline to generative AI (${distribution}). ` +
        `Every finding links to the exact span in the filing — click one to verify it in place.`;

      writer.write({ type: "text-start", id: "t0" });
      for (const word of summary.split(/(\s+)/)) {
        writer.write({ type: "text-delta", id: "t0", delta: word });
        if (word.trim()) await sleep(12);
      }
      writer.write({ type: "text-end", id: "t0" });
    },
    onError: (error) =>
      error instanceof Error ? error.message : "Streaming failed",
  });

  return createUIMessageStreamResponse({ stream });
}
