// Lancer avec : npm test (node --test, types retirés nativement par Node ≥ 23.6)
import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FAVORITES, followedTeamIds, isTeamFollowed, mergePrefs, parseFavorites, toggleFavorite } from "./favorites.ts";
import { columnsFromLinks } from "./bracket.ts";
import { isScoreHidden, isSlotHidden, stripRecord } from "./spoiler.ts";

test("ajouter puis retirer un favori", () => {
  const a = toggleFavorite(EMPTY_FAVORITES, "teams", 3);
  assert.deepEqual(a.teams, [3]);
  assert.deepEqual(toggleFavorite(a, "teams", 3).teams, []);
  assert.deepEqual(EMPTY_FAVORITES.teams, [], "l'état initial n'est pas muté");
});

test("suivre une organisation couvre toutes ses équipes, suivre une équipe seulement elle", () => {
  const orgs = [{ id: 1, teams: [{ id: 10 }, { id: 11 }] }, { id: 2, teams: [{ id: 20 }] }];
  const f = { teams: [20], orgs: [1], editions: [] };
  assert.deepEqual(followedTeamIds(f, orgs), [10, 11, 20]);
  assert.equal(isTeamFollowed(f, { id: 11, organization_id: 1 }), true);
  assert.equal(isTeamFollowed({ ...f, orgs: [] }, { id: 11, organization_id: 1 }), false);
  assert.equal(isTeamFollowed(f, { id: 20, organization_id: 2 }), true);
});

test("un stockage corrompu donne des favoris vides", () => {
  assert.deepEqual(parseFavorites("{oops"), EMPTY_FAVORITES);
  assert.deepEqual(parseFavorites('{"teams":[1,"x",1,-2],"orgs":null}'), { teams: [1], orgs: [], editions: [] });
});

test("anti-spoil : scores masqués sauf révélation du match ou de la compétition", () => {
  const m = { id: 5, status: "finished", edition: { id: 9 } } as const;
  assert.equal(isScoreHidden(m, true, new Set()), true);
  assert.equal(isScoreHidden(m, true, new Set(["m:5"])), false);
  assert.equal(isScoreHidden(m, true, new Set(["e:9"])), false);
  assert.equal(isScoreHidden(m, false, new Set()), false);
  assert.equal(isScoreHidden({ ...m, status: "running" }, true, new Set()), true, "un score en direct est aussi masqué");
  assert.equal(isScoreHidden({ ...m, status: "not_started" }, true, new Set()), false, "rien à masquer avant le match");
});

test("anti-spoil : une équipe issue d'un résultat est masquée jusqu'à révélation", () => {
  const m = { id: 20, status: "not_started", edition: { id: 9 }, previous: [{ match_id: 11, type: "winner" as const }] };
  assert.equal(isSlotHidden(m, 0, true, new Set()), true);
  assert.equal(isSlotHidden(m, 1, true, new Set()), false, "place sans lien : rien à cacher");
  assert.equal(isSlotHidden(m, 0, true, new Set(["m:11"])), false, "match d'origine révélé");
  assert.equal(isSlotHidden(m, 0, true, new Set(["m:20"])), false);
  assert.equal(isSlotHidden(m, 0, true, new Set(["e:9"])), false);
  assert.equal(isSlotHidden(m, 0, false, new Set()), false);
});

test("anti-spoil : le bilan est retiré du nom de ronde", () => {
  assert.equal(stripRecord("Ronde 3 (1-1)"), "Ronde 3");
  assert.equal(stripRecord("Ronde 2 (0-1) décisive"), "Ronde 2 décisive");
  assert.equal(stripRecord("Demi-finale 1 : 1er A contre 2e B"), "Demi-finale 1 : 1er A contre 2e B");
});

