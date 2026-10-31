import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Page introuvable</h1>
      <Link href="/" className="mt-4 inline-block text-brand underline">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
