"use client";

import type { Citation, ReviewUIMessage } from "@/lib/types";
import { CitationMarker } from "./Citation";

type Part = ReviewUIMessage["parts"][number];

/**
 * Renders the streaming answer from AI SDK message parts. Text parts render
 * inline; `data-citation` parts render as `[n]` markers right after the text they
 * ground. A meaningful text run with no citation immediately following it is a
 * claim with no source — flagged `ungrounded`, but only once streaming is done
 * (so a marker that simply hasn't arrived yet doesn't flash a false warning).
 */
export function AnswerView({
  parts,
  streaming,
  activeCitation,
  onSelect,
}: {
  parts: Part[];
  streaming: boolean;
  activeCitation: Citation | null;
  onSelect: (c: Citation) => void;
}) {
  return (
    <div className="answer">
      {parts.map((part, i) => {
        if (part.type === "text") {
          const nextIsCitation = parts[i + 1]?.type === "data-citation";
          const ungrounded =
            !streaming && !nextIsCitation && part.text.trim().length > 0;
          return (
            <span key={i}>
              <span className={ungrounded ? "ungrounded" : undefined}>
                {part.text}
              </span>
              {ungrounded && (
                <span className="ungrounded-badge" title="No source cited">
                  ungrounded
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
