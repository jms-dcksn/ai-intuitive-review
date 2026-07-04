"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnswerView } from "@/components/AnswerView";
import { SourcePane } from "@/components/SourcePane";
import { SAMPLE_DOCS, SAMPLE_QUESTION } from "@/lib/sample-data";
import type { Citation, ReviewUIMessage } from "@/lib/types";

export default function Home() {
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [active, setActive] = useState<Citation | null>(null);
  const [mocked, setMocked] = useState(false);

  const { messages, sendMessage, status, error } = useChat<ReviewUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/ask",
      // We POST a plain { question }, not a message list — extract it from the
      // last user message so the route stays simple.
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
    // here to toggle the "showing recorded answer" banner.
    onData: (part) => {
      if (part.type === "data-mode") setMocked(part.data.mocked);
    },
  });

  const streaming = status === "submitted" || status === "streaming";
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");

  function ask() {
    setActive(null);
    sendMessage({ text: question });
  }

  return (
    <main className="app">
      <div className="header">
        <h1>Grounded Citations</h1>
        <p>
          The answer streams in, grounded in the source documents on the right.
          Hover a{" "}
          <span className="cite" style={{ cursor: "default" }}>
            n
          </span>{" "}
          marker to see the exact quoted span; click it to highlight that span in
          its source. Claims with no source are flagged{" "}
          <span className="ungrounded-badge">ungrounded</span>.
        </p>
      </div>

      <div className="controls">
        <input
          className="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !streaming && ask()}
          placeholder="Ask a question about the source documents…"
        />
        <button onClick={ask} disabled={streaming}>
          {streaming ? "Streaming…" : "Ask"}
        </button>
      </div>

      {error && <div className="mock-banner error">Error: {error.message}</div>}

      <div className="split">
        <div className="panel">
          <h2>Answer</h2>
          {mocked && (
            <div className="mock-banner">
              No <code>ANTHROPIC_API_KEY</code> set — streaming the recorded sample
              answer.
            </div>
          )}
          {assistant ? (
            <AnswerView
              parts={assistant.parts}
              streaming={streaming}
              activeCitation={active}
              onSelect={setActive}
            />
          ) : (
            <p className="hint">
              Press <strong>Ask</strong> to get a grounded answer.
            </p>
          )}
        </div>

        <div className="panel">
          <h2>Sources</h2>
          <SourcePane docs={SAMPLE_DOCS} activeCitation={active} />
        </div>
      </div>
    </main>
  );
}
