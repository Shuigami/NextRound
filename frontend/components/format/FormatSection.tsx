"use client";

import type { EditionRules, PhaseRules, PhaseType } from "@/lib/api";
import type { GlossaryKey } from "@/lib/glossary";
import { Icon } from "../Icon";
import { Term } from "../ui";
import { PhaseViz, SeriesExplainer } from "./Explainers";

export const PHASE_TERM: Record<PhaseType, GlossaryKey> = {
  round_robin: "round_robin",
  swiss: "swiss",
  single_elimination: "single_elimination",
  double_elimination: "double_elimination",
};

function SourceLine({ rules }: { rules: Pick<EditionRules, "sources" | "verified_at" | "is_fictional"> }) {
  return (
    <p className="text-xs text-muted">
      {rules.is_fictional && <strong className="text-warn">Règlement fictif (démo). </strong>}
      Source :{" "}
      {rules.sources.map((s, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
              {s.label}
            </a>
          ) : (
            s.label
          )}
        </span>
      ))}
      {" "}· vérifié le {new Date(rules.verified_at).toLocaleDateString("fr-FR")}
    </p>
  );
}

export function PhaseDetails({ p }: { p: PhaseRules }) {
  return (
    <details className="group rounded-lg border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-medium">
        <Icon name="chevron" className="size-4 text-muted transition-transform group-open:rotate-90" />
        <h3 className="text-base font-medium">Comment fonctionne : {p.name}</h3>
        <span className="ml-auto text-xs font-normal text-muted">{p.participants} équipes</span>
      </summary>
      <div className="space-y-4 border-t border-line p-3">
        <p className="text-sm">{p.summary}</p>
        <PhaseViz r={p} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-ok/30 bg-ok/5 p-2.5 text-sm">
            <div className="flex items-center gap-1 text-xs font-semibold text-ok">
              <Icon name="check" className="size-3.5" /> Qualification
            </div>
            {p.qualification}
          </div>
          <div className="rounded-md border border-bad/30 bg-bad/5 p-2.5 text-sm">
            <div className="flex items-center gap-1 text-xs font-semibold text-bad">
              <Icon name="x" className="size-3.5" /> Élimination
            </div>
            {p.elimination}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Format des matchs</h4>
          {p.formats.map((f, i) => (
            <SeriesExplainer key={i} f={f} />
          ))}
        </div>
        {p.pairing && (
          <p className="text-sm">
            <strong>Appariements : </strong>
            {p.pairing}
          </p>
        )}
        {p.tiebreakers.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold">
              Règles de <Term k="tiebreaker">départage</Term>
            </h4>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-muted">
              {p.tiebreakers.map((t, i) => (
                <li key={i}>{t.label}</li>
              ))}
            </ol>
          </div>
        )}
        {(p.details.length > 0 || p.exceptions.length > 0) && (
          <ul className="space-y-1 text-sm text-muted">
            {p.details.map((d, i) => (
              <li key={`d${i}`}>• {d}</li>
            ))}
            {p.exceptions.map((d, i) => (
              <li key={`e${i}`}>
                <Icon name="alert" className="mr-1 inline size-3.5 align-[-2px] text-warn" />
                <span className="text-warn">Exception :</span> {d}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export function FormatSection({ rules }: { rules: EditionRules | null }) {
  if (!rules)
    return (
      <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
        <p className="font-semibold text-text">Format non documenté pour cette édition.</p>
        <p className="mt-1">
          NextRound n&apos;explique que des règles vérifiées et sourcées. Aucun fichier de règles n&apos;existe encore pour cette
          édition. Les phases et matchs ci-dessous viennent du fournisseur de données. Leurs conséquences ne sont pas calculées.
        </p>
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand/30 bg-brand/5 p-4">
        <h3 className="font-display font-semibold">Comprendre en 30 secondes</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {rules.summary_30s.map((s, i) => (
            <li key={i} className="flex gap-2">
              <Icon name="chevron" className="mt-0.5 size-4 shrink-0 text-brand" />
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-display font-semibold">Les phases, dans l&apos;ordre</h3>
        <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {rules.phases.map((p, i) => (
            <li key={p.key} className="flex flex-1 items-stretch gap-2">
              <div className="flex-1 rounded-lg border border-line bg-surface p-3">
                <div className="text-xs text-faint">Phase {i + 1}</div>
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-xs">
                  <Term k={PHASE_TERM[p.type]} /> · {p.participants} équipes
                </div>
                <p className="mt-2 text-sm text-muted">{p.qualification}</p>
              </div>
              {i < rules.phases.length - 1 && (
                <span className="self-center text-faint" aria-hidden="true">
                  <Icon name="arrowRight" className="size-4 rotate-90 md:rotate-0" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        {rules.phases.map((p) => (
          <PhaseDetails key={p.key} p={p} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon name="trophy" className="size-4 text-warn" /> Récompenses
          </h3>
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {rules.rewards.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <h3 className="text-sm font-semibold">Place dans le circuit et la saison</h3>
          <p className="mt-1 text-sm text-muted">{rules.circuit}</p>
        </div>
      </div>
      <SourceLine rules={rules} />
    </div>
  );
}

export { SourceLine };
