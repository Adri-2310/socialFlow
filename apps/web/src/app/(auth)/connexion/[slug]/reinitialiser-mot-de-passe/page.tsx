import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PortalAuthLayout } from '@/components/auth/portal-auth-layout';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { getPortalCabinet } from '@/lib/cabinet-portal';
import { manifestPath } from '@/lib/portal-pwa';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) return {};

  return {
    title: `Nouveau mot de passe — ${cabinet.brandName}`,
    applicationName: cabinet.brandName,
    manifest: manifestPath(slug),
    robots: { index: false, follow: false },
    ...(cabinet.logoUrl ? { icons: { icon: cabinet.logoUrl, shortcut: cabinet.logoUrl } } : {}),
  };
}

// Nouveau mot de passe, depuis le portail d'un cabinet (D76, D77) : le lien de l'email y
// revient. Le jeton reste dans l'adresse (?token=), lu par le formulaire.
export default async function PortalResetPasswordPage({ params }: { params: Params }) {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) notFound();

  return (
    <PortalAuthLayout
      cabinet={cabinet}
      slug={slug}
      title="Nouveau mot de passe"
      description="Choisissez un nouveau mot de passe pour votre compte."
    >
      <Suspense>
        <ResetPasswordForm portal={{ slug }} />
      </Suspense>
    </PortalAuthLayout>
  );
}
