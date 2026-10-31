"use client";

import { useId, useState } from "react";
import type { ApiError, Game, MatchStatus, TeamBrief } from "@/lib/api";
import { GAMES, STATUS } from "@/lib/format";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { usePrefs } from "@/lib/prefs";
import type { FavKind } from "@/lib/favorites";
import { Icon, StateGlyph } from "./Icon";

/** Teinte d'un jeu sur une surface : fond et bordure dérivés du jeton --game-*. */
export function gameTint(game: Game, strength = 10): React.CSSProperties {
  const c = GAMES[game].color;
  return { background: `color-mix(in oklab, ${c} ${strength}%, var(--surface))`, borderColor: `color-mix(in oklab, ${c} ${strength * 3}%, var(--line))` };
}

export function GameBadge({ game, full = false }: { game: Game; full?: boolean }) {
  const g = GAMES[game];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ ...gameTint(game, 14), color: `color-mix(in oklab, ${g.color} 70%, var(--text))` }}
    >
      <span className="size-2 rounded-sm" style={{ background: g.color }} aria-hidden="true" />
      {full ? g.label : g.short}
      {!full && <span className="sr-only"> ({g.label})</span>}
    </span>
  );
}

const STATUS_STYLE: Record<MatchStatus, string> = {
  not_started: "text-muted",
  running: "text-live font-semibold",
  finished: "text-faint",
  postponed: "text-warn",
  canceled: "text-faint line-through",
};

export function StatusTag({ status }: { status: MatchStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${STATUS_STYLE[status]}`}>
      <StateGlyph icon={s.icon} className="size-3" />
      {s.label}
    </span>
  );
}

/** Logo d'équipe avec avatar de secours (initiales + couleur stable) si l'image manque ou échoue. */
export function TeamLogo({ name, src, size = 32 }: { name: string; src: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 object-contain" style={{ width: size, height: size }} />
    );
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  let n = 0;
  for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  const h = Math.round((n * 137.508) % 360); // angle d'or : deux noms proches donnent des teintes éloignées
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold text-white/90"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 52% 34%)`, boxShadow: `inset 0 0 0 1px hsl(${h} 60% 50% / 0.5)` }}
    >
      {initials}
    </span>
  );
}

