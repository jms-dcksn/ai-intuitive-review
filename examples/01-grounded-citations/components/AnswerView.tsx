"use client";

import type {
  Citation,
  FaithfulnessVerdict,
  ReviewUIMessage,
} from "@/lib/types";
import { CitationMarker } from "./Citation";

type Part = ReviewUIMessage["parts"][number];

/**
 * Renders the streaming answer from AI SDK message parts, with two layers of
 * grounding signal on each text run:
 *
 *  - **structural** — does a citation immediately follow it? (the `[n]` marker,
 *    and the `ungrounded` flag when nothing does);
 *  - **semantic** — once the faithfulness judge has run, its per-segment verdict.
 *
 * When both are present we render the *reconciliation* — the interesting cases are
 * the disagreements: a **cited** run the judge won't support (a mis-citation), and
 * an **ungrounded** run the judge *does* support (the flag was a false alarm). The
 * judge's per-segment index lines up with the render order of text parts, so the
 * k-th text run maps to `judge.segments[k]`.
 */
export function AnswerView({
  parts,
  streaming,
  activeCitation,
  onSelect,
  judge,
}: {
  parts: Part[];
  streaming: boolean;
  activeCitation: Citation | null;
  onSelect: (c: Citation) => void;
  judge: FaithfulnessVerdict | null;
}) {
  let textRun = -1; // running index of text parts, to key into judge.segments

  return (
    <div className="answer">
      {parts.map((part, i) => {
        if (part.type === "text") {
          textRun += 1;
          const meaningful = part.text.trim().length > 0;
          const grounded = parts[i + 1]?.type === "data-citation";
          // The judge scores only finished answers; mid-stream we show structure.
          const seg = !streaming ? judge?.segments[textRun] : undefined;
          const flag = reconcile(meaningful, grounded, seg);

          return (
            <span key={i}>
              <span className={flag?.textClass}>{part.text}</span>
              {flag && (
                <span
                  className={`recon-badge ${flag.tone}`}
                  title={flag.title}
                >
                  {flag.label}
                </span>
              )}
            </span>
          );
        }

        if (part.type === "data-citation") {
          const citation = part.data;
          return (
            <CitationMarker
              key={i}
              citation={citation}
              active={activeCitation?.n === citation.n}
              onSelect={onSelect}
            />
          );
        }

        return null;
      })}
      {streaming && <span className="caret" aria-hidden />}
    </div>
  );
}

type Flag = { label: string; tone: string; title: string; textClass?: string };

/**
 * Cross the structural signal (`grounded`) with the judge's verdict (`seg`) for
 * one text run and return the badge to render, or `null` for the boring cases
 * (agreement, or nothing worth flagging). Falls back to the plain `ungrounded`
 * badge when the judge hasn't run.
 */
function reconcile(
  meaningful: boolean,
  grounded: boolean,
  seg: FaithfulnessVerdict["segments"][number] | undefined,
): Flag | null {
  if (!meaningful) return null;

  // No judge verdict for this run → original structural-only behavior.
  if (!seg) {
    return grounded
      ? null
      : { label: "ungrounded", tone: "warn", title: "No source cited" };
  }

  const supported = seg.status === "supported";
  const where = seg.docId ? ` (${seg.docId})` : "";

  if (grounded) {
    // Cited and the judge agrees — the common, good case: stay quiet.
    if (supported) return null;
    // Cited, but the judge won't back it: a mis-citation. The sharpest signal.
    return {
      label: `cited · ${seg.status}`,
      tone: "bad",
      title: `Cited, but the judge says ${seg.status}: ${seg.rationale}${where}`,
      textClass: "mismatch",
    };
  }

  // Ungrounded but the judge finds it supported: the flag was a false alarm.
  if (supported) {
    return {
      label: "uncited · verified",
      tone: "ok",
      title: `Flagged ungrounded, but the judge confirms it's supported${where}: ${seg.rationale}`,
      textClass: "verified",
    };
  }

  // Ungrounded and the judge agrees it isn't supported: upgrade the warning.
  return {
    label: seg.status,
    tone: "bad",
    title: `${seg.rationale}${where}`,
    textClass: "mismatch",
  };
}
