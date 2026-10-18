import Link from 'next/link';
import { PauseCircle } from 'lucide-react';

// Bandeau de l'espace Cabinet RH quand le SuperAdmin a suspendu le cabinet en
// lecture seule (D71). Presentation pure. Le titulaire est client de SocialFlow :
// il est invite a contacter le support. Le motif de la suspension n'est jamais
// affiche ici.
export function SuspensionBanner({ suspended }: { suspended: boolean }) {
  if (!suspended) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive-text"
    >
      <span className="mt-0.5 shrink-0">
        <PauseCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Compte suspendu par SocialFlow</p>
        <p className="text-sm text-foreground/80">
          Vous pouvez consulter et exporter vos données, mais plus rien ne peut être modifié. Vos
          clients gardent l’accès en lecture à leurs informations. Contactez le support pour en
          savoir plus.
        </p>
        <Link
          href="/contact"
          className="mt-2 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          Contacter le support
        </Link>
      </div>
    </div>
  );
}
