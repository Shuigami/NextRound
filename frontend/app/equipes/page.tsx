"use client";

import Link from "next/link";
import { useState } from "react";
import { Filters } from "@/components/Filters";
import { Empty, ErrorState, GameBadge, Loading, OrgFollow, TeamFollow, TeamLogo } from "@/components/ui";
import { type Game, type Organization, useApi } from "@/lib/api";

export default function TeamsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [q, setQ] = useState("");
  const res = useApi<Organization[]>("/organizations");
  const needle = q.trim().toLowerCase();
  const orgs = (res.data ?? [])
    .map((o) => ({ ...o, teams: o.teams.filter((t) => !games.length || games.includes(t.game)) }))
    .filter((o) => o.teams.length && (!needle || o.name.toLowerCase().includes(needle) || o.teams.some((t) => t.name.toLowerCase().includes(needle))));

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Équipes</h1>
        <p className="text-sm text-muted">
          Une organisation peut aligner une équipe par jeu. Suivez une équipe précise, ou toute l&apos;organisation pour recevoir
          toutes ses équipes.
        </p>
      </div>
      <label className="block">
        <span className="sr-only">Rechercher une équipe</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une équipe ou une organisation…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint"
        />
      </label>
      <Filters games={games} setGames={setGames} />
      {res.loading ? (
        <Loading />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : orgs.length === 0 ? (
        <Empty>Aucune équipe trouvée.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center gap-3">
                <TeamLogo name={o.name} src={o.logo_url ?? o.teams[0]?.logo_url ?? null} size={36} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">{o.name}</h2>
                  <p className="text-xs text-muted">
                    Organisation · {o.teams.length} équipe{o.teams.length > 1 ? "s" : ""}
                  </p>
                </div>
                {o.teams.length > 1 && <OrgFollow org={o} count={o.teams.length} />}
              </div>
              <ul className="mt-3 space-y-1.5">
                {o.teams.map((t) => (
                  <li key={t.id} className="relative flex items-center gap-2 rounded-md border border-line/60 bg-surface-2 px-2 py-1.5 hover:border-brand/40">
                    <GameBadge game={t.game} />
                    <Link href={`/equipes/${t.id}`} className="flex-1 truncate text-sm after:absolute after:inset-0">
                      {t.name}
                    </Link>
                    <span className="relative z-10">
                      <TeamFollow team={t} compact />
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
