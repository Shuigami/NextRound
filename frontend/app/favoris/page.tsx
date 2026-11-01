"use client";

import Link from "next/link";
import { EditionCard } from "@/components/EditionCard";
import { Empty, ErrorState, FavButton, GameBadge, Loading, Section, TeamLogo } from "@/components/ui";
import { type EditionBrief, useApi } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";

export default function FavoritesPage() {
  const { favorites, orgs, ready, meta, account } = usePrefs();
  const editions = useApi<EditionBrief[]>("/editions");
  const teams = orgs.flatMap((o) => o.teams);
  const followedOrgs = orgs.filter((o) => favorites.orgs.includes(o.id));
  const followedTeams = teams.filter((t) => favorites.teams.includes(t.id));
  const followedEditions = (editions.data ?? []).filter((e) => favorites.editions.includes(e.id));

  if (!ready) return <Loading />;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Favoris</h1>
        <p className="text-sm text-muted">
          {account ? (
            <>Synchronisés avec votre compte ({account.email})</>
          ) : (
            <>
              Enregistrés dans ce navigateur, sans compte.{" "}
              <Link href="/compte" className="underline hover:text-text">
                Créez un compte
              </Link>{" "}
              pour les retrouver sur vos autres appareils
            </>
          )}
          {meta?.mode === "demo" ? ". Les favoris du mode démo sont séparés de ceux des données réelles." : "."}
        </p>
      </div>

      <Section title={`Organisations suivies (${followedOrgs.length})`} id="orgs">
        {followedOrgs.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {followedOrgs.map((o) => (
              <li key={o.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <TeamLogo name={o.name} src={o.logo_url} size={32} />
                  <div className="flex-1">
                    <div className="font-semibold">{o.name}</div>
                    <div className="text-xs text-muted">Toutes ses équipes sont suivies :</div>
                  </div>
                  <FavButton kind="orgs" id={o.id} label={`l'organisation ${o.name}`} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.teams.map((t) => (
                    <Link key={t.id} href={`/equipes/${t.id}`} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-sm hover:bg-surface-2">
                      <GameBadge game={t.game} /> {t.name}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune organisation suivie. Sur la page Équipes, l&apos;étoile d&apos;une organisation suit toutes ses équipes.</Empty>
        )}
      </Section>

      <Section title={`Équipes suivies individuellement (${followedTeams.length})`} id="teams">
        {followedTeams.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {followedTeams.map((t) => (
              <li key={t.id} className="relative flex items-center gap-2 rounded-lg border border-line bg-surface p-2.5 hover:bg-surface-2">
                <TeamLogo name={t.name} src={t.logo_url} size={28} />
                <Link href={`/equipes/${t.id}`} className="flex-1 truncate after:absolute after:inset-0">
                  {t.name}
                </Link>
                <GameBadge game={t.game} />
                <span className="relative z-10">
                  <FavButton kind="teams" id={t.id} label={t.name} compact />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            Aucune équipe suivie individuellement. <Link href="/equipes" className="text-brand underline">Parcourir les équipes</Link>
          </Empty>
        )}
      </Section>

      <Section title={`Compétitions suivies (${followedEditions.length})`} id="editions">
        {editions.loading ? (
          <Loading />
        ) : editions.error ? (
          <ErrorState error={editions.error} onRetry={editions.reload} />
        ) : followedEditions.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {followedEditions.map((e) => (
              <EditionCard key={e.id} e={e} />
            ))}
          </div>
        ) : (
          <Empty>
            Aucune compétition suivie. <Link href="/competitions" className="text-brand underline">Parcourir les compétitions</Link>
          </Empty>
        )}
      </Section>
    </div>
  );
}
