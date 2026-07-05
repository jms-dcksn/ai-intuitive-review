"use client";

import type { DeepPartial } from "ai";
import type { Report } from "@/lib/schema";
import { FindingCard } from "./FindingCard";

type PartialReport = DeepPartial<Report>;

const REC_LABEL: Record<string, string> = {
  approve: "Approve",
  "approve-with-conditions": "Approve with conditions",
  reject: "Reject",
};

/**
 * Tier 0 (the verdict) plus the tier-1 list of finding cards. Everything renders
 * from the partial object `useObject` streams, so the verdict resolves first and
 * the findings pop in one at a time, top-down — while each card stays collapsed
 * so the user, not the stream, decides how deep to go.
 */
export function ReportView({
  report,
  streaming,
}: {
  report: PartialReport;
  streaming: boolean;
}) {
  const findings = report.findings ?? [];

  return (
    <div>
      <div className="verdict">
        <div className="verdict-row">
          {report.recommendation ? (
            <span className={`rec ${report.recommendation}`}>
              {REC_LABEL[report.recommendation] ?? report.recommendation}
            </span>
          ) : (
            <span className="skeleton" style={{ width: 140 }} />
          )}
          {report.confidence && (
            <span className="confidence">confidence: {report.confidence}</span>
          )}
        </div>
        <div className="verdict-text">
          {report.verdict ?? <span className="skeleton" style={{ width: "70%" }} />}
        </div>
      </div>

      <div className="findings-head">
        Findings{findings.length > 0 ? ` (${findings.length})` : ""}
      </div>

      {findings.map((f, i) =>
        f ? <FindingCard key={i} finding={f} streaming={streaming} /> : null,
      )}

      {streaming && (
        <div className="streaming-note">
          <span className="dot" aria-hidden />
          streaming findings…
        </div>
      )}
    </div>
  );
}
