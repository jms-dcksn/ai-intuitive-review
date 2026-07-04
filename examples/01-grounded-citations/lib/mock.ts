import type { SourceDoc } from "./types";
import type { SegmentWriter } from "./segment-writer";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A recorded, deterministic answer streamed into `out` at a realistic cadence —
 * so the demo shows the *streaming* UX (text filling in, markers popping after
 * their sentence) without an API key, in the spirit of `rlm-deep-agents`.
 *
 * Char ranges are resolved from the live sample text with `indexOf`, so they stay
 * correct even if the sample copy is edited. This stands in for the API, not
 * replaces it: it only knows this one canned answer.
 */
export async function streamMockAnswer(
  out: SegmentWriter,
  docs: SourceDoc[],
): Promise<void> {
  const span = (id: string, needle: string) => {
    const doc = docs.find((d) => d.id === id)!;
    const startChar = doc.text.indexOf(needle);
    return {
      docId: doc.id,
      docTitle: doc.title,
      citedText: needle,
      startChar,
      endChar: startChar + needle.length,
    };
  };

  const script: Array<
    { text: string } | { cite: Parameters<SegmentWriter["citation"]>[0] }
  > = [
    { text: "Enterprise plans have a 30-day refund window, measured from the invoice date. " },
    {
      cite: span(
        "refund-policy",
        "Enterprise plans have a 30-day refund window from the invoice date.",
      ),
    },
    { text: "There are two conditions: the refund requires sign-off from the account's assigned Customer Success Manager, " },
    {
      cite: span(
        "refund-policy",
        "Refunds on Enterprise plans require sign-off from the account's assigned Customer Success Manager.",
      ),
    },
    { text: "and it must fall inside that window — once the 30 days pass, prepaid fees are non-refundable. " },
    {
      cite: span(
        "enterprise-terms",
        "after that window, prepaid fees are non-refundable.",
      ),
    },
    { text: "(Note: the 14-day figure applies only to self-serve Starter/Pro plans, not Enterprise.)" },
  ];

  for (const step of script) {
    if ("text" in step) {
      // Stream word-by-word so the client sees a real token cadence.
      for (const word of step.text.split(/(\s+)/)) {
        out.text(word);
        await sleep(18);
      }
    } else {
      await sleep(120);
      out.citation(step.cite);
    }
  }
  out.end();
}
