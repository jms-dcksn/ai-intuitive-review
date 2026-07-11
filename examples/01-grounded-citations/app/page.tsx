"use client";

import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnswerView } from "@/components/AnswerView";
import { JudgeVerdict } from "@/components/JudgeVerdict";
import { SourcePane } from "@/components/SourcePane";
import { SAMPLE_DOCS, SAMPLE_QUESTION } from "@/lib/sample-data";
import type { Citation, ReviewUIMessage } from "@/lib/types";

export default function Home() {
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [active, setActive] = useState<Citation | null>(null);
  const [mocked, setMocked] = useState(false);
  const [judgeEnabled, setJudgeEnabled] = useState(false);

  // A ref so the transport reads the *current* toggle at send time, not the value
  // captured when the transport was built.
  const judgeRef = useRef(judgeEnabled);
  judgeRef.current = judgeEnabled;

  const { messages, sendMessage, status, error } = useChat<ReviewUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/ask",
      // We POST a plain { question, judge }, not a message list — extract the
      // question from the last user message so the route stays simple.
      prepareSendMessagesRequest: ({ messages }) => {
        const last = messages[messages.length - 1];
        const text = last.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        return { body: { question: text, judge: judgeRef.current } };
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

  const judgePart = assistant?.parts.find((p) => p.type === "data-judge");
  const answerHasText = assistant?.parts.some(
    (p) => p.type === "text" && p.text.trim().length > 0,
  );
  // The judge runs at the tail of the same stream: once answer text exists but the
  // verdict part hasn't landed, we're mid-judging. Requires the toggle was on.
  const judging = Boolean(
    judgeEnabled && streaming && answerHasText && !judgePart,
  );

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
        <label className="toggle" title="Score the answer's faithfulness to the sources with a separate judge model">
          <input
            type="checkbox"
            checked={judgeEnabled}
            onChange={(e) => setJudgeEnabled(e.target.checked)}
          />
          Faithfulness judge
        </label>
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
            <>
              <AnswerView
                parts={assistant.parts}
                streaming={streaming}
                activeCitation={active}
                onSelect={setActive}
                judge={judgePart?.data ?? null}
              />
              <JudgeVerdict
                verdict={judgePart?.data ?? null}
                judging={judging}
              />
            </>
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
