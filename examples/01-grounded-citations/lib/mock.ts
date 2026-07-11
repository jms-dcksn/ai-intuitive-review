import type { AnswerSegment, FaithfulnessVerdict, SourceDoc } from "./types";
import type { SegmentWriter } from "./segment-writer";
import { assembleVerdict } from "./judge";

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

/**
 * A recorded verdict for the canned answer, so the judge UI works without a key.
 * It's keyed to the mock script's four segments (see `streamMockAnswer`). The
 * story it tells: the answer's one *uncited* segment (index 3) — the 14-day
 * Starter/Pro line the app flags `ungrounded` — is in fact **supported** (the
 * Refund Policy defines the 14-day self-serve window; Ticket #4821's internal note
 * confirms it excludes Enterprise). So the judge *corrects* a blind structural
 * flag inline: uncited ≠ unsupported. The three cited segments check out too.
 */
export function mockFaithfulnessVerdict(
  segments: AnswerSegment[],
): FaithfulnessVerdict {
  return assembleVerdict(
    segments,
    96,
    [
      {
        index: 0,
        status: "supported",
        rationale: "30-day Enterprise window stated verbatim in the Refund Policy.",
        docId: "refund-policy",
      },
      {
        index: 1,
        status: "supported",
        rationale: "CSM sign-off is listed as an Enterprise condition.",
        docId: "refund-policy",
      },
      {
        index: 2,
        status: "supported",
        rationale: "Enterprise Terms §4: after the window, prepaid fees are non-refundable.",
        docId: "enterprise-terms",
      },
      {
        index: 3,
        status: "supported",
        rationale:
          "Uncited, but the Refund Policy defines the 14-day self-serve window and Ticket #4821 confirms it excludes Enterprise — the 'ungrounded' flag is a false alarm.",
        docId: "refund-policy",
      },
    ],
    "recorded-mock",
  );
}
