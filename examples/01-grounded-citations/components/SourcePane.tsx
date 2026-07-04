"use client";

import { useEffect, useRef } from "react";
import type { Citation, SourceDoc } from "@/lib/types";

/**
 * The right-hand source panel. It renders every document verbatim and, when a
 * citation is active, wraps the exact `[startChar, endChar]` span in a `<mark>`
 * and scrolls it into view. Because the offsets come from the Citations API
 * (not the model's prose), the highlight lands on the real source text.
 */
export function SourcePane({
  docs,
  activeCitation,
}: {
  docs: SourceDoc[];
  activeCitation: Citation | null;
}) {
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeCitation]);

  return (
    <div>
      {docs.map((doc) => {
        const active =
          activeCitation && activeCitation.docId === doc.id
            ? activeCitation
            : null;
        return (
          <div className="doc" key={doc.id}>
            <div className="doc-title">{doc.title}</div>
            <div className="doc-body">
              {active
                ? renderHighlighted(doc.text, active, markRef)
                : doc.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderHighlighted(
  text: string,
  citation: Citation,
  markRef: React.MutableRefObject<HTMLElement | null>,
) {
  const start = clamp(citation.startChar, 0, text.length);
  const end = clamp(citation.endChar, start, text.length);
  return (
    <>
      {text.slice(0, start)}
      <mark ref={markRef}>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
