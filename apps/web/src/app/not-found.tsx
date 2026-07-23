import type { Metadata } from 'next';
import { Compass, Home, MessageCircle } from 'lucide-react';
import { ErrorState } from '@/components/errors/error-state';

export const metadata: Metadata = {
  title: 'Page introuvable — SocialFlow',
  description: "La page que vous recherchez n'existe pas ou a été déplacée.",
};

export default function NotFound() {
  return (
    <ErrorState
      icon={<Compass className="h-8 w-8" />}
      code="404"
      eyebrow="Erreur 404"
      title="Cette page n'existe pas"
      description="Elle a peut-être été déplacée, renommée, ou l'adresse comporte une erreur de frappe."
      actions={[
        { label: "Retour à l'accueil", href: '/', icon: <Home className="h-4 w-4" /> },
        {
          label: 'Contacter le support',
          href: '/contact',
          icon: <MessageCircle className="h-4 w-4" />,
        },
      ]}
    />
  );
}
