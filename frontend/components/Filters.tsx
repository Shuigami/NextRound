"use client";

import type { Game } from "@/lib/api";
import { GAME_KEYS, GAMES } from "@/lib/format";
import { Chip, Switch } from "./ui";

export type Period = "today" | "week" | "month" | "all";
export const PERIODS: Record<Period, { label: string; days: number | null }> = {
  today: { label: "Aujourd'hui", days: 0 },
  week: { label: "7 jours", days: 7 },
  month: { label: "30 jours", days: 30 },
  all: { label: "Tout", days: null },
};

/** Borne de période en heure locale : « aujourd'hui » s'arrête à minuit dans le fuseau de l'utilisateur. */
export function periodBounds(p: Period, direction: "future" | "past"): { from?: string; to?: string } {
  const days = PERIODS[p].days;
  if (days === null) return {};
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (direction === "future") {
    const end = new Date(start);
    end.setDate(end.getDate() + days + 1);
    return { to: end.toISOString() };
  }
  const from = new Date(start);
  from.setDate(from.getDate() - days);
  return { from: from.toISOString() };
}

export function Filters({
  games,
  setGames,
  favOnly,
  setFavOnly,
  period,
  setPeriod,
}: {
  games: Game[];
  setGames: (g: Game[]) => void;
  favOnly?: boolean;
  setFavOnly?: (v: boolean) => void;
  period?: Period;
  setPeriod?: (p: Period) => void;
}) {
  const toggle = (g: Game) => setGames(games.includes(g) ? games.filter((x) => x !== g) : [...games, g]);
  // Trois groupes insécables : ils passent à la ligne en bloc sur mobile, sans séparateurs à gérer.
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex items-center gap-1.5" role="group" aria-label="Jeux (aucun sélectionné = tous)">
        {GAME_KEYS.map((g) => (
          <Chip key={g} on={games.includes(g)} onClick={() => toggle(g)}>
            <span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: GAMES[g].color }} aria-hidden="true" />
            {GAMES[g].short}
            <span className="sr-only"> {GAMES[g].label}</span>
          </Chip>
        ))}
        {games.length > 0 && (
          <button type="button" onClick={() => setGames([])} className="ml-1 px-1 text-sm text-muted underline underline-offset-4 hover:text-text">
            Effacer
          </button>
        )}
      </div>
      {setPeriod && period && (
        <label className="flex items-center gap-2 text-sm text-muted">
          Période
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-text"
          >
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <option key={p} value={p}>
                {PERIODS[p].label}
              </option>
            ))}
          </select>
        </label>
      )}
      {setFavOnly && <Switch on={!!favOnly} onChange={setFavOnly} label="Favoris uniquement" />}
    </div>
  );
}

export function matchQuery(params: Record<string, string | number | number[] | Game[] | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length) q.set(k, v.join(","));
      else if (k === "team_ids" || k === "edition_ids") q.set(k, "");
    } else q.set(k, String(v));
  }
  return q.toString();
}
