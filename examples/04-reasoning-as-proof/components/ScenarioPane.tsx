"use client";

import type { ScenarioDoc } from "@/lib/sample-data";

/**
 * The source material, verbatim — so every clause and number the reasoning
 * cites can be audited without leaving the page. Proof-of-work only counts as
 * proof if the user can check it.
 */
export function ScenarioPane({ docs }: { docs: ScenarioDoc[] }) {
  return (
    <div>
      {docs.map((doc) => (
        <div key={doc.id} className="doc">
          <div className="doc-title">{doc.title}</div>
          <div className="doc-body">{doc.text}</div>
        </div>
      ))}
    </div>
  );
}
