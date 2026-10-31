"use client";

import { useState } from "react";
import { EditionCard } from "@/components/EditionCard";
import { Filters } from "@/components/Filters";
import { Empty, ErrorState, Loading, Section } from "@/components/ui";
import { type EditionBrief, type EditionStatus, type Game, useApi } from "@/lib/api";

const ORDER: { status: EditionStatus; title: string }[] = [
  { status: "ongoing", title: "En cours" },
  { status: "upcoming", title: "À venir" },
  { status: "finished", title: "Terminées" },
];

export default function CompetitionsPage() {
  const [games, setGames] = useState<Game[]>([]);
  const res = useApi<EditionBrief[]>(`/editions${games.length ? `?game=${games.join(",")}` : ""}`);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Compétitions</h1>
        <p className="text-sm text-muted">Chaque édition a sa page : format expliqué, progression des phases, classements et tableaux.</p>
      </div>
      <Filters games={games} setGames={setGames} />
      {res.loading ? (
        <Loading />
      ) : res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.data!.length === 0 ? (
        <Empty>Aucune compétition pour ces filtres.</Empty>
      ) : (
        ORDER.map(({ status, title }) => {
          const list = res.data!.filter((e) => e.status === status);
          return list.length ? (
            <Section key={status} title={title} id={status}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e) => (
                  <EditionCard key={e.id} e={e} />
                ))}
              </div>
            </Section>
          ) : null;
        })
      )}
    </div>
  );
}
