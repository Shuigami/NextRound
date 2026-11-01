"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Match } from "@/lib/api";
import type { Column } from "@/lib/bracket";
import { feedLabel, fmtDay, fmtTime } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { Icon, StateGlyph } from "./Icon";
import { TeamLogo } from "./ui";

type Link_ = { from: number; to: number; decided: boolean; followed: boolean };
type Path = { d: string; decided: boolean; followed: boolean };

function MiniMatch({ m }: { m: Match }) {
  const { hideScore, isTeamFollowed } = usePrefs();
  const hidden = hideScore(m);
  const row = (t: Match["team1"], s: number | null, slot: number) => {
    const won = !hidden && m.status === "finished" && t && m.winner_id === t.id;
    // Place encore vide : on dit d'où viendra l'équipe (« Vainqueur de … » / « Perdant de … »).
    const placeholder = feedLabel(m.previous[slot]);
    return (
      <div className={`flex items-center gap-1.5 ${isTeamFollowed(t) ? "text-warn" : ""}`}>
        <TeamLogo name={t?.name ?? "?"} src={t?.logo_url ?? null} size={16} />
        <span className={`flex-1 truncate ${won ? "font-semibold" : ""} ${!t ? "text-xs italic text-faint" : ""}`} title={t ? undefined : placeholder}>
          {t?.name ?? placeholder}
        </span>
        {won && <span className="sr-only">vainqueur</span>}
        <span className="tabular font-mono">{hidden ? "–" : s ?? ""}</span>
      </div>
    );
  };
  return (
    <Link
      href={`/matchs/${m.id}`}
      data-match-id={m.id}
      className={`relative z-10 block rounded-md border p-2 text-sm hover:border-brand/50 ${m.status === "running" ? "border-live/50 bg-live/[0.08]" : "border-line bg-surface-2"}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
        {m.status === "running" ? (
          <span className="inline-flex items-center gap-1 font-semibold text-live">
            <StateGlyph icon="live" /> En direct
          </span>
        ) : (
          <>
            {fmtDay(m.scheduled_at)} · {fmtTime(m.scheduled_at)}
          </>
        )}
      </div>
      {row(m.team1, m.score1, 0)}
      {row(m.team2, m.score2, 1)}
    </Link>
  );
}

/**
 * Tableau avec traits de liaison « vainqueur → match suivant ».
 * Double élimination : tableau principal en haut, repêchage en bas, finale à droite sur les deux lignes.
 * Les descentes « perdant → repêchage » ne sont pas tracées (elles croiseraient tout) : la place vide l'indique en texte.
 */
export function BracketTree({ matches, columns }: { matches: Match[]; columns: Column[] }) {
  const { hideScore, isTeamFollowed } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Path[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [overflow, setOverflow] = useState(false);
  const byId = new Map(matches.map((m) => [m.id, m]));

  const double = columns.some((c) => c.section === "lower");
  const upper = columns.filter((c) => c.section === "upper" || c.section === null);
  const lower = columns.filter((c) => c.section === "lower");
  const finals = columns.filter((c) => c.section === "final");
  const firstFinalCol = Math.max(upper.length, lower.length) + 1;
  const cells = [
    ...upper.map((r, i) => ({ r, col: i + 1, row: "1" })),
    ...lower.map((r, i) => ({ r, col: i + 1, row: "2" })),
    ...finals.map((r, i) => ({ r, col: firstFinalCol + i, row: lower.length ? "1 / span 2" : "1" })),
  ];
  const cols = Math.max(...cells.map((c) => c.col));
  // Colonne en cours : la première qui contient encore un match non terminé.
  const done = (id: number) => ["finished", "canceled"].includes(byId.get(id)?.status ?? "finished");
  const currentCol = Math.min(...cells.filter((c) => c.r.matches.some((id) => !done(id))).map((c) => c.col));

  // Liens « vainqueur » : trait plein si le résultat est connu (et visible), pointillé sinon.
  const links: Link_[] = matches.flatMap((m) =>
    m.previous
      .filter((p) => p.type === "winner" && byId.has(p.match_id))
      .map((p) => {
        const src = byId.get(p.match_id)!;
        const decided = src.status === "finished" && src.winner_id !== null && !hideScore(src);
        const winner = decided ? (src.team1?.id === src.winner_id ? src.team1 : src.team2) : null;
        return { from: src.id, to: m.id, decided, followed: decided && isTeamFollowed(winner) };
      }),
  );
  const linkKey = JSON.stringify(links);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const rect = (id: number) => el.querySelector(`[data-match-id="${id}"]`)?.getBoundingClientRect();
      const next: Path[] = [];
      for (const l of JSON.parse(linkKey) as Link_[]) {
        const a = rect(l.from);
        const b = rect(l.to);
        if (!a || !b) continue;
        const x1 = a.right - base.left;
        const y1 = a.top + a.height / 2 - base.top;
        const x2 = b.left - base.left;
        const y2 = b.top + b.height / 2 - base.top;
        if (x2 <= x1) continue;
        // Coude juste avant la cible : le trait horizontal reste à hauteur de la source et traverse les colonnes vides.
        const mx = x2 - Math.min(24, (x2 - x1) / 2);
        next.push({ d: `M${x1},${y1} H${mx} V${y2} H${x2}`, decided: l.decided, followed: l.followed });
      }
      setPaths(next);
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
      setOverflow(el.scrollWidth > (el.parentElement?.clientWidth ?? Infinity) + 1);
    };
    const ro = new ResizeObserver(measure); // appelé aussi immédiatement à l'observation
    ro.observe(el);
    return () => ro.disconnect();
  }, [linkKey]);

  // Colonne en cours calée à gauche ; le navigateur borne scrollLeft, donc une fin de tableau courte reste collée à droite.
  useEffect(() => {
    const cell = box.current?.querySelector<HTMLElement>(`[data-col="${currentCol}"]`);
    if (cell && scroller.current) scroller.current.scrollLeft = cell.offsetLeft;
  }, [currentCol]);

  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div
          ref={box}
          className="relative grid w-max gap-x-12 gap-y-6"
          style={{ gridTemplateColumns: `repeat(${cols}, 13.5rem)` }}
        >
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.h} aria-hidden="true">
            {paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill="none"
                stroke={p.followed ? "var(--warn)" : p.decided ? "var(--muted)" : "var(--line)"}
                strokeWidth={p.decided ? 1.75 : 1.25}
                strokeDasharray={p.decided ? undefined : "4 4"}
              />
            ))}
          </svg>
          {cells.map(({ r, col, row }) => {
            const ms = r.matches.map((id) => byId.get(id)!).filter(Boolean);
            return (
              <div key={r.key} data-col={col} className="flex flex-col" style={{ gridColumn: col, gridRow: row }}>
                <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted">
                  {r.section === "lower" && <Icon name="arrowDownRight" className="size-3.5" />}
                  {r.section === "final" && <Icon name="trophy" className="size-3.5" />}
                  {r.name}
                </div>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {ms.length ? ms.map((m) => <MiniMatch key={m.id} m={m} />) : <p className="text-xs text-faint">Aucun match enregistré.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {overflow && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          Faites défiler le tableau horizontalement pour voir tous les tours.
        </p>
      )}
      {double && (
        <p className="mt-2 text-xs text-muted">
          Traits : parcours des vainqueurs (plein = résultat connu, pointillé = à jouer). Les perdants du tableau principal
          descendent dans le repêchage, indiqué sur la place concernée.
        </p>
      )}
    </div>
  );
}
