import type { StateIcon } from "@/components/Icon";
import type { Game, MatchStatus } from "./api";

export const GAMES: Record<Game, { label: string; short: string; color: string }> = {
  lol: { label: "League of Legends", short: "LoL", color: "var(--game-lol)" },
  valorant: { label: "Valorant", short: "VAL", color: "var(--game-valorant)" },
  rl: { label: "Rocket League", short: "RL", color: "var(--game-rl)" },
  ow: { label: "Overwatch", short: "OW", color: "var(--game-ow)" },
};
export const GAME_KEYS = Object.keys(GAMES) as Game[];

// Fuseau du navigateur : Intl utilise automatiquement le fuseau local de l'utilisateur.
const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const shortFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export const fmtTime = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "Horaire à confirmer");
export const fmtShort = (iso: string | null) => (iso ? shortFmt.format(new Date(iso)) : "?");
export const fmtFull = (iso: string | null) => (iso ? fullFmt.format(new Date(iso)) : "date inconnue");
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function fmtDay(iso: string | null): string {
  if (!iso) return "Date à confirmer";
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff === -1) return "Hier";
  const s = dayFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtRelative(iso: string | null): string {
  if (!iso) return "jamais";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 48) return `il y a ${Math.round(min / 60)} h`;
  return `le ${fmtFull(iso)}`;
}

export const STATUS: Record<MatchStatus, { label: string; icon: StateIcon }> = {
  not_started: { label: "À venir", icon: "clock" },
  running: { label: "En direct", icon: "live" },
  finished: { label: "Terminé", icon: "check" },
  postponed: { label: "Reporté", icon: "refresh" },
  canceled: { label: "Annulé", icon: "ban" },
};

/** D'où viendra une équipe encore inconnue (ou masquée par l'anti-spoil). */
export function feedLabel(link: { type: "winner" | "loser"; name: string | null } | undefined): string {
  if (!link?.name) return "À déterminer";
  return `${link.type === "winner" ? "Vainqueur" : "Perdant"} : ${link.name}`;
}

/** Format de série en clair. BO5 = premier à 3 victoires. */
export function seriesLabel(type: string | null, n: number | null): { short: string; long: string } | null {
  if (!n) return null;
  if (type === "best_of" || type === "ow_best_of") {
    const need = Math.floor(n / 2) + 1;
    return n === 1
      ? { short: "BO1", long: "Une seule manche : le vainqueur l'emporte." }
      : { short: `BO${n}`, long: `Au meilleur des ${n} manches : la première équipe à ${need} manches gagne.` };
  }
  if (type === "first_to") return { short: `FT${n}`, long: `Premier à ${n} manches gagnées. Le nombre de manches jouées varie.` };
  if (type === "all_games_played") return { short: `${n} manches`, long: `Les ${n} manches sont toutes jouées, quel que soit le score.` };
  return null;
}
