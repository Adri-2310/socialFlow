import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';
import { AcceptOAuthButtons } from '@/components/invitations/accept-oauth-buttons';
import { FinalizeOAuthInvitation } from '@/components/invitations/finalize-oauth-invitation';
import { buildThemeCss } from '@/lib/branding-rules';
import { getInvitationPreview } from '@/lib/invitation-preview';

type SearchParams = Promise<{ token?: string }>;

// Onglet au nom du cabinet qui invite (D33) : seulement pour un jeton valide.
// Un jeton inconnu, expire ou deja utilise garde le titre par defaut, sans rien
// reveler d'un cabinet.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { token } = await searchParams;
  const preview = await getInvitationPreview(token);
  if (!preview) return { title: 'Accepter une invitation — SocialFlow' };

  return {
    title: preview.entrepriseName
      ? `Espace de ${preview.entrepriseName}`
      : `Rejoindre ${preview.brandName}`,
    applicationName: preview.brandName,
    robots: { index: false, follow: false },
    ...(preview.logoUrl ? { icons: { icon: preview.logoUrl, shortcut: preview.logoUrl } } : {}),
  };
}

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token } = await searchParams;
  const preview = await getInvitationPreview(token);
  const theme = preview ? buildThemeCss(preview) : null;

  // C4 : retour d'une connexion Google/Microsoft. Si l'adresse verifiee du
  // compte est celle de l'invitation et que le compte est tout neuf (aucun
  // cabinet), on le rattache ; le serveur revalide tout. Sinon la page normale
  // reste affichee.
  const session = preview ? await auth.api.getSession({ headers: await headers() }) : null;
  const oauthReady =
    !!preview &&
    !!session &&
    session.user.emailVerified &&
    session.user.email.toLowerCase() === preview.email.toLowerCase() &&
    !session.user.cabinetId &&
    (!session.user.role || session.user.role === 'CABINET_RH');

  return (
    <div className="flex min-h-screen">
      {/* Couleurs du cabinet (D33) : valeurs #rrggbb validees a l'enregistrement,
          jamais du texte libre. */}
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}

      <AuthBrandPanel
        title={
          preview?.entrepriseName ? (
            <>
              L&apos;espace de {preview.entrepriseName}, avec {preview.brandName}.
            </>
          ) : preview ? (
            <>Rejoignez l&apos;équipe de {preview.brandName}.</>
          ) : (
            <>
              Rejoignez votre
              <br />
              cabinet sur SocialFlow.
            </>
          )
        }
        description={
          preview?.entrepriseName
            ? 'Créez votre compte administrateur pour suivre vos salariés et valider vos fiches de paie.'
            : 'Créez votre compte pour accéder aux dossiers qui vous sont assignés.'
        }
        quote="« Nous avons divisé par deux le temps de traitement de nos paies. » — Payroll BXL"
        brand={
          preview
            ? {
                name: preview.brandName,
                primaryColor: preview.primaryColor,
                logoUrl: preview.logoUrl,
              }
            : undefined
        }
      />

      <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-md">
          {preview && token ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {preview.entrepriseName
                  ? `Espace de ${preview.entrepriseName}`
                  : `Rejoindre ${preview.brandName}`}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {preview.entrepriseName
                  ? `Créez le compte administrateur de ${preview.entrepriseName}, client de ${preview.brandName}.`
                  : `Créez votre compte gestionnaire RH pour ${preview.brandName}.`}
              </p>
              <div className="mt-6 space-y-5">
                {oauthReady ? (
                  <FinalizeOAuthInvitation token={token} email={preview.email} />
                ) : (
                  <>
                    <AcceptOAuthButtons token={token} />
                    <AcceptInvitationForm token={token} email={preview.email} />
                  </>
                )}
              </div>
              <p className="mt-8 text-center text-xs text-muted-foreground">
                Propulsé par SocialFlow
              </p>
            </>
          ) : (
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Invitation invalide ou expirée
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ce lien d&apos;invitation n&apos;est plus valable. Contactez la personne qui vous a
                invité pour en recevoir un nouveau.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block font-semibold text-primary hover:underline"
              >
                Retour à la connexion
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
