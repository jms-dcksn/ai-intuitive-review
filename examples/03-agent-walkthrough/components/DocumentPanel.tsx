"use client";

import { useEffect, useRef } from "react";
import { docSegments, getDoc } from "@/lib/chart";
import type { Evidence } from "@/lib/types";

/**
 * "Clearly citing a source" made literal: any citation — on a checkpoint card,
 * a ledger receipt, or a brief line — opens the *full* source document here,
 * scrolled to the exact span the decision rests on. The corpus is real document
 * text, so there's always a whole document behind every snippet.
 */
export function DocumentPanel({ target, onClose }: { target: Evidence; onClose: () => void }) {
  const doc = getDoc(target.docId);
  const markRef = useRef<HTMLElement>(null);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [target.docId, target.spanId]);

  if (!doc) return null;

  return (
    <div className="doc-overlay" onClick={onClose}>
      <aside className="doc-panel" onClick={(e) => e.stopPropagation()}>
        <div className="doc-head">
          <div>
            <div className="doc-title">{doc.title}</div>
            <div className="doc-date">{doc.date}</div>
          </div>
          <button className="ghost doc-close" onClick={onClose}>
            Close
          </button>
        </div>
        <pre className="doc-body">
          {docSegments(doc).map((seg, i) =>
            seg.spanId === target.spanId ? (
              <mark key={i} ref={markRef}>
                {seg.text}
              </mark>
            ) : (
              <span key={i} className={seg.spanId ? "doc-span" : undefined}>
                {seg.text}
              </span>
            ),
          )}
        </pre>
        <div className="doc-foot">Synthetic document — demo content, not a real patient record.</div>
      </aside>
    </div>
  );
}
