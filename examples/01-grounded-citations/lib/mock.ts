import type { AskResponse, SourceDoc } from "./types";

/**
 * A recorded, deterministic response for the sample question over the sample
 * docs — so the demo runs (and the UI can be reviewed) without an API key, in the
 * same spirit as the sibling `rlm-deep-agents` examples.
 *
 * Char ranges are computed from the live document text at call time, so they stay
 * correct even if the sample copy is edited. This is a stand-in for the API, not
 * a substitute — it only knows the one canned answer.
 */
export function mockAnswer(docs: SourceDoc[]): AskResponse {
  const find = (id: string, needle: string) => {
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

  const c1 = {
    n: 1,
    ...find(
      "refund-policy",
      "Enterprise plans have a 30-day refund window from the invoice date.",
    ),
  };
  const c2 = {
    n: 2,
    ...find(
      "refund-policy",
      "Refunds on Enterprise plans require sign-off from the account's assigned Customer Success Manager.",
    ),
  };
  const c3 = {
    n: 3,
    ...find(
      "enterprise-terms",
      "after that window, prepaid fees are non-refundable.",
    ),
  };

  return {
    blocks: [
      {
        text: "Enterprise plans have a 30-day refund window, measured from the invoice date. ",
        citations: [c1],
      },
      {
        text: "There are two conditions: the refund requires sign-off from the account's assigned Customer Success Manager, ",
        citations: [c2],
      },
      {
        text: "and it must fall inside that window — once the 30 days pass, prepaid fees are non-refundable. ",
        citations: [c3],
      },
      {
        text: "(Note: the 14-day figure applies only to self-serve Starter/Pro plans, not Enterprise.)",
        citations: [],
      },
    ],
    citations: [c1, c2, c3],
  };
}
