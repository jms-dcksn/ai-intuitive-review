"use client";

import { useState } from "react";
import { AnswerView } from "@/components/AnswerView";
import { SourcePane } from "@/components/SourcePane";
import { SAMPLE_DOCS, SAMPLE_QUESTION } from "@/lib/sample-data";
import type { AskResponse, Citation } from "@/lib/types";

type AskResult = AskResponse & { mocked?: boolean };

export default function Home() {
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [result, setResult] = useState<AskResult | null>(null);
  const [active, setActive] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setLoading(true);
    setError(null);
    setActive(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data as AskResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <div className="header">
        <h1>Grounded Citations</h1>
        <p>
          The answer is grounded in the source documents on the right. Hover a{" "}
          <span className="cite" style={{ cursor: "default" }}>
            n
          </span>{" "}
          marker to see the exact quoted span; click it to highlight that span in
          its source. Claims with no source are flagged as{" "}
          <span className="ungrounded-badge">ungrounded</span>.
        </p>
      </div>

      <div className="controls">
        <input
          className="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about the source documents…"
        />
        <button onClick={ask} disabled={loading}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </div>

      {error && <div className="mock-banner error">Error: {error}</div>}

      <div className="split">
        <div className="panel">
          <h2>Answer</h2>
          {result?.mocked && (
            <div className="mock-banner">
              No <code>ANTHROPIC_API_KEY</code> set — showing the recorded sample
              answer.
            </div>
          )}
          {result ? (
            <AnswerView
              blocks={result.blocks}
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
