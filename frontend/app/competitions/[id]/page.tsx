"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EDITION_STATUS } from "@/components/EditionCard";
import { FormatSection } from "@/components/format/FormatSection";
import { FormatStrip } from "@/components/FormatStrip";
import { Icon, StateGlyph } from "@/components/Icon";
import { PANEL_ID, PhaseTabs, phaseState, stagesOf, tabId } from "@/components/PhaseTabs";
import { PhaseView } from "@/components/PhaseView";
import { ErrorState, FavButton, GameBadge, gameTint, Loading, Section, TeamLogo } from "@/components/ui";
import { type EditionDetail, type PhaseDetail, useApi } from "@/lib/api";
import { fmtRelative, fmtShort } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";

export default function EditionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: e, error, loading, reload } = useApi<EditionDetail>(`/editions/${id}`);
  const { isTeamFollowed, editionHidden, reveal, hide, spoilerFree } = usePrefs();
  const [tab, setTab] = useState<number | null>(null);

  useEffect(() => {
    if (e) document.title = `${e.name} · NextRound`;
  }, [e]);

  if (loading) return <Loading />;
  if (error || !e) return <ErrorState error={error!} onRetry={reload} />;

  const s = EDITION_STATUS[e.status];
  const followed = e.participants.filter((t) => isTeamFollowed(t));
  // Par défaut : la phase en cours, sinon la prochaine, sinon la première.
  const phase =
    e.phases.find((p) => p.id === tab) ??
    e.phases.find((p) => phaseState(p.matches).key === "live") ??
    e.phases.find((p) => phaseState(p.matches).key === "next") ??
    e.phases[0];
  const stages = stagesOf(e.phases, e.rules);
  const isMine = (p: PhaseDetail) => p.matches.some((m) => isTeamFollowed(m.team1) || isTeamFollowed(m.team2));
  const phaseRules = phase && e.rules?.phases.find((r) => r.key === phase.rules_key);
  const hidden = editionHidden(e.id);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <nav aria-label="Fil d'Ariane" className="text-sm text-muted">
          <Link href="/competitions" className="hover:text-text">Compétitions</Link> › {e.competition.name}
        </nav>
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border p-5 sm:p-6" style={gameTint(e.game, 9)}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <GameBadge game={e.game} full />
              <span className={`inline-flex items-center gap-1 ${s.cls}`}>
                <StateGlyph icon={s.icon} className="size-3" /> {s.label}
              </span>
              <span className="text-muted">
                {fmtShort(e.begin_at)} – {fmtShort(e.end_at)}
              </span>
            </div>
            <h1 className="mt-2 text-balance font-display text-3xl font-bold tracking-tight sm:text-5xl">{e.name}</h1>
            <div className="mt-2">
              <FormatStrip format={e.format} size="md" />
            </div>
          </div>
          <FavButton kind="editions" id={e.id} label={e.name} />
        </div>
        {e.winner &&
          (hidden ? (
            <button type="button" onClick={() => reveal("edition", e.id)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-text">
              <Icon name="eye" /> Révéler le vainqueur
            </button>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border border-warn/40 bg-warn/10 p-4">
              <Icon name="trophy" className="size-8 shrink-0 text-warn" />
              <TeamLogo name={e.winner.name} src={e.winner.logo_url} size={44} />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-warn">Champion</div>
                <Link href={`/equipes/${e.winner.id}`} className="font-display text-2xl font-bold tracking-tight hover:underline">
                  {e.winner.name}
                </Link>
              </div>
            </div>
          ))}
        {spoilerFree && !hidden && (
          <button type="button" onClick={() => hide("edition", e.id)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:text-text">
            <Icon name="eyeOff" /> Compétition révélée malgré l&apos;anti-spoil · masquer à nouveau
          </button>
        )}
        {e.siblings.length > 1 && (
          <nav aria-label="Autres éditions" className="flex flex-wrap gap-2 text-sm">
            <span className="text-muted">Éditions :</span>
            {e.siblings.map((sib) => (
              <Link
                key={sib.id}
                href={`/competitions/${sib.id}`}
                aria-current={sib.id === e.id ? "page" : undefined}
                className={`rounded-full border px-3 py-0.5 ${sib.id === e.id ? "border-brand/60 bg-brand/15" : "border-line text-muted hover:text-text"}`}
              >
                {sib.name}
              </Link>
            ))}
          </nav>
        )}
        {followed.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 text-warn">
              <Icon name="star" filled className="size-3.5" /> Vos équipes ici :
            </span>
            {followed.map((t) => (
              <Link key={t.id} href={`/equipes/${t.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-warn/40 px-2 py-0.5 hover:bg-surface-2">
                <TeamLogo name={t.name} src={t.logo_url} size={16} /> {t.name}
              </Link>
            ))}
          </p>
        )}
      </header>

      <Section title="Progression" id="phases">
        {e.phases.length === 0 ? (
          <p className="text-sm text-muted">Aucune phase enregistrée.</p>
        ) : (
          <>
            {/* Une seule phase : pas d'onglets, juste son état. */}
            {e.phases.length > 1 ? (
              <PhaseTabs stages={stages} selected={phase!.id} onSelect={setTab} isMine={isMine} />
            ) : (
              <p className="text-sm text-muted">
                {phase!.name} · <span className={phaseState(phase!.matches).cls}>{phaseState(phase!.matches).label}</span>
              </p>
            )}
            {phase && (
              <div id={PANEL_ID} role={e.phases.length > 1 ? "tabpanel" : undefined} aria-labelledby={e.phases.length > 1 ? tabId(phase.id) : undefined}>
                <PhaseView phase={phase} rules={phaseRules ?? undefined} editionId={e.id} />
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Comprendre le format" id="format">
        <FormatSection rules={e.rules} />
      </Section>

      <Section title={`Participants (${e.participants.length})`} id="participants">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {e.participants.map((t) => (
            <li key={t.id}>
              <Link href={`/equipes/${t.id}`} className={`flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-surface-2 ${isTeamFollowed(t) ? "border-warn/40" : "border-line"}`}>
                <TeamLogo name={t.name} src={t.logo_url} size={24} />
                <span className="truncate">{t.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <p className="text-xs text-faint">Données synchronisées {fmtRelative(e.synced_at)}.</p>
    </div>
  );
}
