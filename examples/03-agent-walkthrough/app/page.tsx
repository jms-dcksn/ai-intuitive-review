"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { reduceParts } from "@/lib/ledger";
import { TASK } from "@/lib/corpus";
import type { LeaseUIMessage, Resolution, TrustDial } from "@/lib/types";
import { DecisionLedger } from "@/components/DecisionLedger";
import { CheckpointCard } from "@/components/CheckpointCard";
import { PhaseTimeline, PolicyBanner, TrustDialControl } from "@/components/Sidebar";

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [dial, setDial] = useState<TrustDial>("balanced");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);
  const [mocked, setMocked] = useState(false);

  const { messages, sendMessage, status } = useChat<LeaseUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/analyze",
      // We drive everything through a structured body, not a message list.
      prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
    }),
    onData: (part) => {
      if (part.type === "data-mode") setMocked(part.data.mocked);
    },
  });

  const streaming = status === "submitted" || status === "streaming";
  const parts = messages.flatMap((m) => (m.role === "assistant" ? m.parts : []));
  const ledger = reduceParts(parts);
  const pending =
    [...ledger.checkpoints].reverse().find((c) => !resolved.has(c.id)) ?? null;

  function start() {
    const sid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Math.random());
    setSessionId(sid);
    setResolved(new Set());
    setStarted(true);
    sendMessage({ text: "start" }, { body: { sessionId: sid, dial } });
  }

  function resolve(r: Resolution) {
    setResolved((prev) => new Set(prev).add(r.checkpointId));
    sendMessage({ text: "resolve" }, { body: { sessionId, dial, resolution: r } });
  }

  return (
    <main className="app">
      <div className="header">
        <h1>Working in the Open</h1>
        <p>
          The agent analyzes a 30-lease portfolio and <strong>surfaces its
          consequential decisions as it goes</strong> — approving, correcting, or
          setting a policy that resolves a whole class at once. You validate a
          handful of calls live instead of auditing a 30-minute wall of
          conclusions. The <strong>trust dial</strong> sets how much it stops you.
        </p>
      </div>

      <div className="controls">
        <div className="task">
          <strong>Task:</strong> {TASK}
        </div>
        <button className="primary" onClick={start} disabled={streaming}>
          {started ? (streaming ? "Working…" : "Restart") : "Start analysis"}
        </button>
      </div>

      {mocked && (
        <div className="mock-banner">
          Choreographed demo run (no live model) — staged to show the exact trust
          checkpoints.
        </div>
      )}

      <div className="layout">
        <div className="main">
          {pending && (
            <CheckpointCard checkpoint={pending} disabled={streaming} onResolve={resolve} />
          )}
          {ledger.done && !pending && (
            <div className="done-card">
              <div className="done-flag">Analysis complete</div>
              <div className="done-summary">{ledger.done.summary}</div>
              <div className="done-stats">{ledger.done.stats}</div>
            </div>
          )}
          {started ? (
            <DecisionLedger decisions={ledger.decisions} />
          ) : (
            <p className="hint">
              Press <strong>Start analysis</strong>. Decisions stream into the
              ledger; the agent stops you only when it should.
            </p>
          )}
          {streaming && !pending && (
            <div className="working">
              <span className="dot" /> agent working…
            </div>
          )}
        </div>

        <aside className="side">
          <TrustDialControl value={dial} onChange={setDial} disabled={streaming} />
          <PhaseTimeline phases={ledger.phases} done={Boolean(ledger.done)} />
          <PolicyBanner policies={ledger.policies} />
        </aside>
      </div>
    </main>
  );
}
