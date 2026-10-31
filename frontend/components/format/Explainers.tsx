"use client";

// Composants pédagogiques réutilisables. Ils ne lisent que des paramètres de règles, jamais un jeu.
import type { Outcome, OutcomeKind, PhaseRules, SeriesFormat } from "@/lib/api";
import { seriesLabel } from "@/lib/format";
import { Icon, type IconName } from "../Icon";
import { Term } from "../ui";

export const OUTCOME_STYLE: Record<OutcomeKind, { icon: IconName; cls: string; text: string }> = {
  qualified: { icon: "check", cls: "border-ok/40 bg-ok/10 text-ok", text: "Qualifié" },
  title: { icon: "trophy", cls: "border-warn/50 bg-warn/10 text-warn", text: "Titre" },
  advance: { icon: "arrowRight", cls: "border-ok/40 bg-ok/10 text-ok", text: "Avance" },
  continue: { icon: "refresh", cls: "border-info/40 bg-info/10 text-info", text: "Continue" },
  lower_bracket: { icon: "arrowDownRight", cls: "border-warn/40 bg-warn/10 text-warn", text: "Repêchage" },
  runner_up: { icon: "medal", cls: "border-line bg-surface-3 text-text", text: "Finaliste" },
  eliminated: { icon: "x", cls: "border-bad/40 bg-bad/10 text-bad", text: "Éliminé" },
  depends: { icon: "split", cls: "border-info/40 bg-info/10 text-info", text: "Incertain" },
  tiebreak: { icon: "scale", cls: "border-warn/40 bg-warn/10 text-warn", text: "Départage" },
};

export function OutcomeTag({ o, small = false }: { o: Outcome; small?: boolean }) {
  const s = OUTCOME_STYLE[o.kind];
  return (
    <span className={`inline-flex items-start gap-1.5 rounded-md border ${s.cls} ${small ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"}`}>
      <Icon name={s.icon} className={`shrink-0 ${small ? "mt-px size-3.5" : "mt-0.5 size-4"}`} />
      <span className="text-text">{o.label}</span>
    </span>
  );
}

/** BO / FT : cases de manches, celles nécessaires pour gagner sont mises en avant. */
export function SeriesExplainer({ f }: { f: SeriesFormat }) {
  const lbl = seriesLabel(f.type, f.value);
  const need = f.type === "best_of" ? Math.floor(f.value / 2) + 1 : f.value;
  const boxes = f.type === "best_of" ? f.value : f.value * 2 - 1;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3 sm:flex-row sm:items-center">
      <div className="min-w-28">
        <div className="font-mono font-bold">
          <Term k={f.type === "best_of" ? "bo" : "ft"}>{lbl?.short}</Term>
        </div>
        <div className="text-xs text-muted">{f.applies_to}</div>
      </div>
      <div className="flex-1">
        {boxes > 1 && <div className="flex flex-wrap gap-1" aria-hidden="true">
          {Array.from({ length: boxes }, (_, i) => (
            <span key={i} className={`h-5 w-7 rounded-sm border ${i < need ? "border-brand/70 bg-brand/25" : "border-dashed border-line"}`} />
          ))}
        </div>}
        <p className="mt-1 text-sm text-muted">
          {lbl?.long} {f.type === "first_to" && `(au plus ${boxes} manches si aucune n'est nulle)`}
        </p>
      </div>
    </div>
  );
}

