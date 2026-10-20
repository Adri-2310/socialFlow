'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Home, LogIn } from 'lucide-react';
import { ErrorState } from '@/components/errors/error-state';
import { translateAuthError } from '@/lib/auth/auth-errors';
import { isValidSlug, portalPath } from '@/lib/portal/portal-slug';

function ErrorContent() {
  const searchParams = useSearchParams();
  const message = translateAuthError(searchParams.get('error') ?? undefined);
  // D76 : refus de /login pour un compte de cabinet client -> son portail.
  const portal = searchParams.get('portal');
  const portalHref = portal && isValidSlug(portal) ? portalPath(portal) : null;

  return (
    <ErrorState
      icon={<AlertTriangle className="h-8 w-8" />}
      eyebrow="Connexion"
      title="Un problème est survenu"
      description={message}
      tone="warning"
      actions={[
        ...(portalHref
          ? [{ label: 'Ouvrir le portail de mon cabinet', href: portalHref, icon: <LogIn className="h-4 w-4" /> }]
          : []),
        { label: 'Retour à la connexion', href: '/login', icon: <LogIn className="h-4 w-4" /> },
        { label: "Retour à l'accueil", href: '/', icon: <Home className="h-4 w-4" /> },
      ]}
      footer={
        <>
          Besoin d&apos;aide ?{' '}
          <Link href="/contact" className="font-semibold text-primary hover:underline">
            Contactez le support
          </Link>
        </>
      }
    />
  );
}

export default function ErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
