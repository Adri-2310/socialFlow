import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { AcceptInvitationForm } from '@/components/invitations/accept-invitation-form';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Accepter une invitation — SocialFlow',
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token ? await prisma.invitation.findUnique({ where: { token } }) : null;
  const valid = !!invitation && invitation.status === 'pending' && invitation.expiresAt > new Date();
  const cabinet = valid ? await prisma.cabinet.findUnique({ where: { id: invitation!.cabinetId } }) : null;

  return (
    <div className="flex min-h-screen">
      <AuthBrandPanel
        title={
          <>
            Rejoignez votre
            <br />
            cabinet sur SocialFlow.
          </>
        }
        description="Créez votre compte pour accéder aux dossiers qui vous sont assignés."
        quote="« Nous avons divisé par deux le temps de traitement de nos paies. » — Payroll BXL"
      />

      <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-md">
          {valid && invitation && cabinet ? (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Rejoindre {cabinet.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Créez votre compte Gestionnaire RH pour {cabinet.name}.
              </p>
              <div className="mt-6">
                <AcceptInvitationForm token={invitation.token} email={invitation.email} />
              </div>
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