/** Poule : grille « tout le monde contre tout le monde » + issue de chaque place. */
export function RoundRobinViz({ r }: { r: PhaseRules }) {
  const size = Math.floor(r.participants / r.group_count);
  const games = (size * (size - 1)) / 2;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-sm text-muted">
          {r.group_count > 1 ? `${r.group_count} poules de ${size}` : `Une poule de ${size}`} : {games} matchs par poule, {size - 1} par équipe.
        </p>
        <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${size + 1}, 1.75rem)` }} aria-hidden="true">
          <span />
          {Array.from({ length: size }, (_, i) => (
            <span key={`h${i}`} className="text-center text-xs text-faint">
              {String.fromCharCode(65 + i)}
            </span>
          ))}
          {Array.from({ length: size }, (_, row) => [
            <span key={`r${row}`} className="text-center text-xs leading-7 text-faint">
              {String.fromCharCode(65 + row)}
            </span>,
            ...Array.from({ length: size }, (_, col) => (
              <span key={`${row}-${col}`} className={`size-7 rounded-sm ${row === col ? "bg-transparent" : row < col ? "bg-brand/30" : "bg-surface-3"}`} />
            )),
          ])}
        </div>
        <p className="mt-1 text-xs text-faint">Chaque case colorée est un match. Chaque paire d&apos;équipes ne se rencontre qu&apos;une fois.</p>
      </div>
      <ol className="space-y-1.5">
        {r.rank_outcomes.map((o) => (
          <li key={o.ranks.join()} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-right font-mono text-sm text-muted">
              {o.ranks.length > 1 ? `${o.ranks[0]}e-${o.ranks[o.ranks.length - 1]}e` : `${o.ranks[0]}${o.ranks[0] === 1 ? "er" : "e"}`}
            </span>
            <OutcomeTag o={o} small />
          </li>
        ))}
      </ol>
    </div>
  );
}

type Pool = { w: number; l: number; n: number };

/** Ronde suisse : répartition des bilans ronde par ronde (pools pairs supposés). */
export function SwissViz({ r }: { r: PhaseRules }) {
  const W = r.wins_to_qualify ?? 0;
  const L = r.losses_to_eliminate ?? 0;
  let active: Pool[] = [{ w: 0, l: 0, n: r.participants }];
  const columns: { active: Pool[]; done: Pool[] }[] = [{ active, done: [] }];
  let uneven = false;
  for (let round = 0; round < W + L - 1 && active.length; round++) {
    const next = new Map<string, Pool>();
    for (const p of active) {
      if (p.n % 2) uneven = true;
      for (const [w, l] of [[p.w + 1, p.l], [p.w, p.l + 1]]) {
        const k = `${w}-${l}`;
        next.set(k, { w, l, n: (next.get(k)?.n ?? 0) + p.n / 2 });
      }
    }
    const all = [...next.values()].sort((a, b) => b.w - a.w);
    active = all.filter((p) => p.w < W && p.l < L);
    columns.push({ active, done: all.filter((p) => p.w >= W || p.l >= L) });
  }
  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((c, i) => (
          <div key={i} className="min-w-32 space-y-1.5">
            <div className="text-xs font-semibold text-muted">{i === 0 ? "Départ" : `Après la ronde ${i}`}</div>
            {c.done.map((p) => {
              const q = p.w >= W;
              return (
                <div key={`d${p.w}-${p.l}`} className={`rounded-md border px-2 py-1 text-sm ${q ? "border-ok/40 bg-ok/10" : "border-bad/40 bg-bad/10"}`}>
                  <span className="font-mono">{p.w}-{p.l}</span> · {p.n} éq.
                  <div className={`flex items-center gap-1 text-xs ${q ? "text-ok" : "text-bad"}`}>
                    <Icon name={q ? "check" : "x"} className="size-3" />
                    {q ? "Qualifiées" : "Éliminées"}
                  </div>
                </div>
              );
            })}
            {c.active.map((p) => (
              <div key={`a${p.w}-${p.l}`} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-sm">
                <span className="font-mono">{p.w}-{p.l}</span> · {p.n} éq.
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Icon name="refresh" className="size-3" /> Encore en lice
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted">
        {W} victoires qualifient, {L} défaites éliminent. Une équipe joue entre {Math.min(W, L)} et {W + L - 1} matchs.
        {uneven && " Effectifs impairs : la répartition réelle peut différer légèrement."}
      </p>
    </div>
  );
}

/** Élimination simple ou double : couloirs tableau principal / repêchage / finale, et issue de chaque tour. */
export function BracketFlow({ r }: { r: PhaseRules }) {
  const lanes: { key: string; label: React.ReactNode; rounds: PhaseRules["rounds"] }[] =
    r.type === "double_elimination"
      ? [
          { key: "upper", label: <Term k="upper_bracket">Tableau principal</Term>, rounds: r.rounds.filter((x) => x.section === "upper") },
          { key: "lower", label: <Term k="lower_bracket">Repêchage</Term>, rounds: r.rounds.filter((x) => x.section === "lower") },
          { key: "final", label: <Term k="grand_final">Finale</Term>, rounds: r.rounds.filter((x) => x.section === "final") },
        ]
      : [{ key: "all", label: "Tableau", rounds: r.rounds }];
  return (
    <div className="space-y-3">
      {lanes.filter((l) => l.rounds.length).map((lane) => (
        <div key={lane.key}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{lane.label}</div>
          <ol className="flex flex-col gap-2 sm:flex-row sm:overflow-x-auto sm:pb-1">
            {lane.rounds.map((rd, i) => (
              <li key={rd.key} className="flex items-stretch gap-2 sm:min-w-56">
                <div className="flex-1 rounded-md border border-line bg-surface-2 p-2.5">
                  <div className="font-medium">{rd.name}</div>
                  <dl className="mt-1.5 space-y-1 text-xs">
                    <div className="flex gap-1.5"><dt className="w-14 shrink-0 text-muted">Victoire</dt><dd><OutcomeTag o={rd.on_win} small /></dd></div>
                    <div className="flex gap-1.5"><dt className="w-14 shrink-0 text-muted">Défaite</dt><dd><OutcomeTag o={rd.on_loss} small /></dd></div>
                  </dl>
                </div>
                {i < lane.rounds.length - 1 && <Icon name="arrowRight" className="hidden size-4 shrink-0 self-center text-muted sm:block" />}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function PhaseViz({ r }: { r: PhaseRules }) {
  if (r.type === "round_robin") return <RoundRobinViz r={r} />;
  if (r.type === "swiss") return <SwissViz r={r} />;
  return <BracketFlow r={r} />;
}
