"use client";

import Link from "next/link";
import type { MatchDetail, ScenarioOutcome } from "@/lib/api";
import { fmtDay, fmtTime } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { OutcomeTag } from "./format/Explainers";
import { SourceLine } from "./format/FormatSection";
import { Icon } from "./Icon";
import { Term } from "./ui";

function OutcomeBlock({ o, related }: { o: ScenarioOutcome; related?: MatchDetail["scenario"]["related"] }) {
  if (o.kind === "tiebreak")
    return (
      <div className="space-y-1.5">
        <OutcomeTag o={o} />
        <p className="text-xs text-muted">
          Égalité au classement : le <Term k="tiebreaker">départage</Term> décidera entre
        </p>
        <ul className="space-y-1">
          {o.possible?.map((p, i) => (
            <li key={i}>
              <OutcomeTag o={p} small />
            </li>
          ))}
        </ul>
      </div>
    );
  if (o.kind !== "depends") return <OutcomeTag o={o} />;
  return (
    <div className="space-y-2">
      <OutcomeTag o={o} />
      {o.conditions && o.conditions.length > 0 ? (
        <ul className="space-y-1.5">
          {o.conditions.map((c, i) => (
            <li key={i} className="text-sm">
              <span className="text-muted">{c.label.charAt(0).toUpperCase() + c.label.slice(1)} :</span>
              <div className="mt-0.5">
                <OutcomeBlock o={c.outcome} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-xs text-muted">Issues encore possibles :</p>
          <div className="flex flex-wrap gap-1.5">
            {o.possible?.map((p, i) => <OutcomeTag key={i} o={p} small />)}
          </div>
          {o.depends_on && o.depends_on.length > 0 && (
            <p className="text-xs text-muted">
              Dépend de {o.depends_on.length} autre(s) match(s) :{" "}
              {o.depends_on.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <Link href={`/matchs/${id}`} className="text-brand underline">
                    {related?.[id]?.name ?? `match ${id}`}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Quand l'enjeu est le même pour les deux équipes, on le dit d'abord, en une phrase. */
function headline(sc: MatchDetail["scenario"]): { win: ScenarioOutcome; loss: ScenarioOutcome; decisive: boolean } | null {
  const [a, b] = sc.teams;
  if (!a || !b || !a.win.certain || !a.loss.certain) return null;
  if (a.win.label !== b.win.label || a.loss.label !== b.loss.label) return null;
  return { win: a.win, loss: a.loss, decisive: a.loss.kind === "eliminated" || a.win.kind === "title" };
}

function Headline({ h }: { h: NonNullable<ReturnType<typeof headline>> }) {
  return (
    <div className="space-y-3">
      {h.decisive && <p className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{h.win.kind === "title" ? "Finale" : "Match décisif"}</p>}
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-ok/40 bg-ok/10 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ok">Le vainqueur</dt>
          <dd className="mt-1 font-display text-lg font-semibold">{h.win.label}</dd>
        </div>
        <div className={`rounded-lg border p-3 ${h.loss.kind === "eliminated" ? "border-bad/40 bg-bad/10" : "border-warn/40 bg-warn/10"}`}>
          <dt className={`text-xs font-semibold uppercase tracking-wider ${h.loss.kind === "eliminated" ? "text-bad" : "text-warn"}`}>Le perdant</dt>
          <dd className="mt-1 font-display text-lg font-semibold">{h.loss.label}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ScenarioPanel({ m }: { m: MatchDetail }) {
  const { contextHidden, reveal } = usePrefs();
  const sc = m.scenario;
  if (m.status === "finished" || m.status === "canceled") return null;

  return (
    <section aria-labelledby="scenario" className="rounded-xl border border-brand/30 bg-surface p-4">
      <h2 id="scenario" className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        Ce que ce match change
      </h2>
      {contextHidden(m) ? (
        <div className="mt-2 text-sm">
          <p className="text-muted">Masqué par l&apos;anti-spoil : les bilans actuels révèlent les résultats précédents de ces équipes.</p>
          <button type="button" onClick={() => reveal("match", m.id)} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
            <Icon name="eye" /> Révéler les bilans de ce match
          </button>
        </div>
      ) : !sc.determined ? (
        <div className="mt-2 rounded-md border border-dashed border-line p-3 text-sm">
          <p className="font-semibold">Scénario indéterminé</p>
          <p className="mt-1 text-muted">{sc.reason}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {sc.round && <p className="text-sm text-muted">Tour : {sc.round}</p>}
          {headline(sc) && <Headline h={headline(sc)!} />}
          {/* Enjeu identique : le titre suffit ; on ne garde que les bilans, sinon les colonnes répéteraient la même chose. */}
          {headline(sc) && sc.teams.some((t) => t.record) && (
            <p className="text-sm text-muted">
              Bilans actuels :{" "}
              {sc.teams.map((t, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  <span className="text-text">{(i === 0 ? m.team1 : m.team2)?.name}</span> <span className="font-mono">{t.record}</span>
                </span>
              ))}
            </p>
          )}
          {!headline(sc) && <div className="grid gap-6 md:grid-cols-2 md:gap-0 md:divide-x md:divide-line">
            {sc.teams.map((t, i) => {
              const team = i === 0 ? m.team1 : m.team2;
              const name = team?.name ?? (i === 0 ? "L'équipe 1" : "L'équipe 2");
              return (
                <div key={i} className="space-y-3 md:px-5 md:first:pl-0 md:last:pr-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{team ? name : "Le futur adversaire"}</h3>
                    {t.record && <span className="font-mono text-sm text-muted" title="Bilan actuel victoires-défaites">Bilan {t.record}</span>}
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ok">En cas de victoire</div>
                    <OutcomeBlock o={t.win} related={sc.related} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-bad">En cas de défaite</div>
                    <OutcomeBlock o={t.loss} related={sc.related} />
                  </div>
                </div>
              );
            })}
          </div>}
          {sc.method === "round_robin" && (
            <p className="text-xs text-muted">
              Calcul exhaustif de toutes les combinaisons des matchs restants de la poule.
            </p>
          )}
          {sc.note && <p className="text-xs text-muted">{sc.note}</p>}
          {m.rules_meta && <SourceLine rules={m.rules_meta} />}
        </div>
      )}
    </section>
  );
}

export const scheduleLine = (iso: string | null) => `${fmtDay(iso)} · ${fmtTime(iso)}`;
