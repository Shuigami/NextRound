"use client";

import Link from "next/link";
import { useState } from "react";
import { Loading } from "@/components/ui";
import { useApi } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint";

export default function AccountPage() {
  const { account, ready, signIn, signOut } = usePrefs();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Retour de Google en échec ou annulé : le backend renvoie ici avec ?erreur=google.
  // Lu au premier rendu côté client ; le serveur affiche le chargement, donc pas d'écart d'hydratation.
  const [error, setError] = useState<string | null>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("erreur") === "google"
      ? "La connexion Google n'a pas abouti. Réessayez, ou utilisez votre e-mail."
      : null,
  );
  const [busy, setBusy] = useState(false);
  const google = useApi<{ google: boolean }>("/auth/providers").data?.google;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande n'a pas pu aboutir.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Compte</h1>
        <p className="text-sm text-muted">
          Facultatif. Sans compte, NextRound fonctionne entièrement : vos favoris restent dans ce navigateur. Un compte les retrouve sur
          tous vos appareils, avec le réglage anti-spoil.
        </p>
      </div>

      {account ? (
        <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
          <p>
            Connecté avec <strong>{account.email}</strong>. Vos{" "}
            <Link href="/favoris" className="underline">
              favoris
            </Link>{" "}
            sont synchronisés.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(signOut)}
            className="rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50"
          >
            Se déconnecter
          </button>
          <p className="text-xs text-faint">Après déconnexion, vos favoris restent aussi dans ce navigateur.</p>
        </div>
      ) : (
        <form
          className="space-y-4 rounded-lg border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => signIn(mode, email, password));
          }}
        >
          <div className="flex gap-1 text-sm" role="tablist" aria-label="Type de demande">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-surface-3 text-text" : "text-muted hover:text-text"}`}
              >
                {m === "login" ? "Se connecter" : "Créer un compte"}
              </button>
            ))}
          </div>
          {google && (
            <>
              {/* Lien et non fetch : la connexion se fait sur les pages de Google, puis revient ici. */}
              <a
                href="/api/auth/google"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2"
              >
                Continuer avec Google
              </a>
              <p className="text-center text-xs text-faint">ou avec votre e-mail</p>
            </>
          )}
          <label className="block space-y-1">
            <span className="text-sm">Adresse e-mail</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Mot de passe{mode === "register" && " (8 caractères minimum)"}</span>
            <input
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="w-full rounded-full border border-brand/60 bg-brand/15 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            {mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
          {mode === "register" && <p className="text-xs text-faint">Les favoris de ce navigateur seront ajoutés au compte.</p>}
        </form>
      )}
    </div>
  );
}
