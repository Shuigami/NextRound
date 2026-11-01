"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { apiGet, apiSend, type Meta, type Organization, type TeamBrief } from "./api";
import { type FavKind, type Favorites, followedTeamIds, hasFavorite, isTeamFollowed, mergePrefs, parseFavorites, toggleFavorite } from "./favorites";
import { editionKey, isRevealed, isScoreHidden, isSlotHidden, matchKey, stripRecord } from "./spoiler";

type Prefs = {
  meta: Meta | null;
  metaError: string | null;
  ready: boolean;
  favorites: Favorites;
  orgs: Organization[];
  followedTeams: number[];
  isFav: (kind: FavKind, id: number) => boolean;
  toggleFav: (kind: FavKind, id: number) => void;
  isTeamFollowed: (t: TeamBrief | null | undefined) => boolean;
  spoilerFree: boolean;
  setSpoilerFree: (v: boolean) => void;
  hideScore: (m: { id: number; status: string; edition: { id: number } }) => boolean;
  editionHidden: (editionId: number) => boolean;
  /** Bilans et scénarios d'un match : ils révèlent les résultats précédents. */
  contextHidden: (m: { id: number; edition: { id: number } }) => boolean;
  /** Équipe placée grâce à un résultat encore masqué. */
  slotHidden: (m: SpoilerMatch, slot: 0 | 1) => boolean;
  /** Nom de match sans bilan tant que le contexte est masqué. */
  safeName: (m: SpoilerMatch) => string | null;
  /** Comment ce match a été révélé en anti-spoil : par lui-même, avec sa compétition, ou pas du tout. */
  revealedBy: (m: { id: number; edition: { id: number } }) => "match" | "edition" | null;
  reveal: (kind: "match" | "edition", id: number) => void;
  hide: (kind: "match" | "edition", id: number) => void;
  /** Compte facultatif : sans lui, tout reste dans ce navigateur. */
  account: Account | null;
  signIn: (mode: "login" | "register", email: string, password: string) => Promise<void>;
  /** Ouvre la session renvoyée par le serveur (connexion, réinitialisation du mot de passe). */
  startSession: (r: AccountReply) => void;
  /** Profil modifié (nom, photo) : la session ne change pas. */
  setAccount: (a: Account) => void;
  signOut: () => Promise<void>;
};

export type Account = {
  email: string;
  username: string | null;
  email_verified: boolean;
  has_password: boolean;
  google: boolean;
  avatar_url: string | null;
};
export type AccountReply = Account & { prefs: Record<string, string> };

type SpoilerMatch = { id: number; status: string; name?: string | null; edition: { id: number }; previous?: { match_id: number; type: "winner" | "loser" }[] };

const Ctx = createContext<Prefs | null>(null);

// Petit magasin localStorage, avec repli en mémoire si le stockage est indisponible (navigation privée).
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}
function write(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* conservé en mémoire pour la session */
  }
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // synchronise les autres onglets
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
// Clés copiées dans le compte quand on est connecté.
const SYNCED = ["demo", "pandascore"].flatMap((m) => [`nextround:${m}:favorites`, `nextround:${m}:revealed`]).concat("nextround:spoilerFree");
function snapshot(): Record<string, string> {
  return Object.fromEntries(SYNCED.flatMap((k) => (read(k) === null ? [] : [[k, read(k)!]])));
}

