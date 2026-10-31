"use client";

import Link from "next/link";
import type { EditionBrief, EditionStatus } from "@/lib/api";
import { fmtShort } from "@/lib/format";
import { FormatStrip } from "./FormatStrip";
import { StateGlyph, type StateIcon } from "./Icon";
import { FavButton, GameBadge } from "./ui";

export const EDITION_STATUS: Record<EditionStatus, { label: string; icon: StateIcon; cls: string }> = {
  ongoing: { label: "En cours", icon: "live", cls: "text-ok" },
  upcoming: { label: "À venir", icon: "clock", cls: "text-info" },
  finished: { label: "Terminée", icon: "check", cls: "text-muted" },
};

export function EditionCard({ e }: { e: EditionBrief }) {
  const s = EDITION_STATUS[e.status];
  return (
    <article className="relative flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-surface-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <GameBadge game={e.game} />
          <span className={`inline-flex items-center gap-1 ${s.cls}`}>
            <StateGlyph icon={s.icon} className="size-3" /> {s.label}
          </span>
        </div>
        <h3 className="mt-1 truncate font-medium">{e.name}</h3>
        <p className="text-xs text-muted">
          {fmtShort(e.begin_at)} – {fmtShort(e.end_at)}
        </p>
        <div className="mt-2">
          <FormatStrip format={e.format} />
        </div>
      </div>
      <div className="relative z-10">
        <FavButton kind="editions" id={e.id} label={e.name} compact />
      </div>
      <Link href={`/competitions/${e.id}`} className="absolute inset-0 rounded-lg" aria-label={`Voir ${e.name}`} />
    </article>
  );
}
