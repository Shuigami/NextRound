// Règles du mode anti-spoil, utilisées par tous les composants qui affichent un résultat (testées dans favorites.test.ts).

type Link = { match_id: number; type: "winner" | "loser" };
type MatchLike = { id: number; status: string; edition: { id: number }; previous?: Link[] };

export const matchKey = (id: number) => `m:${id}`;
export const editionKey = (id: number) => `e:${id}`;

/** Révéler une compétition révèle tous ses matchs ; révéler un match ne révèle que lui. */
export function isRevealed(revealed: Set<string>, matchId: number | null, editionId: number | null): boolean {
  return (matchId !== null && revealed.has(matchKey(matchId))) || (editionId !== null && revealed.has(editionKey(editionId)));
}

export function isScoreHidden(m: MatchLike, spoilerFree: boolean, revealed: Set<string>): boolean {
  if (!spoilerFree || (m.status !== "finished" && m.status !== "running")) return false;
  return !isRevealed(revealed, m.id, m.edition.id);
}

/**
 * Une équipe placée dans ce match parce qu'elle a gagné (ou perdu) un match précédent révèle ce résultat.
 * On la masque tant que ni ce match, ni le match d'origine, ni la compétition ne sont révélés.
 */
export function isSlotHidden(m: MatchLike, slot: 0 | 1, spoilerFree: boolean, revealed: Set<string>): boolean {
  const link = m.previous?.[slot];
  if (!spoilerFree || !link) return false;
  return !isRevealed(revealed, m.id, m.edition.id) && !revealed.has(matchKey(link.match_id));
}

/** Retire un bilan du nom d'un match (« Ronde 3 (1-1) » → « Ronde 3 »). */
export function stripRecord(name: string): string {
  return name.replace(/\s*\(\d+\s*[-–]\s*\d+\)/g, "").trim();
}
