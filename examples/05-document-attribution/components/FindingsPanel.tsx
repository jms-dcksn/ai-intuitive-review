"use client";

import { useEffect, useRef } from "react";
import { CATEGORY_LABELS, type Finding } from "@/lib/types";

interface FindingsPanelProps {
  findings: Finding[];
  selectedId: string | null;
  /** Findings whose quote could not be located in the rendered document. */
  failedIds: Set<string>;
  streaming: boolean;
  onSelect: (id: string) => void;
}

export function FindingsPanel({
  findings,
  selectedId,
  failedIds,
  streaming,
  onSelect,
}: FindingsPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // A selection made elsewhere (minimap) should bring its card into view.
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-finding-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className="findings" ref={listRef}>
      {findings.map((f) => {
        const q = f.quotes[0];
        // Display-only cleanup: cited spans that start at a list item carry the
        // list marker character. The stored quote stays verbatim.
        const quoteText = q?.text.replace(/^[\s•◦▪·]+/, "") ?? "";
        const failed = failedIds.has(f.id);
        return (
          <button
            key={f.id}
            data-finding-id={f.id}
            className={`finding cat-${f.category}${
              f.id === selectedId ? " selected" : ""
            }`}
            onClick={() => onSelect(f.id)}
          >
            <div className="finding-head">
              <span className={`cat-dot cat-${f.category}`} />
              <span className="finding-title">{f.title}</span>
              <span className={`sev sev-${f.severity}`}>{f.severity}</span>
            </div>
            <div className="finding-meta">
              <span>{CATEGORY_LABELS[f.category]}</span>
              {q && <span className="crumb">{q.section}</span>}
            </div>
            <p className="finding-summary">{f.summary}</p>
            {q && (
              <blockquote className="finding-quote">
                “{quoteText.length > 220 ? `${quoteText.slice(0, 220)}…` : quoteText}”
              </blockquote>
            )}
            {failed && (
              <div className="finding-failed">
                ⚠ span not located in document — quote shown above is unverified
                in place
              </div>
            )}
          </button>
        );
      })}
      {streaming && (
        <div className="finding-pending">
          <span className="spinner" /> reading the filing…
        </div>
      )}
    </div>
  );
}