function useStored(key: string | null): string | null {
  return useSyncExternalStore(subscribe, () => (key ? read(key) : null), () => null);
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const signedIn = account !== null;

  const adopt = useCallback(({ prefs, ...acc }: AccountReply) => {
    const merged = mergePrefs(snapshot(), prefs);
    for (const [k, v] of Object.entries(merged)) if (SYNCED.includes(k)) write(k, v);
    setAccount(acc);
  }, []);

  useEffect(() => {
    apiGet<Meta>("/meta").then(setMeta).catch((e) => setMetaError(e.message));
    apiGet<Organization[]>("/organizations").then(setOrgs).catch(() => setOrgs([]));
    apiGet<AccountReply>("/me").then(adopt).catch(() => setAccount(null)); // 401 = navigation sans compte
  }, [adopt]);

  // Favoris et révélations séparés par mode : un identifiant démo n'a aucun sens en données réelles.
  const ns = meta ? `nextround:${meta.mode}` : null;
  const favRaw = useStored(ns && `${ns}:favorites`);
  const revealedRaw = useStored(ns && `${ns}:revealed`);
  const spoilerRaw = useStored("nextround:spoilerFree");
  const spoilerFree = spoilerRaw === "1";

  // Connecté : chaque changement local est recopié dans le compte. En cas d'échec, le prochain changement renverra tout.
  useEffect(() => {
    if (signedIn) apiSend("PUT", "/me/prefs", snapshot()).catch(() => {});
  }, [signedIn, favRaw, revealedRaw, spoilerRaw]);

  const signIn = useCallback(
    async (mode: "login" | "register", email: string, password: string) =>
      adopt(await apiSend<AccountReply>("POST", `/auth/${mode}`, { email, password })),
    [adopt],
  );
  const signOut = useCallback(async () => {
    await apiSend("POST", "/auth/logout");
    setAccount(null); // les préférences restent dans ce navigateur
  }, []);

  const favorites = useMemo(() => parseFavorites(favRaw), [favRaw]);
  const revealed = useMemo(() => {
    try {
      const v = JSON.parse(revealedRaw ?? "[]");
      return new Set<string>(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  }, [revealedRaw]);

  const toggleFav = useCallback(
    (kind: FavKind, id: number) => {
      if (ns) write(`${ns}:favorites`, JSON.stringify(toggleFavorite(parseFavorites(read(`${ns}:favorites`)), kind, id)));
    },
    [ns],
  );
  const setSpoilerFree = useCallback((v: boolean) => write("nextround:spoilerFree", v ? "1" : "0"), []);
  const reveal = useCallback(
    (kind: "match" | "edition", id: number) => {
      if (ns) write(`${ns}:revealed`, JSON.stringify([...revealed, kind === "match" ? matchKey(id) : editionKey(id)]));
    },
    [ns, revealed],
  );
  const hide = useCallback(
    (kind: "match" | "edition", id: number) => {
      const key = kind === "match" ? matchKey(id) : editionKey(id);
      if (ns) write(`${ns}:revealed`, JSON.stringify([...revealed].filter((k) => k !== key)));
    },
    [ns, revealed],
  );

  const value = useMemo<Prefs>(
    () => ({
      meta,
      metaError,
      ready: ns !== null,
      favorites,
      orgs,
      followedTeams: followedTeamIds(favorites, orgs),
      isFav: (k, id) => hasFavorite(favorites, k, id),
      toggleFav,
      isTeamFollowed: (t) => isTeamFollowed(favorites, t),
      spoilerFree,
      setSpoilerFree,
      hideScore: (m) => isScoreHidden(m, spoilerFree, revealed),
      editionHidden: (id) => spoilerFree && !revealed.has(editionKey(id)),
      contextHidden: (m) => spoilerFree && !isRevealed(revealed, m.id, m.edition.id),
      slotHidden: (m, slot) => isSlotHidden(m, slot, spoilerFree, revealed),
      safeName: (m) => (m.name && spoilerFree && !isRevealed(revealed, m.id, m.edition.id) ? stripRecord(m.name) : (m.name ?? null)),
      revealedBy: (m) =>
        !spoilerFree ? null : revealed.has(editionKey(m.edition.id)) ? "edition" : revealed.has(matchKey(m.id)) ? "match" : null,
      reveal,
      hide,
      account,
      signIn,
      startSession: adopt,
      setAccount,
      signOut,
    }),
    [meta, metaError, ns, favorites, orgs, toggleFav, spoilerFree, setSpoilerFree, revealed, reveal, hide, account, signIn, adopt, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs hors de PrefsProvider");
  return v;
}
