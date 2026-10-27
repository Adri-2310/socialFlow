import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';
import { buttonVariants } from '@/components/ui/button';
import { buildThemeCss } from '@/lib/branding/branding-rules';
import { getInvitationPreview, type InvitationPreview } from '@/lib/invitations/invitation-preview';

type SearchParams = Promise<{ token?: string }>;

// Les textes de la page selon la personne invitée : un gestionnaire rejoint l'équipe du cabinet,
// l'administrateur d'une entreprise son espace, un salarié (roles/03 § 4.3) son espace personnel.
function textes(preview: InvitationPreview) {
  if (preview.espace === 'SALARIE') {
    return {
      onglet: `Votre espace salarié — ${preview.brandName}`,
      panneau: <>Votre espace salarié, avec {preview.brandName}.</>,
      description:
        'Créez votre compte pour consulter vos fiches de paie et vos documents, en toute sécurité.',
      titre: 'Votre espace salarié',
      sousTitre: `Créez votre compte pour accéder à vos fiches de paie${
        preview.salarieEntrepriseName ? ` chez ${preview.salarieEntrepriseName}` : ''
      }, avec ${preview.brandName}.`,
    };
  }
  if (preview.espace === 'ENTREPRISE' && preview.entrepriseName) {
    return {
      onglet: `Espace de ${preview.entrepriseName}`,
      panneau: (
        <>
          L&apos;espace de {preview.entrepriseName}, avec {preview.brandName}.
        </>
      ),
      description:
        'Créez votre compte administrateur pour suivre vos salariés et valider vos fiches de paie.',
      titre: `Espace de ${preview.entrepriseName}`,
      sousTitre: `Créez le compte administrateur de ${preview.entrepriseName}, client de ${preview.brandName}.`,
    };
  }
  return {
    onglet: `Rejoindre ${preview.brandName}`,
    panneau: <>Rejoignez l&apos;équipe de {preview.brandName}.</>,
    description: 'Créez votre compte pour accéder aux dossiers qui vous sont assignés.',
    titre: `Rejoindre ${preview.brandName}`,
    sousTitre: `Créez votre compte gestionnaire RH pour ${preview.brandName}.`,
  };
}

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
    title: textes(preview).onglet,
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
  const contenu = preview ? textes(preview) : null;

  return (
    <div className="flex min-h-screen">
      {/* Couleurs du cabinet (D33) : valeurs #rrggbb validees a l'enregistrement,
          jamais du texte libre. */}
      {theme && <style dangerouslySetInnerHTML={{ __html: theme }} />}

      <AuthBrandPanel
        title={
          contenu ? (
            contenu.panneau
          ) : (
            <>
              Rejoignez votre
              <br />
              cabinet sur SocialFlow.
            </>
          )
        }
        description={
          contenu?.description ??
          'Créez votre compte pour accéder aux dossiers qui vous sont assignés.'
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
          {preview && contenu && token ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{contenu.titre}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{contenu.sousTitre}</p>
              {/* D76 : un invite cree son compte par mot de passe, jamais avec Google ni
                  Microsoft ; il se connecte ensuite par le portail de son cabinet. */}
              <div className="mt-6">
                <AcceptInvitationForm token={token} email={preview.email} />
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
              <Link href="/login" className={buttonVariants({ variant: 'link', className: 'mt-6' })}>
                Retour à la connexion
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
