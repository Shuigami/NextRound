"use client";

import Link from "next/link";
import { useState } from "react";
import type { PhaseDetail, PhaseRules, StandingRow } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { OutcomeTag } from "./format/Explainers";
import { Icon } from "./Icon";
import { columnsFromLinks, columnsFromRules } from "@/lib/bracket";
import { BracketTree } from "./BracketTree";
import { MatchList } from "./MatchCard";
import { Chip, Empty, TeamLogo } from "./ui";

function zone(r: PhaseRules | undefined, row: StandingRow) {
  if (!r) return null;
  if (r.type === "swiss") {
    if (r.wins_to_qualify && row.wins >= r.wins_to_qualify) return <OutcomeTag o={{ kind: "qualified", label: "Qualifié" }} small />;
    if (r.losses_to_eliminate && row.losses >= r.losses_to_eliminate) return <OutcomeTag o={{ kind: "eliminated", label: "Éliminé" }} small />;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted">
        <Icon name="refresh" className="size-3" /> En lice
      </span>
    );
  }
  const o = r.rank_outcomes.find((x) => x.ranks.includes(row.rank));
  return o ? (
    <span className="text-xs text-muted">
      {o.kind === "qualified" ? (
        <span className="inline-flex items-center gap-1">
          <Icon name="check" className="size-3" /> zone de qualification
        </span>
      ) : o.kind === "eliminated" ? (
        <span className="inline-flex items-center gap-1">
          <Icon name="x" className="size-3" /> zone d&apos;élimination
        </span>
      ) : (
        o.label
      )}
    </span>
  ) : null;
}

export function Standings({ rows, rules }: { rows: StandingRow[]; rules?: PhaseRules }) {
  const { isTeamFollowed } = usePrefs();
  const anyTie = rows.some((r) => r.tied && r.played > 0);
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">Classement</caption>
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">#</th>
            <th scope="col" className="px-3 py-2 text-left">Équipe</th>
            <th scope="col" className="px-3 py-2 text-right" title="Victoires - défaites">V-D</th>
            <th scope="col" className="hidden px-3 py-2 text-right sm:table-cell" title="Manches gagnées - perdues">Manches</th>
            <th scope="col" className="px-3 py-2 text-left">Situation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const fav = isTeamFollowed(r.team);
            return (
              <tr key={r.team.id} className={`border-t border-line ${fav ? "bg-warn/5" : ""}`}>
                <td className="tabular px-3 py-2 font-mono text-muted">
                  {r.rank}
                  {r.tied && r.played > 0 && <span title="Égalité">=</span>}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/equipes/${r.team.id}`} className="flex items-center gap-2 hover:underline">
                    <TeamLogo name={r.team.name} src={r.team.logo_url} size={20} />
                    <span className={fav ? "font-semibold" : ""}>{r.team.name}</span>
                    {fav && (
                      <span className="text-warn">
                        <Icon name="star" filled className="size-3.5" />
                        <span className="sr-only">(suivie)</span>
                      </span>
                    )}
                  </Link>
                </td>
                <td className="tabular px-3 py-2 text-right font-mono">{r.wins}-{r.losses}</td>
                <td className="tabular hidden px-3 py-2 text-right font-mono text-muted sm:table-cell">
                  {r.game_wins}-{r.game_losses}
                </td>
                <td className="px-3 py-2">{zone(rules, r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-line bg-surface px-3 py-2 text-xs text-muted">
        Classement calculé à partir des résultats enregistrés.
        {anyTie && " « = » signale une égalité : les règles de départage ne sont pas appliquées dans ce tableau."}
      </p>
    </div>
  );
}

export function BracketView({ phase, rules }: { phase: PhaseDetail; rules?: PhaseRules }) {
  // Liste par défaut sur mobile, tableau sur grand écran. Rendu uniquement côté client (après chargement).
  const [view, setView] = useState<"bracket" | "list">(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches ? "bracket" : "list",
  )
  // Tours du règlement s'il existe, sinon reconstruits depuis les liens du fournisseur ; sans l'un ni l'autre, une liste.
  const fromRules = !!rules?.rounds.length;
  const columns = fromRules
    ? columnsFromRules(phase.matches, rules!.rounds, rules!.type === "double_elimination")
    : columnsFromLinks(phase.matches);
  if (!columns) return <MatchList matches={phase.matches} showCompetition={false} />;
  const placed = new Set(columns.flatMap((c) => c.matches));
  const unknown = phase.matches.filter((m) => !placed.has(m.id));
  const byId = new Map(phase.matches.map((m) => [m.id, m]));
  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Affichage du tableau">
        <Chip on={view === "bracket"} onClick={() => setView("bracket")}>
          <Icon name="bracket" className="mr-1 inline size-4" /> Tableau
        </Chip>
        <Chip on={view === "list"} onClick={() => setView("list")}>
          <Icon name="list" className="mr-1 inline size-4" /> Liste
        </Chip>
      </div>
      {view === "bracket" ? (
        <BracketTree matches={phase.matches} columns={columns} />
      ) : (
        <div className="space-y-4">
          {columns.map((r) => {
            const ms = r.matches.map((id) => byId.get(id)!);
            return ms.length ? (
              <div key={r.key}>
                <h3 className="mb-1.5 text-sm font-semibold">{r.name}</h3>
                <MatchList matches={ms} showCompetition={false} />
              </div>
            ) : null;
          })}
        </div>
      )}
      {!fromRules && (
        <p className="text-xs text-muted">
          Tableau reconstruit à partir des liens entre matchs fournis par PandaScore. Noms des tours d&apos;après le fournisseur.
        </p>
      )}
      {unknown.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">{fromRules ? "Tour non identifié" : "Hors tableau"}</h3>
          <MatchList matches={unknown} showCompetition={false} />
        </div>
      )}
    </div>
  );
}

export function PhaseView({ phase, rules, editionId }: { phase: PhaseDetail; rules?: PhaseRules; editionId: number }) {
  const { editionHidden, reveal } = usePrefs();
  const hidden = editionHidden(editionId);
  const upcoming = phase.matches.filter((m) => m.status !== "finished" && m.status !== "canceled" && m.status !== "running");
  const isBracket = rules ? rules.type.endsWith("elimination") : phase.has_bracket;

  if (hidden)
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-surface p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="eyeOff" /> Classement, tableau et résultats masqués (anti-spoil)
          </p>
          <p className="mt-1 text-muted">Les affiches à venir ci-dessous peuvent révéler indirectement des résultats déjà joués.</p>
          <button type="button" onClick={() => reveal("edition", editionId)} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
            <Icon name="eye" /> Révéler toute la compétition
          </button>
        </div>
        {upcoming.length > 0 ? <MatchList matches={upcoming} showCompetition={false} /> : <Empty>Aucun match à venir dans cette phase.</Empty>}
      </div>
    );

  if (!phase.matches.length) return <Empty>Aucun match enregistré pour cette phase.</Empty>;
  return (
    <div className="space-y-4">
      {phase.standings && phase.standings.length > 0 && <Standings rows={phase.standings} rules={rules} />}
      {isBracket ? <BracketView phase={phase} rules={rules} /> : <MatchList matches={phase.matches} showCompetition={false} />}
    </div>
  );
}
