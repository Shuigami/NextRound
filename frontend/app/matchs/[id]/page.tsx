"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { SeriesExplainer } from "@/components/format/Explainers";
import { PhaseDetails } from "@/components/format/FormatSection";
import { Icon } from "@/components/Icon";
import { ScenarioPanel, scheduleLine } from "@/components/ScenarioPanel";
import { ErrorState, GameBadge, Loading, StatusTag, TeamFollow, TeamLogo } from "@/components/ui";
import { type MatchDetail, type SeriesFormat, type TeamBrief, useApi } from "@/lib/api";
import { feedLabel, fmtFull, fmtRelative, timeZone } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

function Side({ t, won, placeholder, masked }: { t: TeamBrief | null; won: boolean; placeholder: string; masked: boolean }) {
  const { isTeamFollowed } = usePrefs();
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
      {masked ? (
        <span aria-hidden="true" className="inline-flex size-12 items-center justify-center rounded-md border border-dashed border-line text-faint">
          <Icon name="eyeOff" className="size-5" />
        </span>
      ) : (
        <TeamLogo name={t?.name ?? "?"} src={t?.logo_url ?? null} size={48} />
      )}
      {t ? (
        <Link href={`/equipes/${t.id}`} className={`font-display text-lg hover:underline ${won ? "font-bold" : ""}`}>
          {t.name}
          {isTeamFollowed(t) && (
            <span className="ml-1 text-warn">
              <Icon name="star" filled className="inline size-4 align-[-2px]" />
              <span className="sr-only">(suivie)</span>
            </span>
          )}
        </Link>
      ) : (
        <span className="text-sm italic text-faint">
          {placeholder}
          {masked && <span className="sr-only"> (équipe masquée par l&apos;anti-spoil)</span>}
        </span>
      )}
      {won && (
        <span className="inline-flex items-center gap-1 text-xs text-ok">
          <Icon name="check" className="size-3.5" /> Vainqueur
        </span>
      )}
      {t && <TeamFollow team={t} compact />}
    </div>
  );
}

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data: m, error, loading, reload } = useApi<MatchDetail>(`/matches/${id}`);
  const { hideScore, reveal, hide, revealedBy, slotHidden, safeName } = usePrefs();
  const masked = m ? [slotHidden(m, 0), slotHidden(m, 1)] : [false, false];
  const team1 = m && !masked[0] ? m.team1 : null;
  const team2 = m && !masked[1] ? m.team2 : null;
  // Le titre de l'onglet ne doit pas révéler une équipe masquée.
  const tabTitle = !m
    ? null
    : masked[0] || masked[1]
      ? `${safeName(m) ?? m.phase.name} · NextRound`
      : `${team1?.name ?? "À déterminer"} – ${team2?.name ?? "À déterminer"} · NextRound`;
  useEffect(() => {
    if (tabTitle) document.title = tabTitle;
  }, [tabTitle]);

  if (loading) return <Loading />;
  if (error || !m) return <ErrorState error={error!} onRetry={reload} />;
  const hidden = hideScore(m);
  const decided = m.status === "finished" && !hidden;
  const name = safeName(m);
  const by = revealedBy(m);
  const formats: SeriesFormat | null =
    m.match_type === "best_of" || m.match_type === "first_to" ? { type: m.match_type, value: m.number_of_games ?? 1, applies_to: "Format de ce match" } : null;

  return (
    <div className="space-y-6">
      <nav aria-label="Fil d'Ariane" className="text-sm text-muted">
        <Link href={`/competitions/${m.edition.id}`} className="hover:text-text">
          {m.edition.name}
        </Link>{" "}
        › {m.phase.name}
        {name && ` › ${name}`}
      </nav>

      <section className="rounded-xl border border-line bg-surface p-4" aria-label="Affiche">
        <div className="mb-3 flex flex-wrap items-center justify-center gap-3 text-sm">
          <GameBadge game={m.game} full />
          <StatusTag status={m.status} />
          <span className="text-muted">
            {scheduleLine(m.scheduled_at)} <span className="text-faint">({timeZone()})</span>
          </span>
        </div>
        <div className="flex items-start gap-3">
          <Side t={team1} placeholder={feedLabel(m.previous[0])} masked={masked[0]} won={decided && m.winner_id === m.team1?.id} />
          <div className="flex min-w-24 flex-col items-center justify-center pt-2">
            {m.status === "finished" || m.status === "running" ? (
              hidden ? (
                <button type="button" onClick={() => reveal("match", m.id)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
                  <Icon name="eye" /> Révéler le score
                </button>
              ) : (
                <span className="tabular font-mono text-4xl font-bold">
                  {m.score1 ?? "?"}<span className="mx-2 text-faint">–</span>{m.score2 ?? "?"}
                </span>
              )
            ) : (
              <span className="font-display text-xl text-muted">contre</span>
            )}
            {!hidden && m.forfeit && <span className="mt-1 text-xs text-warn">Victoire par forfait</span>}
          </div>
          <Side t={team2} placeholder={feedLabel(m.previous[1])} masked={masked[1]} won={decided && m.winner_id === m.team2?.id} />
        </div>
        {(masked[0] || masked[1]) && !hidden && (
          <p className="mt-4 text-center">
            <button type="button" onClick={() => reveal("match", m.id)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
              <Icon name="eye" /> Révéler l&apos;affiche
            </button>
          </p>
        )}
        {by && (
          <p className="mt-4 text-center text-xs text-muted">
            {by === "edition" ? (
              "Révélé avec toute la compétition (anti-spoil)."
            ) : (
              <button type="button" onClick={() => hide("match", m.id)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
                <Icon name="eyeOff" /> Révélé malgré l&apos;anti-spoil · masquer à nouveau
              </button>
            )}
          </p>
        )}
        {m.status === "postponed" && (
          <p className="mt-4 text-center text-sm text-warn">
            <Icon name="refresh" className="mr-1 inline size-4 align-[-3px]" />
            Match reporté{m.original_scheduled_at ? `, initialement prévu le ${fmtFull(m.original_scheduled_at)}` : ""}.
          </p>
        )}
        {m.rescheduled && m.status !== "postponed" && m.original_scheduled_at && (
          <p className="mt-4 text-center text-xs text-muted">Horaire modifié (initialement le {fmtFull(m.original_scheduled_at)}).</p>
        )}
      </section>

      {m.streams.length > 0 && m.status !== "finished" && (
        <section aria-label="Streams" className="flex flex-wrap gap-2">
          {m.streams.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
              <Icon name="play" className="size-3" /> Regarder{s.language ? ` (${s.language.toUpperCase()})` : ""}
              {s.official && <span className="text-xs text-muted">· officiel</span>}
            </a>
          ))}
        </section>
      )}

      <ScenarioPanel m={m} />

      {formats && <SeriesExplainer f={formats} />}
      {m.phase_rules && <PhaseDetails p={m.phase_rules} />}
      <p className="text-xs text-faint">Données synchronisées {fmtRelative(m.synced_at)}.</p>
    </div>
  );
}
