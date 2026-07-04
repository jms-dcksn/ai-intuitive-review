"use client";

import type { Citation } from "@/lib/types";

/**
 * A single inline footnote marker, e.g. `[1]`. Hover reveals the source + the
 * exact quoted span; clicking selects it so the source pane can scroll and
 * highlight. This is the smallest reusable trust primitive in the repo.
 */
export function CitationMarker({
  citation,
  active,
  onSelect,
}: {
  citation: Citation;
  active: boolean;
  onSelect: (c: Citation) => void;
}) {
  return (
    <span
      className={`cite${active ? " active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(citation)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(citation);
        }
      }}
      aria-label={`Citation ${citation.n} from ${citation.docTitle}`}
    >
      {citation.n}
      <span className="tooltip" role="tooltip">
        <span className="src">{citation.docTitle}</span>
        <span className="quote">&ldquo;{citation.citedText}&rdquo;</span>
      </span>
    </span>
  );
}
