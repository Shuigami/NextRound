"use client";

import Link from "next/link";
import { useState } from "react";
import { EditionCard } from "@/components/EditionCard";
import { Filters, matchQuery, type Period, periodBounds } from "@/components/Filters";
import { MatchCard, MatchList } from "@/components/MatchCard";
import { Empty, ErrorState, Loading, Section, SpoilerNotice } from "@/components/ui";
import { type EditionBrief, type Game, type Match, useApi } from "@/lib/api";
import { isEmpty } from "@/lib/favorites";
import { timeZone } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

function useMatches(status: "upcoming" | "live" | "past", games: Game[], fav: { teams: number[]; editions: number[] } | null, period: Period, limit: number) {
  const { ready } = usePrefs();
  const bounds = status === "live" ? {} : periodBounds(period, status === "past" ? "past" : "future");
  const q = matchQuery({ status, game: games, limit, ...bounds, team_ids: fav?.teams, edition_ids: fav?.editions });
  return useApi<Match[]>(ready ? `/matches?${q}` : null);
}

export default function Dashboard() {
  const { favorites, followedTeams, ready, isFav } = usePrefs();
  const [games, setGames] = useState<Game[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [favChoice, setFavChoice] = useState<boolean | null>(null);
  const noFav = isEmpty(favorites);
  const favOnly = favChoice ?? !noFav;
  const fav = favOnly ? { teams: followedTeams, editions: favorites.editions } : null;

  const live = useMatches("live", games, fav, period, 20);
  const upcoming = useMatches("upcoming", games, fav, period, 30);
  const past = useMatches("past", games, fav, period, 6);
  const editions = useApi<EditionBrief[]>(`/editions${games.length ? `?game=${games.join(",")}` : ""}`);

  const myEditions = (editions.data ?? []).filter((e) => e.status !== "finished" && (!favOnly || isFav("editions", e.id)));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Accueil</h1>
        <p className="text-sm text-muted">
          Horaires affichés dans votre fuseau ({ready ? timeZone() : "…"}).
        </p>
        <Filters games={games} setGames={setGames} favOnly={favOnly} setFavOnly={setFavChoice} period={period} setPeriod={setPeriod} />
        <SpoilerNotice />
        {favOnly && noFav && ready && (
          <Empty>
            Vous ne suivez encore rien. Ajoutez des <Link className="text-brand underline" href="/equipes">équipes</Link> ou des{" "}
            <Link className="text-brand underline" href="/competitions">compétitions</Link>, ou désactivez « Favoris uniquement ».
          </Empty>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* Colonne principale : ce qui se joue maintenant et ensuite. */}
        <div className="min-w-0 space-y-8">
          {(live.data?.length ?? 0) > 0 && (
            <Section title="En direct" id="live">
              <div className="space-y-2">
                {live.data!.map((m) => (
                  <MatchCard key={m.id} m={m} />
                ))}
              </div>
            </Section>
          )}

          <Section title={favOnly ? "Prochains matchs de mes favoris" : "Prochains matchs"} id="next" action={<Link href="/matchs" className="text-sm text-brand">Calendrier complet →</Link>}>
            {upcoming.loading ? <Loading /> : upcoming.error ? <ErrorState error={upcoming.error} onRetry={upcoming.reload} /> : upcoming.data!.length === 0 ? (
              <Empty>Aucun match prévu sur cette période.</Empty>
            ) : (
              <MatchList matches={upcoming.data!} />
            )}
          </Section>
        </div>

        {/* Colonne secondaire : contexte (compétitions suivies, derniers résultats). */}
        <aside className="min-w-0 space-y-8" aria-label="Compétitions et résultats">
          <Section title={favOnly ? "Mes compétitions" : "Compétitions en cours"} id="comps">
            {editions.loading ? <Loading /> : editions.error ? <ErrorState error={editions.error} onRetry={editions.reload} /> : myEditions.length === 0 ? (
              <Empty>
                Aucune compétition suivie en cours. Utilisez l&apos;étoile sur la page <Link className="text-brand underline" href="/competitions">Compétitions</Link>.
              </Empty>
            ) : (
              <div className="space-y-2">
                {myEditions.map((e) => (
                  <EditionCard key={e.id} e={e} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Derniers résultats" id="results">
            {past.loading ? <Loading /> : past.error ? <ErrorState error={past.error} onRetry={past.reload} /> : past.data!.length === 0 ? (
              <Empty>Aucun résultat sur cette période.</Empty>
            ) : (
              <MatchList matches={past.data!} />
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}
