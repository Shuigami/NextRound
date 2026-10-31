"use client";

import Link from "next/link";
import type { Match, TeamBrief } from "@/lib/api";
import { feedLabel, fmtDay, fmtFull, fmtTime, seriesLabel, STATUS } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { Icon } from "./Icon";
import { GameBadge, StatusTag, TeamLogo } from "./ui";

function TeamRow({ team, placeholder, masked, score, won, hidden, followed, decided }: { team: TeamBrief | null; placeholder: string; masked: boolean; score: number | null; won: boolean; hidden: boolean; followed: boolean; decided: boolean }) {
  const dim = decided && !hidden && !won;
  return (
    <div className="flex items-center gap-2.5">
      {masked ? (
        <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-line text-faint">
          <Icon name="eyeOff" className="size-3.5" />
        </span>
      ) : (
        <TeamLogo name={team?.name ?? "?"} src={team?.logo_url ?? null} size={24} />
      )}
      <span className={`relative min-w-0 flex-1 truncate ${dim ? "text-muted" : ""} ${won && !hidden ? "font-semibold" : ""}`}>
        {team ? team.name : <span className="text-sm italic text-faint" title={placeholder}>{placeholder}{masked && <span className="sr-only"> (équipe masquée par l&apos;anti-spoil)</span>}</span>}
        {followed && (
          <span className="ml-1.5 inline-flex align-[-2px] text-warn" title="Équipe suivie">
            <Icon name="star" filled className="size-3.5" />
            <span className="sr-only">(suivie)</span>
          </span>
        )}
      </span>
      {!hidden && won && <span className="sr-only">vainqueur</span>}
      <span className={`tabular w-6 text-right font-mono text-base ${won && !hidden ? "font-bold" : dim ? "text-muted" : ""}`}>
        {hidden ? <span className="text-faint" aria-label="score masqué">–</span> : score ?? ""}
      </span>
    </div>
  );
}

export function MatchCard({ m, showDate = false, showCompetition = true }: { m: Match; showDate?: boolean; showCompetition?: boolean }) {
  const { hideScore, reveal, hide, revealedBy, slotHidden, safeName, isTeamFollowed } = usePrefs();
  const hidden = hideScore(m);
  const decided = m.status === "finished" && m.winner_id !== null;
  // Une équipe placée grâce à un résultat masqué est elle-même masquée (sinon elle révèle ce résultat).
  const masked = [slotHidden(m, 0), slotHidden(m, 1)];
  const team1 = masked[0] ? null : m.team1;
  const team2 = masked[1] ? null : m.team2;
  const f1 = isTeamFollowed(team1);
  const f2 = isTeamFollowed(team2);
  const name = safeName(m);
  const by = revealedBy(m);
  const series = seriesLabel(m.match_type, m.number_of_games);
  const stream = m.status !== "finished" && m.status !== "canceled" ? (m.streams.find((s) => s.main) ?? m.streams[0]) : undefined;
  const title = `${team1?.name ?? feedLabel(m.previous[0])} contre ${team2?.name ?? feedLabel(m.previous[1])}`;

  return (
    <article
      className={`relative rounded-lg border p-3 transition-colors ${
        m.status === "running" ? "border-live/40 bg-live/[0.06] hover:bg-live/10" : `bg-surface hover:bg-surface-2 ${f1 || f2 ? "border-warn/30" : "border-line"}`
      }`}
    >
      <div className="flex gap-3">
        <div className="w-20 shrink-0 text-sm">
          {showDate && <div className="text-xs text-muted">{fmtDay(m.scheduled_at)}</div>}
          <div className="tabular font-mono">{fmtTime(m.scheduled_at)}</div>
          <StatusTag status={m.status} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <TeamRow team={team1} placeholder={feedLabel(m.previous[0])} masked={masked[0]} score={m.score1} won={decided && m.winner_id === m.team1?.id} hidden={hidden} followed={f1} decided={decided} />
          <TeamRow team={team2} placeholder={feedLabel(m.previous[1])} masked={masked[1]} score={m.score2} won={decided && m.winner_id === m.team2?.id} hidden={hidden} followed={f2} decided={decided} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/60 pt-2 text-xs text-muted">
        <GameBadge game={m.game} />
        {showCompetition && (
          <span className="truncate">
            {m.edition.name} · {m.phase.name}
          </span>
        )}
        {name && !showCompetition && <span className="truncate">{name}</span>}
        {series && (
          <span className="rounded bg-surface-3 px-1.5 py-0.5 font-semibold text-text" title={series.long}>
            {series.short}
          </span>
        )}
        {m.status === "postponed" && m.original_scheduled_at && (
          <span className="text-warn">Initialement prévu le {fmtFull(m.original_scheduled_at)}</span>
        )}
        {!hidden && m.forfeit && <span className="text-warn">Forfait</span>}
        <span className="ml-auto flex items-center gap-2">
          {(hidden || masked[0] || masked[1]) && (
            <button type="button" onClick={() => reveal("match", m.id)} className="relative z-10 inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 hover:text-text">
              <Icon name="eye" className="size-3.5" /> {hidden ? "Révéler le score" : "Révéler l'affiche"}
            </button>
          )}
          {by === "match" && (
            <button type="button" onClick={() => hide("match", m.id)} className="relative z-10 inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 hover:text-text" title="Ce match a été révélé malgré l'anti-spoil">
              <Icon name="eyeOff" className="size-3.5" /> Révélé · masquer
            </button>
          )}
          {stream && (
            <a href={stream.url} target="_blank" rel="noopener noreferrer" className="relative z-10 inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 hover:text-text">
              <Icon name="play" className="size-3" /> Stream{stream.language ? ` (${stream.language.toUpperCase()})` : ""}
            </a>
          )}
        </span>
      </div>
      <Link
        href={`/matchs/${m.id}`}
        className="absolute inset-0 rounded-lg"
        aria-label={`${title}, ${fmtDay(m.scheduled_at).toLowerCase()} à ${fmtTime(m.scheduled_at)}, ${STATUS[m.status].label.toLowerCase()} : voir le match`}
      />
    </article>
  );
}

/** Liste de matchs regroupés par jour local. */
export function MatchList({ matches, showCompetition = true }: { matches: Match[]; showCompetition?: boolean }) {
  const groups: [string, Match[]][] = [];
  for (const m of matches) {
    const day = fmtDay(m.scheduled_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === day) last[1].push(m);
    else groups.push([day, [m]]);
  }
  return (
    <div className="space-y-5">
      {groups.map(([day, ms]) => (
        <div key={day + ms[0].id}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{day}</h3>
          <div className="max-w-3xl space-y-2">
            {ms.map((m) => (
              <MatchCard key={m.id} m={m} showCompetition={showCompetition} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
