"use client";

import { useEffect, useState } from "react";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { reportSchema } from "@/lib/schema";
import { TASK, VENDOR } from "@/lib/sample-data";
import { ReportView } from "@/components/ReportView";

export default function Home() {
  const [mocked, setMocked] = useState(false);

  // Ask the route (once) whether we're about to see a live call or the mock.
  useEffect(() => {
    fetch("/api/assess")
      .then((r) => r.json())
      .then((d) => setMocked(Boolean(d.mocked)))
      .catch(() => {});
  }, []);

  const { object, submit, isLoading, error } = useObject({
    api: "/api/assess",
    schema: reportSchema,
  });

  return (
    <main className="app">
      <div className="header">
        <h1>Progressive Disclosure</h1>
        <p>
          The report streams in top-down — verdict first, then findings one at a
          time. Every finding stays <strong>collapsed by default</strong>: expand a
          card for the reasoning, then reveal its raw evidence one level deeper.
          Streaming controls what the model has revealed; disclosure controls what{" "}
          <em>you</em> choose to see.
        </p>
      </div>

      <div className="controls">
        <div className="task">
          <strong>Task:</strong> {TASK}
        </div>
        <button onClick={() => submit({ vendor: VENDOR })} disabled={isLoading}>
          {isLoading ? "Assessing…" : "Assess vendor"}
        </button>
      </div>

      {mocked && (
        <div className="mock-banner">
          No <code>ANTHROPIC_API_KEY</code> set — streaming the recorded sample
          report.
        </div>
      )}

      {error && (
        <div className="mock-banner error">Error: {error.message}</div>
      )}

      {object ? (
        <ReportView report={object} streaming={isLoading} />
      ) : (
        <p className="hint">
          Press <strong>Assess vendor</strong> to generate a tiered report.
        </p>
      )}
    </main>
  );
}
