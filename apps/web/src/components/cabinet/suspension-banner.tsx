import Link from 'next/link';
import { PauseCircle } from 'lucide-react';
import { Notice } from '@/components/shared/notice';
import { buttonVariants } from '@/components/ui/button';

// Bandeau de l'espace Cabinet RH quand le SuperAdmin a suspendu le cabinet en
// lecture seule (D71). Presentation pure. Le titulaire est client de SocialFlow :
// il est invite a contacter le support. Le motif de la suspension n'est jamais
// affiche ici.
export function SuspensionBanner({ suspended }: { suspended: boolean }) {
  if (!suspended) return null;

  return (
    <Notice
      tone="danger"
      icon={<PauseCircle aria-hidden="true" className="size-5" />}
      title="Compte suspendu par SocialFlow"
      action={
        <Link href="/contact" className={buttonVariants({ size: 'sm' })}>
          Contacter le support
        </Link>
      }
    >
      Vous pouvez consulter et exporter vos données, mais plus rien ne peut être modifié. Vos
      clients gardent l’accès en lecture à leurs informations. Contactez le support pour en savoir
      plus.
    </Notice>
  );
}
