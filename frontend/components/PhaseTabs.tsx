"use client";

import { useRef } from "react";
import { Icon, StateGlyph, type StateIcon } from "./Icon";
import type { EditionRules, PhaseDetail } from "@/lib/api";

export type PhaseState = { key: "done" | "live" | "next"; label: string; icon: StateIcon; cls: string };

export function phaseState(matches: PhaseDetail["matches"]): PhaseState {
  const live = matches.filter((m) => m.status !== "canceled");
  if (live.length && live.every((m) => m.status === "finished")) return { key: "done", label: "Terminée", icon: "check", cls: "text-muted" };
  if (live.some((m) => m.status === "finished" || m.status === "running")) return { key: "live", label: "En cours", icon: "live", cls: "text-ok" };
  return { key: "next", label: "À venir", icon: "clock", cls: "text-info" };
}

function StateLine({ st }: { st: PhaseState }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${st.cls}`}>
      <StateGlyph icon={st.icon} className="size-3" /> {st.label}
    </span>
  );
}

type Stage = { key: string; name: string; phases: PhaseDetail[] };

/** Regroupe les phases de données par étape du règlement : « Groupe A » et « Groupe B » forment une seule phase de groupes. */
export function stagesOf(phases: PhaseDetail[], rules: EditionRules | null): Stage[] {
  const stages: Stage[] = [];
  for (const p of phases) {
    const key = p.rules_key ?? `phase-${p.id}`;
    const existing = stages.find((s) => s.key === key);
    if (existing) existing.phases.push(p);
    else stages.push({ key, name: rules?.phases.find((r) => r.key === p.rules_key)?.name ?? p.name, phases: [p] });
  }
  return stages;
}

export const tabId = (id: number) => `phase-tab-${id}`;
export const PANEL_ID = "phase-panel";

/** Onglets de phase, numérotés comme « Les phases, dans l'ordre ». Flèches gauche/droite, Début, Fin. */
export function PhaseTabs({
  stages,
  selected,
  onSelect,
  isMine,
}: {
  stages: Stage[];
  selected: number;
  onSelect: (id: number) => void;
  isMine: (p: PhaseDetail) => boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const flat = stages.flatMap((s) => s.phases);

  const onKey = (e: React.KeyboardEvent) => {
    const i = flat.findIndex((p) => p.id === selected);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: flat.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = flat[(next + flat.length) % flat.length];
    onSelect(target.id);
    ref.current?.querySelector<HTMLButtonElement>(`#${tabId(target.id)}`)?.focus();
  };

  const tab = (p: PhaseDetail, label: string, sub?: React.ReactNode) => {
    const on = p.id === selected;
    const mine = isMine(p);
    return (
      <button
        key={p.id}
        id={tabId(p.id)}
        role="tab"
        type="button"
        aria-selected={on}
        aria-controls={PANEL_ID}
        tabIndex={on ? 0 : -1}
        onClick={() => onSelect(p.id)}
        className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on ? "border-brand/60 bg-brand/10" : "border-line bg-surface hover:bg-surface-2"}`}
      >
        <span className="font-medium">{label}</span>
        {mine && (
          <span className="ml-1 text-warn">
            <Icon name="star" filled className="inline size-3.5 align-[-2px]" />
            <span className="sr-only">(une de vos équipes y joue)</span>
          </span>
        )}
        {sub}
      </button>
    );
  };

  return (
    <div ref={ref} role="tablist" aria-label="Phases de la compétition" onKeyDown={onKey} className="flex flex-col gap-2 md:flex-row md:items-stretch">
      {stages.map((s, i) => {
        const st = phaseState(s.phases.flatMap((p) => p.matches));
        return (
          <div key={s.key} className="flex items-stretch gap-2">
            {s.phases.length === 1 ? (
              <div className="flex flex-col">
                <span className="mb-1 text-xs text-muted">Phase {i + 1}</span>
                {tab(s.phases[0], s.name, <StateLine st={st} />)}
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="mb-1 text-xs text-muted">
                  Phase {i + 1} · {s.name} · <span className={st.cls}>{st.label}</span>
                </span>
                <div className="flex gap-2">{s.phases.map((p) => tab(p, p.name, <StateLine st={phaseState(p.matches)} />))}</div>
              </div>
            )}
            {i < stages.length - 1 && (
              <Icon name="arrowRight" className="mb-5 hidden size-4 self-end text-muted md:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}
