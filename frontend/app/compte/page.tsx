"use client";

import Link from "next/link";
import { useState } from "react";
import { Loading } from "@/components/ui";
import { usePrefs } from "@/lib/prefs";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint";

export default function AccountPage() {
  const { account, ready, signIn, signOut } = usePrefs();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