test("tableau sans règlement : colonnes déduites des liens (élimination simple, données Worlds)", () => {
  const ms = [
    { id: 21, name: "Grand Final: TBD vs TBD", previous: [{ match_id: 19, type: "winner" as const }, { match_id: 20, type: "winner" as const }] },
    { id: 20, name: "Semifinal 2: TBD vs TBD", previous: [{ match_id: 17, type: "winner" as const }, { match_id: 18, type: "winner" as const }] },
    { id: 19, name: "Semifinal 1: TBD vs TBD", previous: [{ match_id: 13, type: "winner" as const }, { match_id: 16, type: "winner" as const }] },
    { id: 18, name: "Quarterfinal 4", previous: [] },
    { id: 17, name: "Quarterfinal 3", previous: [] },
    { id: 16, name: "Quarterfinal 2", previous: [] },
    { id: 13, name: "Quarterfinal 1", previous: [] },
  ];
  const cols = columnsFromLinks(ms)!;
  assert.deepEqual(cols.map((c) => [c.name, c.section, c.matches]), [
    ["Quart de finale", null, [13, 16, 17, 18]],
    ["Demi-finale", null, [19, 20]],
    ["Grande finale", null, [21]],
  ]);
});

test("tableau sans règlement : double élimination (repêchage et grande finale)", () => {
  const W = (id: number) => ({ match_id: id, type: "winner" as const });
  const L = (id: number) => ({ match_id: id, type: "loser" as const });
  const ms = [
    { id: 1, name: "Upper Semifinal 1", previous: [] },
    { id: 2, name: "Upper Semifinal 2", previous: [] },
    { id: 3, name: "Upper Final", previous: [W(1), W(2)] },
    { id: 4, name: "Lower Round 1", previous: [L(1), L(2)] },
    { id: 5, name: "Lower Final", previous: [L(3), W(4)] },
    { id: 6, name: "Grand Final", previous: [W(3), W(5)] },
  ];
  const cols = columnsFromLinks(ms)!;
  assert.deepEqual(cols.map((c) => [c.section, c.matches]), [
    ["upper", [1, 2]], ["upper", [3]], ["lower", [4]], ["lower", [5]], ["final", [6]],
  ]);
  assert.equal(columnsFromLinks(ms.map((m) => ({ ...m, previous: [] }))), null, "sans lien, pas de tableau inventé");
});

test("tableau sans règlement : un quart avec têtes de série reste dans la colonne des quarts", () => {
  const W = (id: number) => ({ match_id: id, type: "winner" as const });
  // Cas réel (VCT Game Changers) : seuls 2 quarts sur 4 sont précédés d'un 1er tour.
  const ms = [
    { id: 1, name: "Upper Bracket Round 1 Match 1", previous: [] },
    { id: 2, name: "Upper Bracket Round 1 Match 2", previous: [] },
    { id: 11, name: "Upper Bracket Quarterfinal Match 1", previous: [W(1)] },
    { id: 12, name: "Upper Bracket Quarterfinal Match 2", previous: [] },
    { id: 13, name: "Upper Bracket Quarterfinal Match 3", previous: [W(2)] },
    { id: 14, name: "Upper Bracket Quarterfinal Match 4", previous: [] },
    { id: 21, name: "Upper Bracket Semifinal 1", previous: [W(11), W(12)] },
    { id: 22, name: "Upper Bracket Semifinal 2", previous: [W(13), W(14)] },
    { id: 31, name: "Upper Bracket Final", previous: [W(21), W(22)] },
  ];
  const cols = columnsFromLinks(ms)!;
  assert.deepEqual(cols.map((c) => [c.name, c.matches]), [
    ["Tableau principal · Tour 1", [1, 2]],
    ["Tableau principal · Quart de finale", [11, 12, 13, 14]],
    ["Tableau principal · Demi-finale", [21, 22]],
    ["Tableau principal · Finale", [31]],
  ]);
});

test("la connexion fusionne favoris et révélations sans rien perdre", () => {
  const local = { "nextround:demo:favorites": '{"teams":[1,2],"orgs":[],"editions":[]}', "nextround:demo:revealed": '["m:1"]', "nextround:spoilerFree": "0" };
  const account = { "nextround:demo:favorites": '{"teams":[2,3],"orgs":[9],"editions":[]}', "nextround:pandascore:favorites": "x", "nextround:spoilerFree": "1" };
  const m = mergePrefs(local, account);
  assert.deepEqual(parseFavorites(m["nextround:demo:favorites"]), { teams: [1, 2, 3], orgs: [9], editions: [] });
  assert.equal(m["nextround:demo:revealed"], '["m:1"]');
  assert.equal(m["nextround:pandascore:favorites"], "x");
  assert.equal(m["nextround:spoilerFree"], "1");
});
