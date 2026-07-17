"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { DocPane } from "@/components/DocPane";
import { FindingsPanel } from "@/components/FindingsPanel";
import { Minimap, type MinimapMarker } from "@/components/Minimap";
import {
  buildAnchorIndex,
  findRange,
  highlightsSupported,
  setHighlight,
  type AnchorIndex,
} from "@/lib/anchor";
import recorded from "@/lib/findings.json";
import type { AttributionUIMessage, Finding, FindingCategory } from "@/lib/types";

const CATEGORIES: FindingCategory[] = [
  "risk-factor",
  "competitive",
  "financial-impact",
  "strategy",
];

export default function Home() {
  const [mode, setMode] = useState<{ recorded: boolean; model: string } | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ghost, setGhost] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [markers, setMarkers] = useState<MinimapMarker[]>([]);
  const [viewport, setViewport] = useState({ top: 0, height: 0.1 });

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef<AnchorIndex | null>(null);
  const rangesRef = useRef<Map<string, Range[]>>(new Map());
  const attemptedRef = useRef<Set<string>>(new Set());
  const [docReady, setDocReady] = useState(false);

  const { messages, sendMessage, status } = useChat<AttributionUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/analyze",
      // The route replays a recorded run — no request body needed.
      prepareSendMessagesRequest: () => ({ body: {} }),
    }),
    onData: (part) => {
      if (part.type === "data-mode") {
        setMode({ recorded: part.data.recorded, model: part.data.model });
      }
    },
  });

  const streaming = status === "submitted" || status === "streaming";
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");
  const findings: Finding[] =
    assistant?.parts
      .filter(
        (p): p is { type: "data-finding"; data: Finding } =>
          p.type === "data-finding",
      )
      .map((p) => p.data) ?? [];
  const answerText =
    assistant?.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";

  const handleDocReady = useCallback(
    (scroller: HTMLDivElement, content: HTMLDivElement) => {
      scrollerRef.current = scroller;
      // Index ~2M squashed chars off the critical path of first paint.
      setTimeout(() => {
        indexRef.current = buildAnchorIndex(content);
        setDocReady(true);
      }, 0);
    },
    [],
  );

  // Anchor findings as they stream in: quote → DOM Range → minimap marker.
  useEffect(() => {
    const index = indexRef.current;
    const scroller = scrollerRef.current;
    if (!index || !scroller) return;

    let changed = false;
    const newMarkers: MinimapMarker[] = [];
    const newFailed = new Set(failedIds);
    for (const f of findings) {
      if (attemptedRef.current.has(f.id)) continue;
      attemptedRef.current.add(f.id);
      changed = true;
      const ranges = f.quotes
        .map((q) => findRange(index, q.text))
        .filter((r): r is Range => r !== null);
      if (ranges.length === 0) {
        newFailed.add(f.id);
        continue;
      }
      rangesRef.current.set(f.id, ranges);
      const rect = ranges[0].getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();
      const top = rect.top - scRect.top + scroller.scrollTop;
      newMarkers.push({
        id: f.id,
        ratio: top / scroller.scrollHeight,
        category: f.category,
      });
    }
    if (changed) {
      if (newMarkers.length) setMarkers((prev) => [...prev, ...newMarkers]);
      if (newFailed.size !== failedIds.size) setFailedIds(newFailed);
    }
  }, [findings, docReady, failedIds]);

  // Ghost mode: every anchored span painted faintly, colored by category.
  useEffect(() => {
    for (const cat of CATEGORIES) {
      const ranges = ghost
        ? findings
            .filter((f) => f.category === cat)
            .flatMap((f) => rangesRef.current.get(f.id) ?? [])
        : [];
      setHighlight(`ghost-${cat}`, ranges);
    }
  }, [ghost, findings, markers.length]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    const ranges = rangesRef.current.get(id);
    const scroller = scrollerRef.current;
    if (!ranges || !scroller) return;
    setHighlight("finding-active", ranges);
    const rect = ranges[0].getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    const top = rect.top - scRect.top + scroller.scrollTop;
    scroller.scrollTo({ top: Math.max(top - 140, 0), behavior: "smooth" });
  }, []);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    requestAnimationFrame(() => {
      setViewport({
        top: scroller.scrollTop / scroller.scrollHeight,
        height: scroller.clientHeight / scroller.scrollHeight,
      });
    });
  }, []);

  const started = messages.length > 0;

  return (
    <div className="app">
      <header className="header">
        <h1>05 · Document Attribution &amp; Highlighting</h1>
        <p>
          An agent reads Chegg&apos;s real FY2025 Form 10-K (~370K characters,
          pulled from SEC EDGAR) and finds every statement attributing risk or
          decline to generative AI. Each finding carries an API-computed
          citation — click one to jump to the exact span in the filing. The
          minimap shows where all the evidence lives.
        </p>
      </header>

      <div className="controls">
        <button onClick={() => sendMessage({ text: recorded.task })} disabled={streaming || started}>
          {started ? "Analysis run" : "Run analysis"}
        </button>
        <label className="ghost-toggle">
          <input
            type="checkbox"
            checked={ghost}
            onChange={(e) => setGhost(e.target.checked)}
            disabled={markers.length === 0}
          />
          Show all spans in document
        </label>
        {mode?.recorded && (
          <span className="mode-banner">
            replaying recorded run · generated with {mode.model}
          </span>
        )}
        {docReady && !highlightsSupported() && (
          <span className="mode-banner warn-banner">
            CSS Highlight API unavailable — jumps work, highlights won&apos;t
            paint
          </span>
        )}
      </div>

      <div className="split">
        <aside className="left">
          {!started && (
            <div className="task-card">
              <div className="task-label">Agent task</div>
              <p>{recorded.task}</p>
            </div>
          )}
          <FindingsPanel
            findings={findings}
            selectedId={selectedId}
            failedIds={failedIds}
            streaming={streaming}
            onSelect={select}
          />
          {answerText && <div className="answer">{answerText}</div>}
        </aside>

        <main className="right">
          <DocPane onReady={handleDocReady} onScroll={handleScroll} />
          <Minimap
            markers={markers}
            viewport={viewport}
            selectedId={selectedId}
            onSelect={select}
          />
        </main>
      </div>
    </div>
  );
}
