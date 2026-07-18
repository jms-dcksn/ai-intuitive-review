"use client";

import { useState } from "react";
import { WRITE_TOOLS } from "@/lib/scenario";
import type { ApprovalRequest, Resolution } from "@/lib/types";

const FLAGS: Record<ApprovalRequest["klass"], string> = {
  money: "WANTS TO MOVE MONEY",
  external: "WANTS TO CONTACT THE CUSTOMER",
  internal: "WANTS TO CHANGE INTERNAL STATE",
};

/**
 * The approval card — where review becomes authorization. Fixed anatomy:
 * the proposed action and why, the exact arguments the model chose (the
 * editable ones become inputs), a plain-language "what this will do" with a
 * reversibility badge, then three ways out that are all one gesture: approve
 * (consequence-labeled), edit-and-approve, or reject with an optional note
 * that goes back to the agent. Mount with `key={approval.id}` so edit state
 * resets per card.
 */
export function ApprovalCard({
  approval,
  disabled,
  onResolve,
}: {
  approval: ApprovalRequest;
  disabled: boolean;
  onResolve: (r: Resolution) => void;
}) {
  const ap = approval;
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(ap.args.map((f) => [f.key, f.value])),
  );

  const dirtyKeys = ap.args.filter((f) => values[f.key] !== f.value).map((f) => f.key);
  const dirty = dirtyKeys.length > 0;

  // Consequences track the *current* values — an edited amount changes what
  // "what this will do" promises, live. Falls back to the server's framing.
  const meta = WRITE_TOOLS[ap.tool];
  const willDo = meta ? meta.willDo(values) : ap.willDo;
  const approveLabel = meta ? meta.approveLabel(values) : ap.approveLabel;

  function approve() {
    onResolve({
      approvalId: ap.id,
      action: "approve",
      editedArgs: dirty
        ? Object.fromEntries(dirtyKeys.map((k) => [k, values[k]]))
        : undefined,
    });
  }

  function reject() {
    onResolve({ approvalId: ap.id, action: "reject", reason: reason.trim() || undefined });
  }

  return (
    <div className={`approval ${ap.klass}`}>
      <div className="ap-flag">{FLAGS[ap.klass]} · APPROVAL REQUIRED</div>
      <div className="ap-title">{ap.title}</div>
      <div className="ap-why">{ap.rationale}</div>

      <div className="ap-args">
        {ap.args.map((f) => (
          <div key={f.key} className="ap-arg">
            <div className="ap-arg-label">{f.label}</div>
            {editing && f.editable ? (
              f.multiline ? (
                <textarea
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )
            ) : (
              <div className={`ap-arg-value ${f.editable ? "" : "locked"}`}>{values[f.key]}</div>
            )}
          </div>
        ))}
      </div>
      {dirty && <div className="ap-edited-note">Edited — it executes with your values, not the agent's.</div>}

      <div className="ap-willdo">
        <div className="ap-willdo-label">
          What this will do
          <span className={`rev ${ap.reversible ? "yes" : "no"}`}>
            {ap.reversible ? "reversible" : "cannot be undone"}
          </span>
        </div>
        <ul>
          {willDo.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>

      <div className="ap-actions">
        <button className="primary" disabled={disabled} onClick={approve}>
          {dirty ? `${approveLabel} (your edits)` : approveLabel}
        </button>
        {editing ? (
          <button
            className="ghost"
            disabled={disabled}
            onClick={() => {
              setEditing(false);
              setValues(Object.fromEntries(ap.args.map((f) => [f.key, f.value])));
            }}
          >
            Discard edits
          </button>
        ) : (
          <button className="ghost" disabled={disabled} onClick={() => setEditing(true)}>
            Edit the details
          </button>
        )}
        <button className="danger" disabled={disabled} onClick={() => setRejecting((r) => !r)}>
          Reject — don't do this
        </button>
      </div>

      {rejecting && (
        <div className="ap-reject-box">
          <label htmlFor="reject-reason">Tell the agent why (optional)</label>
          <textarea
            id="reject-reason"
            value={reason}
            placeholder="e.g. Don't refund yet — check with billing first"
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="ap-reject-actions">
            <button className="danger solid" disabled={disabled} onClick={reject}>
              Confirm rejection
            </button>
            <button className="ghost" disabled={disabled} onClick={() => setRejecting(false)}>
              Back
            </button>
          </div>
          <div className="ap-reject-hint">
            The action never fires; your note goes back to the agent so it can adapt.
          </div>
        </div>
      )}
    </div>
  );
}
