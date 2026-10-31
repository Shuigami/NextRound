import type { Metadata } from "next";
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { PrefsProvider } from "@/lib/prefs";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-app", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display-app", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-app", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "NextRound", template: "%s · NextRound" },
  description: "Suivi esport personnel : LoL, Valorant, Rocket League, Overwatch. Comprendre chaque compétition et ce que chaque match change.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">
        <PrefsProvider>
          <AppShell>{children}</AppShell>
        </PrefsProvider>
      </body>
    </html>
  );
}
