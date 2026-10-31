"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtRelative } from "@/lib/format";
import { usePrefs } from "@/lib/prefs";
import { Icon, type IconName } from "./Icon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Accueil", icon: "home" },
  { href: "/matchs", label: "Matchs", icon: "calendar" },
  { href: "/competitions", label: "Compétitions", icon: "trophy" },
  { href: "/equipes", label: "Équipes", icon: "users" },
  { href: "/favoris", label: "Favoris", icon: "star" },
];

function SpoilerToggle() {
  const { spoilerFree, setSpoilerFree } = usePrefs();
  return (
    <button
      type="button"
      aria-pressed={spoilerFree}
      onClick={() => setSpoilerFree(!spoilerFree)}
      title="Masque les scores, vainqueurs et classements jusqu'à ce que vous les révéliez"
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        spoilerFree ? "border-brand/60 bg-brand/15 text-text" : "border-line text-muted hover:text-text"
      }`}
    >
      <Icon name={spoilerFree ? "eyeOff" : "eye"} />
      <span>Anti-spoil {spoilerFree ? "activé" : "désactivé"}</span>
    </button>
  );
}

function Banners() {
  const { meta, metaError } = usePrefs();
  if (metaError)
    return (
      <div role="alert" className="border-b border-bad/40 bg-bad/10 px-4 py-2 text-sm">
        <span className="font-semibold">Impossible de joindre le serveur NextRound.</span> Les données ne peuvent pas se charger. Vérifiez
        que le backend tourne (port 8000), puis rechargez la page.
      </div>
    );
  if (!meta) return null;
  return (
    <>
      {meta.mode === "demo" && (
        <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-center text-xs sm:text-sm">
          <span className="font-semibold text-warn">Mode démonstration</span> : équipes et résultats <strong>fictifs</strong>
          <span className="hidden sm:inline">, pour explorer l&apos;app sans clé API</span>.
        </div>
      )}
      {meta.stale && (
        <div role="status" className="border-b border-warn/30 bg-surface px-4 py-2 text-center text-sm text-muted">
          <Icon name="clock" className="mr-1 inline size-4 align-[-3px]" />
          Données peut-être anciennes. Dernière synchronisation réussie : {fmtRelative(meta.last_sync_at)}.
          {meta.errors.length > 0 && ` ${meta.errors.length} source(s) en erreur.`}
        </div>
      )}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        Aller au contenu
      </a>
      <Banners />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-display text-lg font-bold tracking-tight">
            Next<span className="text-brand">Round</span>
          </Link>
          <nav aria-label="Navigation principale" className="hidden flex-1 md:block">
            <ul className="flex gap-1">
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active(n.href) ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm ${active(n.href) ? "bg-surface-3 text-text" : "text-muted hover:text-text"}`}
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto">
            <SpoilerToggle />
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-12">
        {children}
      </main>
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active(n.href) ? "text-brand" : "text-muted"}`}
              >
                <Icon name={n.icon} className="size-5" filled={n.icon === "star" && active(n.href)} />
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
