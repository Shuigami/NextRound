// Logique pure des favoris (testée par favorites.test.ts). Le stockage est géré par prefs.tsx.

export type Favorites = { teams: number[]; orgs: number[]; editions: number[] };
export type FavKind = keyof Favorites;

export const EMPTY_FAVORITES: Favorites = { teams: [], orgs: [], editions: [] };

const ids = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x > 0))] : [];

/** Lecture tolérante : un contenu corrompu ne doit jamais casser l'application. */
export function parseFavorites(raw: string | null): Favorites {
  if (!raw) return EMPTY_FAVORITES;
  try {
    const v = JSON.parse(raw);
    return { teams: ids(v?.teams), orgs: ids(v?.orgs), editions: ids(v?.editions) };
  } catch {
    return EMPTY_FAVORITES;
  }
}

export function hasFavorite(f: Favorites, kind: FavKind, id: number): boolean {
  return f[kind].includes(id);
}

export function toggleFavorite(f: Favorites, kind: FavKind, id: number): Favorites {
  return { ...f, [kind]: hasFavorite(f, kind, id) ? f[kind].filter((x) => x !== id) : [...f[kind], id] };
}

type OrgLike = { id: number; teams: { id: number }[] };
type TeamLike = { id: number; organization_id: number | null };

/** Suivre une organisation = suivre toutes ses équipes, y compris celles ajoutées plus tard. */
export function followedTeamIds(f: Favorites, orgs: OrgLike[]): number[] {
  const set = new Set(f.teams);
  for (const o of orgs) if (f.orgs.includes(o.id)) o.teams.forEach((t) => set.add(t.id));
  return [...set].sort((a, b) => a - b);
}

export function isTeamFollowed(f: Favorites, t: TeamLike | null | undefined): boolean {
  return !!t && (f.teams.includes(t.id) || (t.organization_id !== null && f.orgs.includes(t.organization_id)));
}

export function isEmpty(f: Favorites): boolean {
  return !f.teams.length && !f.orgs.length && !f.editions.length;
}
