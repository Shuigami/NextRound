"use client";

import { useCallback, useEffect, useState } from "react";

export type Game = "lol" | "valorant" | "rl" | "ow";
export type MatchStatus = "not_started" | "running" | "finished" | "postponed" | "canceled";

export type TeamBrief = { id: number; name: string; acronym: string | null; game: Game; logo_url: string | null; organization_id: number | null };

export type Match = {
  id: number;
  game: Game;
  name: string | null;
  status: MatchStatus;
  scheduled_at: string | null;
  begin_at: string | null;
  original_scheduled_at: string | null;
  rescheduled: boolean;
  match_type: string | null;
  number_of_games: number | null;
  team1: TeamBrief | null;
  team2: TeamBrief | null;
  score1: number | null;
  score2: number | null;
  winner_id: number | null;
  forfeit: boolean;
  draw: boolean;
  streams: { url: string; language: string | null; official: boolean; main: boolean }[];
  bracket_round: string | null;
  /** Matchs qui alimentent celui-ci, dans l'ordre des places (équipe 1, équipe 2). */
  previous: { match_id: number; name: string | null; type: "winner" | "loser" }[];
  phase: { id: number; name: string };
  edition: { id: number; name: string };
  competition: { id: number; name: string };
  synced_at: string;
};

export type OutcomeKind = "qualified" | "eliminated" | "advance" | "lower_bracket" | "title" | "runner_up" | "continue" | "depends" | "tiebreak";
export type ScenarioOutcome = {
  kind: OutcomeKind;
  label: string;
  certain: boolean;
  possible?: ScenarioOutcome[];
  depends_on?: number[];
  conditions?: { label: string; outcome: ScenarioOutcome }[];
};
export type Scenario = {
  determined: boolean;
  reason?: string;
  method?: "bracket" | "swiss" | "round_robin";
  round?: string;
  note?: string | null;
  teams: { team_id: number | null; record: string | null; win: ScenarioOutcome; loss: ScenarioOutcome }[];
  related?: Record<string, { name: string; scheduled_at: string | null }>;
};

export type SeriesFormat = { type: "best_of" | "first_to"; value: number; applies_to: string };
export type PhaseType = "round_robin" | "swiss" | "single_elimination" | "double_elimination";
export type Outcome = { kind: OutcomeKind; label: string };
export type PhaseRules = {
  key: string;
  name: string;
  type: PhaseType;
  participants: number;
  summary: string;
  formats: SeriesFormat[];
  qualification: string;
  elimination: string;
  group_count: number;
  rank_outcomes: (Outcome & { ranks: number[] })[];
  tiebreakers: { key: string; label: string }[];
  wins_to_qualify: number | null;
  losses_to_eliminate: number | null;
  pairing: string | null;
  rounds: { key: string; name: string; section: "upper" | "lower" | "final" | null; on_win: Outcome; on_loss: Outcome }[];
  exceptions: string[];
  details: string[];
};
export type RulesSource = { label: string; url: string | null };
export type EditionRules = {
  key: string;
  is_fictional: boolean;
  verified_at: string;
  sources: RulesSource[];
  summary_30s: string[];
  circuit: string;
  rewards: string[];
  participants: number;
  phases: PhaseRules[];
};

export type MatchDetail = Match & {
  scenario: Scenario;
  phase_rules: PhaseRules | null;
  rules_meta: { verified_at: string; sources: RulesSource[]; is_fictional: boolean } | null;
};

export type EditionStatus = "upcoming" | "ongoing" | "finished";
export type EditionBrief = {
  id: number;
  name: string;
  game: Game;
  competition: { id: number; name: string };
  begin_at: string | null;
  end_at: string | null;
  status: EditionStatus;
  winner_team_id: number | null;
  has_rules: boolean;
  format: { name: string; type: PhaseType; series: string }[];
};
export type StandingRow = { team: TeamBrief; wins: number; losses: number; game_wins: number; game_losses: number; played: number; rank: number; tied: boolean };
export type PhaseDetail = {
  id: number;
  name: string;
  begin_at: string | null;
  end_at: string | null;
  has_bracket: boolean;
  rules_key: string | null;
  type: PhaseType | null;
  standings: StandingRow[] | null;
  matches: Match[];
};
export type EditionDetail = EditionBrief & {
  season: string | null;
  year: number | null;
  synced_at: string;
  winner: TeamBrief | null;
  siblings: { id: number; name: string; begin_at: string | null; status: EditionStatus }[];
  participants: TeamBrief[];
  rules: EditionRules | null;
  phases: PhaseDetail[];
};

export type Player = { id: number; handle: string; first_name: string | null; last_name: string | null; role: string | null; nationality: string | null; photo_url: string | null };
export type TeamDetail = TeamBrief & {
  location: string | null;
  roster_synced_at: string | null;
  synced_at: string;
  organization: { id: number; name: string; teams: TeamBrief[] } | null;
  players: Player[];
  upcoming: Match[];
  recent: Match[];
  editions: EditionBrief[];
};
export type Organization = { id: number; name: string; logo_url: string | null; teams: TeamBrief[] };
export type Meta = { mode: "demo" | "pandascore"; last_sync_at: string | null; stale: boolean; errors: { resource: string; error: string; at: string }[] };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { cache: "no-store" });
  } catch {
    throw new ApiError(0, "Le serveur NextRound ne répond pas. Vérifiez votre connexion ou que le backend tourne.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const fallback =
      res.status >= 500
        ? "Le serveur a rencontré un problème. Réessayez dans un instant."
        : res.status === 404
          ? "Cette page n'existe pas ou plus (identifiant inconnu)."
          : "La demande n'a pas pu aboutir.";
    throw new ApiError(res.status, typeof body?.detail === "string" ? body.detail : fallback);
  }
  return res.json();
}

/** Chargement simple côté client. */
export function useApi<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = path === null ? null : `${path}#${nonce}`;
  // Le résultat est rangé avec sa clé : une réponse d'une ancienne requête n'est jamais affichée comme actuelle.
  const [state, setState] = useState<{ key: string | null; data?: T; error?: ApiError }>({ key: null });
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    apiGet<T>(path!)
      .then((data) => alive && setState({ key, data }))
      .catch((error: ApiError) => alive && setState({ key, error }));
    return () => {
      alive = false;
    };
  }, [key, path]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // path null = paramètres pas encore prêts : on reste en chargement.
  const current = key !== null && state.key === key;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !current, reload };
}
