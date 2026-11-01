"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Avatar, Loading } from "@/components/ui";
import { apiGet, apiSend, useApi } from "@/lib/api";
import { type Account, usePrefs } from "@/lib/prefs";

const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-faint";
const button = "rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:text-text disabled:opacity-50";
const primary = "w-full rounded-full border border-brand/60 bg-brand/15 px-4 py-2 text-sm font-semibold disabled:opacity-50";

type Notice = { tone: "ok" | "bad"; text: string };
type Run = (action: () => Promise<string | void>) => Promise<void>;

// Messages laissés dans l'URL par le lien de vérification et le retour de Google.
function noticeFromUrl(q: Record<string, string | string[] | undefined>): Notice | null {
  if (q.verifie === "ok") return { tone: "ok", text: "Adresse e-mail confirmée. Merci !" };
  if (q.verifie === "invalide") return { tone: "bad", text: "Ce lien de vérification est invalide ou a expiré. Demandez-en un nouveau." };
  if (q.erreur === "google") return { tone: "bad", text: "La connexion Google n'a pas abouti. Réessayez, ou utilisez votre e-mail." };
  return null;
}

export default function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { account, ready } = usePrefs();
  const query = use(searchParams);
  const [notice, setNotice] = useState<Notice | null>(() => noticeFromUrl(query));
  const [busy, setBusy] = useState(false);

  const run: Run = async (action) => {
    setBusy(true);
    setNotice(null);
    try {
      const text = await action();
      if (text) setNotice({ tone: "ok", text });
    } catch (e) {
      setNotice({ tone: "bad", text: e instanceof Error ? e.message : "La demande n'a pas pu aboutir." });
    } finally {
      setBusy(false);
    }
  };

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
      {notice && (
        <p role={notice.tone === "bad" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${notice.tone === "bad" ? "border-bad/40 bg-bad/10" : "border-ok/40 bg-ok/10"}`}>
          {notice.text}
        </p>
      )}
      {account ? <Profile account={account} run={run} busy={busy} /> : <SignIn run={run} busy={busy} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function SignIn({ run, busy }: { run: Run; busy: boolean }) {
  const { signIn } = usePrefs();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const google = useApi<{ google: boolean }>("/auth/providers").data?.google;

  const submit = () =>
    run(async () => {
      if (mode === "forgot") {
        await apiSend("POST", "/auth/forgot", { email });
        return "Si un compte existe pour cette adresse, un lien pour choisir un nouveau mot de passe vient d'être envoyé (valable 1 h).";
      }
      await signIn(mode, email, password);
      setPassword("");
      if (mode === "register") return "Compte créé. Un e-mail de vérification vous a été envoyé.";
    });

  return (
    <form
      className="space-y-4 rounded-lg border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {mode === "forgot" ? (
        <div className="space-y-1">
          <h2 className="font-semibold">Mot de passe oublié</h2>
          <p className="text-sm text-muted">Indiquez votre adresse : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
        </div>
      ) : (
        <>
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
        </>
      )}
      <label className="block space-y-1">
        <span className="text-sm">Adresse e-mail</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      {mode !== "forgot" && (
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between text-sm">
            <span>Mot de passe{mode === "register" && " (8 caractères minimum)"}</span>
            {mode === "login" && (
              <button type="button" onClick={() => setMode("forgot")} className="text-xs text-muted underline hover:text-text">
                Mot de passe oublié ?
              </button>
            )}
          </span>
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
      )}
      <button type="submit" disabled={busy} className={primary}>
        {mode === "login" ? "Se connecter" : mode === "register" ? "Créer mon compte" : "Envoyer le lien"}
      </button>
      {mode === "register" && <p className="text-xs text-faint">Les favoris de ce navigateur seront ajoutés au compte.</p>}
      {mode === "forgot" && (
        <button type="button" onClick={() => setMode("login")} className="text-sm text-muted underline hover:text-text">
          Retour à la connexion
        </button>
      )}
    </form>
  );
}

/** Recadre au centre en carré de 256 px : la photo pèse ~20 Ko au lieu de plusieurs Mo. */
async function squareJpeg(file: File, size = 256): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => {
    throw new Error("Image illisible. Essayez un fichier JPEG, PNG ou WebP.");
  });
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // le JPEG n'a pas de transparence
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Image illisible."))), "image/jpeg", 0.88));
}

function Profile({ account, run, busy }: { account: Account; run: Run; busy: boolean }) {
  const { setAccount, signOut } = usePrefs();
  const [username, setUsername] = useState(account.username ?? "");
  const changed = username.trim().toLowerCase() !== (account.username ?? "");

  const sendPasswordLink = () =>
    run(async () => {
      await apiSend("POST", "/auth/forgot", { email: account.email });
      return `Un lien pour choisir un mot de passe a été envoyé à ${account.email} (valable 1 h).`;
    });

  return (
    <div className="space-y-4">
      <Card title="Profil">
        <div className="flex items-center gap-4">
          <Avatar name={account.username ?? account.email} src={account.avatar_url} size={72} />
          <div className="flex flex-wrap gap-2">
            <label className={`${button} cursor-pointer focus-within:outline-2 focus-within:outline-brand`}>
              {account.avatar_url ? "Changer la photo" : "Ajouter une photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    run(async () => {
                      const body = await squareJpeg(file);
                      setAccount(await apiGet<Account>("/me/avatar", { method: "PUT", body, headers: { "Content-Type": "image/jpeg" } }));
                      return "Photo de profil mise à jour.";
                    });
                }}
              />
            </label>
            {account.avatar_url && (
              <button type="button" disabled={busy} className={button} onClick={() => run(async () => setAccount(await apiSend<Account>("DELETE", "/me/avatar")))}>
                Retirer
              </button>
            )}
          </div>
        </div>
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const a = await apiSend<Account>("PATCH", "/me", { username: username.trim() || null });
              setAccount(a);
              setUsername(a.username ?? "");
              return a.username ? `Vous êtes maintenant @${a.username}.` : "Nom d'utilisateur retiré.";
            });
          }}
        >
          <label htmlFor="username" className="text-sm">
            Nom d&apos;utilisateur
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-faint">@</span>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={20}
                pattern="[A-Za-z0-9_]{3,20}"
                title="3 à 20 caractères : lettres, chiffres ou _"
                autoComplete="username"
                className={`${field} pl-7`}
              />
            </div>
            <button type="submit" disabled={busy || !changed} className={button}>
              Enregistrer
            </button>
          </div>
          <p className="text-xs text-faint">3 à 20 caractères : lettres, chiffres ou _. Enregistré en minuscules.</p>
        </form>
      </Card>

      <Card title="Adresse e-mail">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{account.email}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${account.email_verified ? "border-ok/40 text-ok" : "border-warn/40 text-warn"}`}>
            {account.email_verified ? "Vérifiée" : "Non vérifiée"}
          </span>
        </p>
        {!account.email_verified && (
          <>
            <p className="text-sm text-muted">Confirmez votre adresse avec le lien reçu par e-mail : elle permet de récupérer votre compte.</p>
            <button
              type="button"
              disabled={busy}
              className={button}
              onClick={() =>
                run(async () => {
                  await apiSend("POST", "/me/verify-email");
                  return `E-mail de vérification envoyé à ${account.email}.`;
                })
              }
            >
              Renvoyer l&apos;e-mail
            </button>
          </>
        )}
      </Card>

      <Card title="Connexion">
        <ul className="space-y-1 text-sm">
          <li>Mot de passe : {account.has_password ? "défini" : "aucun"}</li>
          <li>Google : {account.google ? "relié" : "non relié"}</li>
        </ul>
        <button type="button" disabled={busy} className={button} onClick={sendPasswordLink}>
          {account.has_password ? "Changer de mot de passe" : "Ajouter un mot de passe"}
        </button>
        <p className="text-xs text-faint">Un lien vous est envoyé par e-mail : il prouve que l&apos;adresse est bien la vôtre.</p>
      </Card>

      <div className="space-y-2">
        <p className="text-sm text-muted">
          Vos{" "}
          <Link href="/favoris" className="underline">
            favoris
          </Link>{" "}
          sont synchronisés. Après déconnexion, ils restent aussi dans ce navigateur.
        </p>
        <button type="button" disabled={busy} onClick={() => run(signOut)} className={button}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
