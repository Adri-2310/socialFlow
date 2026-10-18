import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { buildThemeCss } from '@/lib/branding-rules';
import type { PortalCabinet } from '@/lib/cabinet-portal';
import { portalPath } from '@/lib/portal-slug';

// Mise en page des pages d'authentification du portail d'un cabinet (D76, D77) autres que la
// connexion : mot de passe oublie, nouveau mot de passe. Nom, logo et couleurs du cabinet,
// SocialFlow n'y apparait pas (hors la mention « Propulse par »). Le cabinet vient de
// l'identifiant public du portail.
export function PortalAuthLayout({
  cabinet,
  slug,
  title,
  description,
  children,
}: {
  cabinet: PortalCabinet;
  slug: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const theme = buildThemeCss(cabinet);

  return (
    <div className="flex min-h-screen">
      {/* Couleurs du cabinet : valeurs #rrggbb validees a l'enregistrement. */}
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}

      <AuthBrandPanel
        title={<>Bienvenue sur l’espace de {cabinet.brandName}.</>}
        description="Connectez-vous pour consulter vos fiches de paie, vos documents et échanger avec votre cabinet."
        brand={{ name: cabinet.brandName, primaryColor: cabinet.primaryColor, logoUrl: cabinet.logoUrl }}
      />

      <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
        <div className="flex w-full max-w-md items-center">
          <Link
            href={portalPath(slug)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Connexion
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-8 w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">Propulsé par SocialFlow</p>
      </main>
    </div>
  );
}
