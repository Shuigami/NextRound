"use client";

import Link from "next/link";
import { use, useState } from "react";
import { apiSend } from "@/lib/api";
import { type AccountReply, usePrefs } from "@/lib/prefs";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint";

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { startSession } = usePrefs();
  const raw = use(searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (password !== confirm) return setError("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    setError(null);
    try {
      startSession(await apiSend<AccountReply>("POST", "/auth/reset", { token, password }));
      window.history.replaceState(null, "", "/compte/reinitialiser"); // le lien ne sert plus, on le retire de l'historique
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La demande n'a pas pu aboutir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Nouveau mot de passe</h1>
      {done ? (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <p>Mot de passe enregistré. Vous êtes connecté, et vos autres sessions ont été fermées.</p>
          <Link href="/compte" className="inline-block rounded-full border border-line px-4 py-1.5 text-sm hover:bg-surface-2">
            Voir mon compte
          </Link>
        </div>
      ) : !token ? (
        <p className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm">
          Ce lien est incomplet. Demandez un nouveau lien depuis la page{" "}
          <Link href="/compte" className="underline">
            Compte
          </Link>
          .
        </p>
      ) : (
        <form
          className="space-y-4 rounded-lg border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm">Nouveau mot de passe (8 caractères minimum)</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm">Confirmez le mot de passe</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="w-full rounded-full border border-brand/60 bg-brand/15 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Enregistrer le mot de passe
          </button>
        </form>
      )}
    </div>
  );
}
