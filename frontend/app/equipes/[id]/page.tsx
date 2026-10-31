"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EditionCard } from "@/components/EditionCard";
import { MatchList } from "@/components/MatchCard";
import { Empty, ErrorState, GameBadge, gameTint, Loading, OrgFollow, Section, SpoilerNotice, TeamFollow, TeamLogo } from "@/components/ui";
import { type Player, type TeamDetail, useApi } from "@/lib/api";
import { fmtRelative } from "@/lib/format";

function PlayerCard({ p }: { p: Player }) {
  const [broken, setBroken] = useState(false);
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
      {p.photo_url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photo_url} alt="" onError={() => setBroken(true)} className="size-12 shrink-0 rounded-full bg-surface-3 object-cover" />
      ) : (
        <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-3 font-display text-lg font-bold text-muted">
          {p.handle.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate font-semibold">{p.handle}</div>
        {full && <div className="truncate text-xs text-muted">{full}</div>}
        <div className="text-xs text-faint">{[p.role, p.nationality].filter(Boolean).join(" · ") || "Rôle non renseigné"}</div>
      </div>
    </li>
  );
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, error, loading, reload } = useApi<TeamDetail>(`/teams/${id}`);
  useEffect(() => {
    if (t) document.title = `${t.name} · NextRound`;
  }, [t]);

  if (loading) return <Loading />;
  if (error || !t) return <ErrorState error={error!} onRetry={reload} />;
  const siblings = t.organization?.teams.filter((x) => x.id !== t.id) ?? [];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border p-5 sm:p-6" style={gameTint(t.game, 9)}>
        <TeamLogo name={t.name} src={t.logo_url} size={72} />
        <div className="min-w-0 flex-1">
          <GameBadge game={t.game} full />
          <h1 className="mt-2 text-balance font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {t.name} {t.acronym && <span className="text-lg font-normal text-muted">({t.acronym})</span>}
          </h1>
          {t.organization && (
            <p className="text-sm text-muted">
              Organisation : {t.organization.name}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <TeamFollow team={t} />
          {t.organization && siblings.length > 0 && <OrgFollow org={t.organization} count={siblings.length + 1} />}
        </div>
      </header>

      {siblings.length > 0 && (
        <nav aria-label="Autres équipes de l'organisation" className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">Aussi dans :</span>
          {siblings.map((s) => (
            <Link key={s.id} href={`/equipes/${s.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 hover:bg-surface-2">
              <GameBadge game={s.game} /> {s.name}
            </Link>
          ))}
        </nav>
      )}

      <Section title="Effectif" id="roster">
        {t.players.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {t.players.map((p) => (
              <PlayerCard key={p.id} p={p} />
            ))}
          </ul>
        ) : (
          <Empty>{t.roster_synced_at ? "Aucun joueur actif renseigné par la source." : "Effectif pas encore disponible."}</Empty>
        )}
        {t.roster_synced_at && <p className="text-xs text-faint">Effectif mis à jour {fmtRelative(t.roster_synced_at)}.</p>}
      </Section>

      <SpoilerNotice />
      <Section title="Prochains matchs" id="upcoming">
        {t.upcoming.length ? <MatchList matches={t.upcoming} /> : <Empty>Aucun match à venir connu.</Empty>}
      </Section>
      <Section title="Résultats récents" id="recent">
        {t.recent.length ? <MatchList matches={t.recent} /> : <Empty>Aucun résultat récent.</Empty>}
      </Section>
      <Section title="Compétitions" id="editions">
        {t.editions.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {t.editions.map((e) => (
              <EditionCard key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <Empty>Aucune compétition associée.</Empty>
        )}
      </Section>
    </div>
  );
}
