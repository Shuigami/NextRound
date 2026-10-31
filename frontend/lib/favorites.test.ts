// Lancer avec : npm test (node --test, types retirés nativement par Node ≥ 23.6)
import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FAVORITES, followedTeamIds, isTeamFollowed, parseFavorites, toggleFavorite } from "./favorites.ts";
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
