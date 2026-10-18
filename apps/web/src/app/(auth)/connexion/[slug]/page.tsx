import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { LoginForm } from '@/components/auth/login-form';
import { translateAuthError } from '@/lib/auth-errors';
import { buildThemeCss } from '@/lib/branding-rules';
import { getPortalCabinet } from '@/lib/cabinet-portal';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ error?: string }>;

// Onglet au nom du cabinet (D33, D76), jamais "SocialFlow". Un identifiant inconnu
// ou un cabinet archive ne donne rien : page introuvable.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) return {};

  return {
    title: `Connexion — ${cabinet.brandName}`,
    applicationName: cabinet.brandName,
    robots: { index: false, follow: false },
    ...(cabinet.logoUrl ? { icons: { icon: cabinet.logoUrl, shortcut: cabinet.logoUrl } } : {}),
  };
}

// Portail de connexion d'un cabinet (D76) : c'est par lui que ses gestionnaires,
// entreprises clientes et collaborateurs se connectent, aux nom, logo et couleurs
// du cabinet. Pas de lien vers l'inscription : seul le Cabinet RH cree un compte sur
// le site, les autres le font par leur invitation.
export default async function CabinetPortalPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) notFound();

  // Erreur d'un retour Google/Microsoft (code de redirection, voir auth-errors.ts).
  const { error } = await searchParams;
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
        <div className="flex w-full max-w-md items-center justify-end">
          <ThemeToggle />
        </div>

        <div className="mt-8 w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Connexion</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous à votre espace {cabinet.brandName}.
          </p>

          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {translateAuthError(error)}
            </p>
          )}

          <div className="mt-6">
            <LoginForm portal={{ slug }} />
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">Propulsé par SocialFlow</p>
      </main>
    </div>
  );
}
