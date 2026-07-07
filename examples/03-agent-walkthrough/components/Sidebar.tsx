"use client";

import type { Phase, Policy, TrustDial } from "@/lib/types";

const PHASE_NAMES = ["Triage", "Deep read", "Synthesis"];

export function PhaseTimeline({ phases, done }: { phases: Phase[]; done: boolean }) {
  const current = phases.length ? phases[phases.length - 1].index : 0;
  return (
    <div className="side-card">
      <div className="side-title">Phases</div>
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
 * The sublinear-validation moment made visible: one decision that resolved a whole
 * class. This is the banner that says "you didn't have to review 8 leases."
 */
export function PolicyBanner({ policies }: { policies: Policy[] }) {
  if (!policies.length) return null;
  return (
    <div className="side-card policy">
      <div className="side-title">Policies adopted</div>
      {policies.map((p) => (
        <div key={p.id} className="policy-item">
          <div className="policy-count">1 decision → {p.count} resolved</div>
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
    { v: "autonomy", label: "Autonomy", hint: "only hard blockers stop you" },
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
      <div className="dial-note">Move it any time — tighten for a risky stretch, loosen as trust builds.</div>
    </div>
  );
}
