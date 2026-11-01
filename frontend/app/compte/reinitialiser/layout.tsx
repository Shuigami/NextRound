import type { Metadata } from "next";

// Titre complet : le gabarit « %s · NextRound » ne traverse pas la mise en page parente « Compte ».
export const metadata: Metadata = { title: { absolute: "Nouveau mot de passe · NextRound" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
