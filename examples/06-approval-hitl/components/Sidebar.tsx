"use client";

import { READ_TOOLS, TICKET, WRITE_TOOLS } from "@/lib/scenario";
import type { ActionEvent } from "@/lib/types";

/** The ticket the agent is working — the "sample input" made visible. */
export function TicketCard() {
  return (
    <div className="side-card">
      <div className="side-title">Support ticket {TICKET.id}</div>
      <div className="ticket-subject">{TICKET.subject}</div>
      <div className="ticket-meta">
        {TICKET.from} · {TICKET.received}
      </div>
      <div className="ticket-body">{TICKET.body}</div>
    </div>
  );
}

/**
 * The standing rules of engagement: which tools run freely and which always
 * stop for a human. This is policy the user can read *before* the run — the
 * approval cards are this card, enforced.
 */
export function ToolPermissions() {
  return (
    <div className="side-card">
      <div className="side-title">Tool permissions</div>
      {Object.entries(READ_TOOLS).map(([name, t]) => (
        <div key={name} className="perm">
          <span className="perm-name">{name}</span>
          <span className="spacer" />
          <span className="perm-badge auto" title={t.label}>
            runs freely
          </span>
        </div>
      ))}
      {Object.entries(WRITE_TOOLS).map(([name, t]) => (
        <div key={name} className="perm">
          <span className="perm-name">{name}</span>
          <span className="spacer" />
          <span className="perm-badge asks" title={t.label}>
            asks first
          </span>
        </div>
      ))}
      <div className="perm-note">
        Reads are safe to run freely — they're how the agent earns its proposal.
        Writes touch money, customers, or systems, so every one stops here first.
      </div>
    </div>
  );
}

/** Live audit counts, derived from the feed — the "nothing fired without a click" ledger. */
export function AuditTrail({ actions }: { actions: ActionEvent[] }) {
  const reads = actions.filter((a) => a.risk === "read").length;
  const executed = actions.filter((a) => a.status === "executed").length;
  const rejected = actions.filter((a) => a.status === "rejected").length;
  const awaiting = actions.filter((a) => a.status === "awaiting").length;
  return (
    <div className="side-card">
      <div className="side-title">Audit trail</div>
      <div className="audit">
        <div className="audit-row">
          <span>Read-only calls (auto-ran)</span>
          <span className="n">{reads}</span>
        </div>
        <div className="audit-row">
          <span>Actions executed — by your click</span>
          <span className="n pos">{executed}</span>
        </div>
        <div className="audit-row">
          <span>Actions rejected — never fired</span>
          <span className="n red">{rejected}</span>
        </div>
        <div className="audit-row">
          <span>Awaiting your call</span>
          <span className="n">{awaiting}</span>
        </div>
      </div>
      <div className="audit-note">
        Actions fired without approval: <strong>0</strong> — by construction, not by promise.
      </div>
    </div>
  );
}
