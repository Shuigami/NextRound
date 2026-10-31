"use client";

import { useState } from "react";
import { Filters, matchQuery, type Period, periodBounds } from "@/components/Filters";
import { MatchList } from "@/components/MatchCard";
import { Empty, ErrorState, Loading, Segmented, SpoilerNotice } from "@/components/ui";
import { type Game, type Match, useApi } from "@/lib/api";
import { timeZone } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

const TABS = { upcoming: "À venir", live: "En direct", past: "Résultats" } as const;
type Tab = keyof typeof TABS;

export default function MatchsPage() {
  const { ready, favorites, followedTeams } = usePrefs();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [games, setGames] = useState<Game[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [favOnly, setFavOnly] = useState(false);
  const bounds = tab === "live" ? {} : periodBounds(period, tab === "past" ? "past" : "future");
  const q = matchQuery({
    status: tab,
    game: games,
    limit: 300,
    ...bounds,
    team_ids: favOnly ? followedTeams : undefined,
    edition_ids: favOnly ? favorites.editions : undefined,
  });
  const res = useApi<Match[]>(ready ? `/matches?${q}` : null);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Matchs</h1>
        <p className="text-sm text-muted">
          Calendrier des quatre jeux, à l&apos;heure de votre fuseau ({ready ? timeZone() : "…"}).
        </p>
      </div>
      <Segmented value={tab} options={TABS} onChange={setTab} label="Type de matchs" />
      <Filters games={games} setGames={setGames} favOnly={favOnly} setFavOnly={setFavOnly} period={tab === "live" ? undefined : period} setPeriod={tab === "live" ? undefined : setPeriod} />
      <SpoilerNotice />
      {res.loading ? (
        <Loading />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.data!.length === 0 ? (
        <Empty>{tab === "live" ? "Aucun match en direct." : "Aucun match pour ces filtres."}</Empty>
      ) : (
        <MatchList matches={res.data!} />
      )}
    </div>
  );
}
