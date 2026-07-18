"use client";

import type { FeedItem } from "@/lib/feed";
import type { ActionEvent } from "@/lib/types";

const STATUS_LABEL: Record<ActionEvent["status"], string> = {
  running: "running",
  ok: "auto-ran",
  awaiting: "awaiting you",
  executed: "executed",
  rejected: "rejected",
};

/**
 * The run transcript: the agent's narration lines interleaved with one row per
 * tool touch. Read rows are muted receipts (they ran freely); write rows carry
 * their arguments and end as executed-with-receipt or rejected-never-fired —
 * the audit trail the done card's stats summarize.
 */
export function ActionFeed({ items }: { items: FeedItem[] }) {
  const actionCount = items.filter((i) => i.kind === "action").length;
  return (
    <div className="feed">
      <div className="feed-head">
        <span className="feed-title">Run activity</span>
        <span className="spacer" />
        <span className="feed-count">
          {actionCount} tool call{actionCount === 1 ? "" : "s"}
        </span>
      </div>
      {items.length === 0 && <div className="empty">Nothing yet — the run streams in here.</div>}
      {items.map((it) =>
        it.kind === "step" ? (
          <div key={it.step.id} className="step-note">
            {it.step.text}
          </div>
        ) : (
          <ActionRow key={it.action.id} action={it.action} />
        ),
      )}
    </div>
  );
}

function ActionRow({ action: a }: { action: ActionEvent }) {
  const showArgs = a.risk === "write" && a.args && a.status !== "awaiting";
  return (
    <div className={`act ${a.status}`}>
      <div className="act-head">
        <span className={`risk ${a.risk}`}>{a.risk}</span>
        <span className="act-title">{a.title}</span>
        {a.edited && <span className="edited-tag">edited by you</span>}
        <span className="spacer" />
        <span className={`status ${a.status}`}>{STATUS_LABEL[a.status]}</span>
      </div>
      {a.detail && <div className="act-detail">{a.detail}</div>}
      {showArgs && (
        <div className="act-args">
          {a.args!.map((f) => (
            <div key={f.key} className="act-arg">
              <span className="k">{f.label}</span>
              <span className="v">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {a.receipt && <div className="act-receipt">{a.receipt}</div>}
    </div>
  );
}
