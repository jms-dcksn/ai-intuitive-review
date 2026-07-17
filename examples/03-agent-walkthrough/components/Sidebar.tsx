"use client";

import { PATIENT } from "@/lib/chart";
import type { Phase, Policy, TrustDial } from "@/lib/types";

export function PatientCard() {
  return (
    <div className="side-card">
      <div className="side-title">Patient</div>
      <div className="patient-name">
        {PATIENT.name}, {PATIENT.age}
      </div>
      <div className="patient-summary">{PATIENT.summary}</div>
      <div className="patient-note">Synthetic chart — demo only.</div>
    </div>
  );
}

const PHASE_NAMES = ["Reconcile medications", "Review results", "Visit brief"];

export function PhaseTimeline({ phases, done }: { phases: Phase[]; done: boolean }) {
  const current = phases.length ? phases[phases.length - 1].index : 0;
  return (
    <div className="side-card">
      <div className="side-title">Progress</div>
      <ol className="phases">
        {PHASE_NAMES.map((name, i) => {
          const idx = i + 1;
          const state = done || idx < current ? "done" : idx === current ? "active" : "todo";
          return (
            <li key={name} className={`phase ${state}`}>
              <span className="phase-dot" />
              {name}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The sublinear-validation moment made visible: one decision that reconciled
 * several records at once. This is the banner that says "you didn't have to
 * review each of these."
 */
export function PolicyBanner({ policies }: { policies: Policy[] }) {
  if (!policies.length) return null;
  return (
    <div className="side-card policy">
      <div className="side-title">Rules you set</div>
      {policies.map((p) => (
        <div key={p.id} className="policy-item">
          <div className="policy-count">1 decision → {p.count} records resolved</div>
          <div className="policy-rule">{p.rule}</div>
          <div className="policy-scope">{p.appliesTo}</div>
        </div>
      ))}
    </div>
  );
}

export function TrustDialControl({
  value,
  onChange,
  disabled,
}: {
  value: TrustDial;
  onChange: (v: TrustDial) => void;
  disabled: boolean;
}) {
  const opts: { v: TrustDial; label: string; hint: string }[] = [
    { v: "oversight", label: "Oversight", hint: "confirm most judgment calls" },
    { v: "balanced", label: "Balanced", hint: "only uncertain / high-impact calls stop you" },
    { v: "autonomy", label: "Autonomy", hint: "only safety calls stop you" },
  ];
  return (
    <div className="side-card">
      <div className="side-title">Trust dial</div>
      <div className="seg vertical">
        {opts.map((o) => (
          <button
            key={o.v}
            className={value === o.v ? "on" : ""}
            disabled={disabled}
            onClick={() => onChange(o.v)}
          >
            <span className="seg-label">{o.label}</span>
            <span className="seg-hint">{o.hint}</span>
          </button>
        ))}
      </div>
      <div className="dial-note">
        Safety decisions (the allergy conflict) block at every setting — some
        calls are gated by category, not confidence.
      </div>
    </div>
  );
}
