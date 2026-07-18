"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { reduceParts } from "@/lib/feed";
import { TASK } from "@/lib/scenario";
import type { ApprovalUIMessage, Resolution } from "@/lib/types";
import { ActionFeed } from "@/components/ActionFeed";
import { ApprovalCard } from "@/components/ApprovalCard";
import { AuditTrail, TicketCard, ToolPermissions } from "@/components/Sidebar";

const SESSION_KEY = "hitl-session";

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);
  const [mocked, setMocked] = useState(false);
  const rehydrated = useRef(false);

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat<ApprovalUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/act",
      // We drive everything through a structured body, not a message list.
      prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
    }),
    onData: (part) => {
      if (part.type === "data-mode") setMocked(part.data.mocked);
    },
  });

  // Rehydrate a run after a refresh: the feed is server-authoritative, so we
  // rebuild the client from thread state instead of losing it. Runs once on mount.
  useEffect(() => {
    if (rehydrated.current) return;
    rehydrated.current = true;
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return;

    (async () => {
      try {
        const res = await fetch(`/api/act?sessionId=${encodeURIComponent(saved)}`);
        const snap = await res.json();
        if (!snap.found || !snap.actions?.length) return;

        const parts: ApprovalUIMessage["parts"] = [
          ...(snap.steps ?? []).map((data: unknown) => ({ type: "data-step" as const, data })),
          ...(snap.actions ?? []).map((data: unknown) => ({ type: "data-action" as const, data })),
          ...(snap.approvals ?? []).map((data: unknown) => ({ type: "data-approval" as const, data })),
          ...(snap.done ? [{ type: "data-done" as const, data: snap.done }] : []),
        ];

        setSessionId(saved);
        setMocked(Boolean(snap.mocked));
        setStarted(true);
        // Every approval except the one still open counts as already resolved.
        const openId: string | null = snap.pendingApprovalId ?? null;
        setResolved(
          new Set(
            (snap.approvals ?? [])
              .map((a: { id: string }) => a.id)
              .filter((id: string) => id !== openId),
          ),
        );
        setMessages([{ id: "rehydrated", role: "assistant", parts } as ApprovalUIMessage]);
      } catch {
        // Best-effort — a failed rehydrate just leaves the user on a fresh start.
      }
    })();
  }, [setMessages]);

  const streaming = status === "submitted" || status === "streaming";
  const parts = messages.flatMap((m) => (m.role === "assistant" ? m.parts : []));
  const feed = reduceParts(parts);
  const pending =
    [...feed.approvals].reverse().find((a) => !resolved.has(a.id)) ?? null;

  function start() {
    const sid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Math.random());
    localStorage.setItem(SESSION_KEY, sid);
    setSessionId(sid);
    setResolved(new Set());
    setStarted(true);
    setMessages([]); // drop any rehydrated run
    clearError();
    sendMessage({ text: "start" }, { body: { sessionId: sid } });
  }

  function resolve(r: Resolution) {
    setResolved((prev) => new Set(prev).add(r.approvalId));
    clearError();
    sendMessage({ text: "resolve" }, { body: { sessionId, resolution: r } });
  }

  return (
    <main className="app">
      <div className="header">
        <h1>Approval / Human-in-the-loop — the agent asks before it acts</h1>
        <p>
          A support agent investigates a billing complaint with read-only tools
          that stream by as receipts — then <strong>stops before every external
          action</strong>. Each write renders an approval card: the exact
          arguments it chose (edit them), a plain-language "what this will do",
          and consequence-labeled Approve / Reject.{" "}
          <strong>Nothing fires without a click</strong> — and a rejection isn't
          a dead end: the agent reads your reason and adapts.
        </p>
      </div>

      <div className="controls">
        <div className="task">
          <strong>Task:</strong> {TASK}
        </div>
        <button className="primary" onClick={start} disabled={streaming}>
          {started ? (streaming ? "Working…" : "Restart") : "Start the agent"}
        </button>
      </div>

      {mocked && (
        <div className="mock-banner">
          Choreographed demo run (no live model) — staged to hit the exact
          approval beats, including reject-and-adapt. Set{" "}
          <code>ANTHROPIC_API_KEY</code> for a live tool-calling agent.
        </div>
      )}

      <div className="layout">
        <div className="main">
          {error && (
            <div className="error-banner">
              The run failed: {error.message || "unknown error"}. Hit{" "}
              {started ? "Restart" : "Start the agent"} to try again.
            </div>
          )}
          {pending && (
            <ApprovalCard
              key={pending.id}
              approval={pending}
              disabled={streaming}
              onResolve={resolve}
            />
          )}
          {feed.done && !pending && (
            <div className="done-card">
              <div className="done-flag">Run complete</div>
              <div className="done-summary">{feed.done.summary}</div>
              <div className="done-stats">{feed.done.stats}</div>
            </div>
          )}
          {started ? (
            <ActionFeed items={feed.items} />
          ) : (
            <p className="hint">
              Press <strong>Start the agent</strong>. Reads run freely and
              stream into the feed; the first write stops the run with an
              approval card. Try approving, editing the arguments first, and
              rejecting with a note.
            </p>
          )}
          {streaming && !pending && (
            <div className="working">
              <span className="dot" /> agent working…
            </div>
          )}
        </div>

        <aside className="side">
          <TicketCard />
          <ToolPermissions />
          <AuditTrail actions={feed.actions} />
        </aside>
      </div>

      <footer className="disclaimer">
        Everything here is synthetic — the customer, the charges, and the
        "systems" the write tools touch are stubs that mint reference numbers.
        Nothing real is refunded, filed, or emailed.
      </footer>
    </main>
  );
}
