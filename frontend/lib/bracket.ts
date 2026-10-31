// Mise en colonnes d'un tableau à élimination (testée dans favorites.test.ts).
// Deux sources : les tours du règlement (bracket_round), ou à défaut le graphe des liens « vainqueur/perdant de ».

export type Section = "upper" | "lower" | "final" | null;
export type Column = { key: string; name: string; section: Section; matches: number[] };

type Link = { match_id: number; type: "winner" | "loser" };
type BM = { id: number; name: string | null; bracket_round?: string | null; previous: Link[] };
type Round = { key: string; name: string; section: "upper" | "lower" | "final" | null };

export function columnsFromRules(ms: BM[], rounds: Round[], double: boolean): Column[] {
  return rounds.map((r) => ({
    key: r.key,
    name: r.name,
    section: double ? r.section : null,
    matches: ms.filter((m) => m.bracket_round === r.key).map((m) => m.id),
  }));
}

const FR: [RegExp, string][] = [
  [/^upper bracket\s*/i, "Tableau principal · "],
  [/^lower bracket\s*/i, "Repêchage · "],
  [/grand final/i, "Grande finale"],
  [/quarter-?finals?/i, "Quart de finale"],
  [/semi-?finals?/i, "Demi-finale"],
  [/\bfinals?\b/i, "Finale"],
  [/round of (\d+)/i, "Huitième ($1)"],
  [/\bround (\d+)/i, "Tour $1"],
  [/\bweek (\d+)/i, "Semaine $1"],
  [/\bday (\d+)/i, "Jour $1"],
  [/\bmatch (\d+)/i, "match $1"],
];

/** Nom court d'un match, numéro conservé : « Quarterfinal 1: TBD vs TBD » → « Quart de finale 1 ». */
export function matchLabel(name: string): string {
  let r = name.split(":")[0].trim();
  for (const [re, fr] of FR) r = r.replace(re, fr);
  return r.replace(/ · $/, "");
}

/** « Quarterfinal 3: T1 vs G2 » → « Quart de finale » ; « Upper Bracket Final » → « Tableau principal · Finale ». */
export function roundName(name: string | null): string {
  // « Semifinal 2 » : 2 = numéro du match (retiré) ; « Round 2 », « Week 1 », « Day 3 » : numéro du tour (gardé).
  let r = (name ?? "")
    .split(":")[0]
    .replace(/\s*match\s*\d*$/i, "")
    .replace(/(?<!(?:round|week|day)\s*)\d+$/i, "")
    .trim();
  for (const [re, fr] of FR) r = r.replace(re, fr);
  r = r.replace(/ · $/, "").replace(/Huitième \((\d+)\)/, (_, n) => (n === "16" ? "Huitième de finale" : `Tour à ${n}`));
  return r || "Tour";
}

/**
 * Sans règlement : la colonne d'un match est sa profondeur dans le graphe des liens.
 * Repêchage = match alimenté par un perdant, ou par le vainqueur d'un match du repêchage.
 * Finale = match alimenté à la fois par le tableau principal et par le repêchage (et ce qui le suit).
 * Renvoie null quand aucun lien n'existe : on ne devine pas un tableau.
 */
export function columnsFromLinks(ms: BM[]): Column[] | null {
  const byId = new Map(ms.map((m) => [m.id, m]));
  const inLinks = (m: BM) => m.previous.filter((p) => byId.has(p.match_id));
  if (!ms.some((m) => inLinks(m).length)) return null;

  const section = new Map<number, Exclude<Section, null>>();
  const sectionOf = (m: BM, seen = new Set<number>()): Exclude<Section, null> => {
    const known = section.get(m.id);
    if (known) return known;
    if (seen.has(m.id)) return "upper"; // garde-fou contre un cycle dans des données corrompues
    seen.add(m.id);
    const links = inLinks(m);
    const parents = links.filter((p) => p.type === "winner").map((p) => sectionOf(byId.get(p.match_id)!, seen));
    let s: Exclude<Section, null> = "upper";
    if (parents.includes("final")) s = "final";
    else if (parents.includes("upper") && parents.includes("lower")) s = "final";
    else if (links.some((p) => p.type === "loser") || parents.includes("lower")) s = "lower";
    section.set(m.id, s);
    return s;
  };
  ms.forEach((m) => sectionOf(m));

  // Colonne comptée depuis la fin de la section, pas depuis le début : un quart de finale avec une tête de série
  // (sans match précédent) reste dans la colonne des quarts, à deux pas de la finale.
  const children = new Map<number, BM[]>();
  for (const m of ms)
    for (const p of inLinks(m))
      if (section.get(p.match_id) === section.get(m.id)) children.set(p.match_id, [...(children.get(p.match_id) ?? []), m]);
  const toEnd = new Map<number, number>();
  const toEndOf = (m: BM, seen = new Set<number>()): number => {
    const known = toEnd.get(m.id);
    if (known !== undefined) return known;
    if (seen.has(m.id)) return 0;
    seen.add(m.id);
    const next = children.get(m.id) ?? [];
    const d = next.length ? 1 + Math.max(...next.map((c) => toEndOf(c, seen))) : 0;
    toEnd.set(m.id, d);
    return d;
  };
  ms.forEach((m) => toEndOf(m));
  const depth = new Map<number, number>();
  for (const s of ["upper", "lower", "final"] as const) {
    const inSection = ms.filter((m) => section.get(m.id) === s);
    const longest = Math.max(0, ...inSection.map((m) => toEnd.get(m.id)!));
    inSection.forEach((m) => depth.set(m.id, longest - toEnd.get(m.id)!));
  }

  const double = [...section.values()].includes("lower");
  const columns: Column[] = [];
  for (const s of ["upper", "lower", "final"] as const) {
    const inSection = ms.filter((m) => section.get(m.id) === s);
    const maxD = Math.max(-1, ...inSection.map((m) => depth.get(m.id)!));
    const cols: Column[] = [];
    for (let d = 0; d <= maxD; d++) {
      const ids = inSection.filter((m) => depth.get(m.id) === d).map((m) => m.id);
      if (ids.length) cols.push({ key: `${s}-${d}`, name: roundName(byId.get(ids[0])!.name), section: double ? s : null, matches: ids });
    }
    // Ordre vertical : de la dernière colonne vers la première, chaque match suit l'ordre de ses enfants (traits sans croisement).
    for (let c = cols.length - 2; c >= 0; c--) {
      const ordered: number[] = [];
      for (const child of cols[c + 1].matches)
        for (const p of inLinks(byId.get(child)!)) if (cols[c].matches.includes(p.match_id) && !ordered.includes(p.match_id)) ordered.push(p.match_id);
      cols[c].matches = [...ordered, ...cols[c].matches.filter((id) => !ordered.includes(id))];
    }
    columns.push(...cols);
  }
  return columns;
}
