import type { EditionBrief, PhaseType } from "@/lib/api";
import { Icon } from "./Icon";

const TYPE: Record<PhaseType, string> = {
  round_robin: "poule",
  swiss: "ronde suisse",
  single_elimination: "élimination directe",
  double_elimination: "double élimination",
};

/** Le format en une ligne : « Phase de groupes · BO1 → Playoffs · BO5 ». Compréhensible avant même d'ouvrir la page. */
export function FormatStrip({ format, size = "sm" }: { format: EditionBrief["format"] | undefined; size?: "sm" | "md" }) {
  if (!format?.length) return <p className="text-xs text-muted">Format non documenté</p>;
  return (
    <ol className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${size === "md" ? "text-sm" : "text-xs"}`} aria-label="Format de la compétition">
      {format.map((p, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <Icon name="arrowRight" className="size-3.5 text-muted" />
          )}
          <span title={TYPE[p.type]}>
            {p.name}
            <span className="sr-only"> ({TYPE[p.type]})</span>
          </span>
          {p.series && <span className="rounded bg-surface-3 px-1.5 py-px font-mono text-[0.9em] font-semibold">{p.series}</span>}
        </li>
      ))}
    </ol>
  );
}
