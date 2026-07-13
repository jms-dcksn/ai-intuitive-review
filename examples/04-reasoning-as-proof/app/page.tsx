"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnswerView } from "@/components/AnswerView";
import { ReasoningPane, type ReasoningPhase } from "@/components/ReasoningPane";
import { ScenarioPane } from "@/components/ScenarioPane";
import { SAMPLE_QUESTION, SCENARIO_DOCS } from "@/lib/sample-data";
import type { ReasonUIMessage } from "@/lib/types";

export default function Home() {
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [mocked, setMocked] = useState(false);

  const { messages, sendMessage, status, error } = useChat<ReasonUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/reason",
      // We POST a plain { question }, not a message list — extract the question
      // from the last user message so the route stays simple.
      prepareSendMessagesRequest: ({ messages }) => {
        const last = messages[messages.length - 1];
        const text = last.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        return { body: { question: text } };
      },
    }),
    // The transient `data-mode` part never lands in message.parts, so catch it
    // here to toggle the "showing recorded run" banner.
    onData: (part) => {
      if (part.type === "data-mode") setMocked(part.data.mocked);
    },
  });

  const streaming = status === "submitted" || status === "streaming";
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");

  // The two channels of the same message, ranked by the UI: reasoning parts
  // (the working) and text parts (the answer).
  const reasoningText =
    assistant?.parts
      .filter((p) => p.type === "reasoning")
      .map((p) => p.text)
      .join("\n\n") ?? "";
  const answerText =
    assistant?.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";
  const metaPart = assistant?.parts.find((p) => p.type === "data-meta");

  const phase: ReasoningPhase = !assistant && !streaming
    ? "idle"
    : streaming && !answerText
      ? "thinking"
      : streaming
        ? "answering"
        : "done";

  // Time the thinking: from the first reasoning token to the first answer token
  // (or end of stream). Client-side wall clock is honest enough for a receipt.
  const thinkStart = useRef<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  useEffect(() => {
    if (reasoningText && thinkStart.current === null) {
      thinkStart.current = Date.now();
    }
    if (
      thinkStart.current !== null &&
      durationMs === null &&
      (answerText || !streaming)
    ) {
      setDurationMs(Date.now() - thinkStart.current);
    }
  }, [reasoningText, answerText, streaming, durationMs]);

  function ask() {
    thinkStart.current = null;
    setDurationMs(null);
    sendMessage({ text: question });
  }

  return (
    <main className="app">
      <div className="header">
        <h1>Reasoning as Proof</h1>
        <p>
          The model&rsquo;s extended thinking streams into a separate, muted
          reasoning channel while it works — proof-of-work you can watch — then
          collapses to a receipt the moment the answer lands. The working stays
          one click away, labeled as deliberation, never outranking the answer.
        </p>
      </div>

      <div className="controls">
        <input
          className="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !streaming && ask()}
          placeholder="Ask a question about the scenario…"
        />
        <button onClick={ask} disabled={streaming}>
          {streaming ? "Working…" : "Ask"}
        </button>
      </div>

      {error && <div className="mock-banner error">Error: {error.message}</div>}

      <div className="split">
        <div>
          {mocked && (
            <div className="mock-banner">
              No <code>ANTHROPIC_API_KEY</code> set — streaming a recorded
              reasoning trace and answer.
            </div>
          )}
          <ReasoningPane
            text={reasoningText}
            phase={phase}
            meta={metaPart?.data ?? null}
            durationMs={durationMs}
          />
          <div className="panel">
            <h2>Answer</h2>
            {assistant || streaming ? (
              <AnswerView text={answerText} streaming={streaming} />
            ) : (
              <p className="hint">
                Press <strong>Ask</strong> and watch the model reason before it
                answers.
              </p>
            )}
          </div>
        </div>

        <div className="panel">
          <h2>Scenario — check the working against these</h2>
          <ScenarioPane docs={SCENARIO_DOCS} />
        </div>
      </div>
    </main>
  );
}
