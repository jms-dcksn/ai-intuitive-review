"use client";

import { useEffect, useRef, useState } from "react";

interface DocPaneProps {
  /** Fired once the filing HTML is injected and laid out. */
  onReady: (scroller: HTMLDivElement, content: HTMLDivElement) => void;
  onScroll: () => void;
}

/**
 * Renders the actual EDGAR filing HTML in a scroll container. The document is
 * injected once and never mutated afterwards — highlights are painted with the
 * CSS Custom Highlight API, so every DOM Range resolved against this content
 * stays valid for the life of the page.
 */
export function DocPane({ onReady, onScroll }: DocPaneProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // Injection is idempotent rather than ref-guarded: under React strict mode
  // the effect runs, is cancelled by the simulated unmount, and runs again —
  // a persistent "already started" ref would leave the second run with nothing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (contentRef.current && contentRef.current.childNodes.length > 0) {
          return;
        }
        const res = await fetch("/api/doc");
        if (!res.ok) throw new Error(`doc fetch failed: ${res.status}`);
        const html = await res.text();
        if (cancelled || !contentRef.current || !scrollerRef.current) return;
        contentRef.current.innerHTML = html;
        setState("ready");
        // Let layout settle before ranges/rects are computed against it.
        requestAnimationFrame(() => {
          if (!cancelled && scrollerRef.current && contentRef.current) {
            onReady(scrollerRef.current, contentRef.current);
          }
        });
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="doc-pane">
      <div className="doc-titlebar">
        <span className="doc-title">Chegg, Inc. — Form 10-K (FY2025)</span>
        <span className="doc-source">SEC EDGAR · 0001364954-26-000021</span>
      </div>
      <div className="doc-scroller" ref={scrollerRef} onScroll={onScroll}>
        {state === "loading" && <div className="doc-status">Loading filing…</div>}
        {state === "error" && (
          <div className="doc-status">Could not load the document.</div>
        )}
        <div className="doc-content" ref={contentRef} />
      </div>
    </div>
  );
}