export function FavButton({ kind, id, label, compact = false }: { kind: FavKind; id: number; label: string; compact?: boolean }) {
  const { isFav, toggleFav, ready } = usePrefs();
  const on = isFav(kind, id);
  return (
    <button
      type="button"
      disabled={!ready}
      aria-pressed={on}
      aria-label={on ? `Retirer ${label} des favoris` : `Ajouter ${label} aux favoris`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFav(kind, id);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border text-sm transition-colors disabled:opacity-50 ${
        compact ? "p-2.5" : "px-3 py-2"
      } ${on ? "border-warn/50 bg-warn/10 text-warn" : "border-line text-muted hover:text-text"}`}
    >
      <Icon name="star" filled={on} />
      {!compact && <span>{on ? "Suivi" : "Suivre"}</span>}
    </button>
  );
}

/**
 * Étoile d'une équipe. Si l'équipe est suivie via son organisation, l'étoile est pleine mais ne se décoche pas ici :
 * on arrête de suivre l'organisation (sinon le clic n'aurait aucun effet visible).
 */
export function TeamFollow({ team, compact = false }: { team: TeamBrief; compact?: boolean }) {
  const { isFav, orgs } = usePrefs();
  const viaOrg = team.organization_id !== null && isFav("orgs", team.organization_id) && !isFav("teams", team.id);
  if (!viaOrg) return <FavButton kind="teams" id={team.id} label={team.name} compact={compact} />;
  const org = orgs.find((o) => o.id === team.organization_id)?.name ?? "son organisation";
  return (
    <span
      role="img"
      aria-label={`${team.name} est suivie via l'organisation ${org}`}
      title={`Suivie via l'organisation ${org}. Pour arrêter, ne suivez plus l'organisation.`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-warn/50 text-sm text-warn ${compact ? "p-2.5" : "px-3 py-2"}`}
    >
      <Icon name="star" filled />
      {!compact && <span>Suivie via {org}</span>}
    </span>
  );
}

/** Suivi d'une organisation entière : action secondaire, sous forme de lien. */
export function OrgFollow({ org, count }: { org: { id: number; name: string }; count: number }) {
  const { isFav, toggleFav, ready } = usePrefs();
  const on = isFav("orgs", org.id);
  return (
    <button
      type="button"
      disabled={!ready}
      aria-pressed={on}
      onClick={() => toggleFav("orgs", org.id)}
      className="text-sm text-brand underline decoration-brand/40 underline-offset-4 hover:decoration-brand disabled:opacity-50"
    >
      {on ? `Ne plus suivre l'organisation ${org.name}` : `Suivre toute l'organisation (${count} équipes)`}
    </button>
  );
}

/** Terme technique avec définition dépliable, accessible au clavier et au lecteur d'écran. */
export function Term({ k, children }: { k: GlossaryKey; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const g = GLOSSARY[k];
  return (
    <span className="relative inline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="cursor-help underline decoration-brand/60 decoration-dotted underline-offset-4 hover:decoration-brand"
      >
        {children ?? g.term}
      </button>
      {open && (
        <span id={id} role="note" aria-live="polite" className="mt-1 block rounded-md border border-line bg-surface-2 p-2 text-sm font-normal text-muted">
          <strong className="text-text">{g.term} : </strong>
          {g.def}
        </span>
      )}
    </span>
  );
}

/** Rappel honnête sur les pages de listes : l'anti-spoil masque beaucoup, pas tout. */
export function SpoilerNotice() {
  const { spoilerFree } = usePrefs();
  if (!spoilerFree) return null;
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <Icon name="eyeOff" className="mt-0.5 size-4 shrink-0" />
      <span>
        Anti-spoil activé : scores, vainqueurs, bilans et équipes issues d&apos;un résultat sont masqués. La simple présence
        d&apos;une équipe dans un match à venir peut toutefois indiquer qu&apos;elle s&apos;est qualifiée.
      </span>
    </p>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-surface" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad/5 p-4 text-sm">
      <p className="font-semibold">
        <Icon name="alert" className="mr-1 inline size-4 text-bad" />
        {error.status === 404 ? "Introuvable" : "Impossible de charger ces données"}
      </p>
      <p className="mt-1 text-muted">{error.message}</p>
      {onRetry && error.status !== 404 && (
        <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
          <Icon name="refresh" /> Réessayer
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function Section({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id={id} className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="group flex items-center gap-2 text-sm text-muted hover:text-text">
      <span className={`relative h-5 w-9 rounded-full border transition-colors ${on ? "border-brand bg-brand/40" : "border-line bg-surface-3"}`} aria-hidden="true">
        <span className={`absolute top-0.5 size-3.5 rounded-full transition-[left,background-color] ${on ? "left-[1.125rem] bg-text" : "left-0.5 bg-muted"}`} />
      </span>
      <span className={on ? "text-text" : ""}>{label}</span>
    </button>
  );
}

/** Choix exclusif entre quelques vues (ex. À venir / En direct / Résultats). Flèches gauche/droite. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Record<T, string>; onChange: (v: T) => void; label: string }) {
  const keys = Object.keys(options) as T[];
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-surface p-0.5"
      onKeyDown={(e) => {
        const i = keys.indexOf(value);
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = keys[(i + d + keys.length) % keys.length];
        onChange(next);
        (e.currentTarget.querySelector(`[data-key="${next}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {keys.map((k) => (
        <button
          key={k}
          data-key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          tabIndex={value === k ? 0 : -1}
          onClick={() => onChange(k)}
          className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${value === k ? "bg-surface-3 font-medium text-text" : "text-muted hover:text-text"}`}
        >
          {options[k]}
        </button>
      ))}
    </div>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-brand/60 bg-brand/15 text-text" : "border-line text-muted hover:text-text"}`}
    >
      {children}
    </button>
  );
}
