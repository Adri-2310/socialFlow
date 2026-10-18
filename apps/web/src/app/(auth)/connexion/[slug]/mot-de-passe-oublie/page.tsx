import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { PortalAuthLayout } from '@/components/auth/portal-auth-layout';
import { getPortalCabinet } from '@/lib/cabinet-portal';
import { manifestPath } from '@/lib/portal-pwa';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) return {};

  return {
    title: `Mot de passe oublié — ${cabinet.brandName}`,
    applicationName: cabinet.brandName,
    manifest: manifestPath(slug),
    robots: { index: false, follow: false },
    ...(cabinet.logoUrl ? { icons: { icon: cabinet.logoUrl, shortcut: cabinet.logoUrl } } : {}),
  };
}

// Mot de passe oublie, depuis le portail d'un cabinet (D76, D77). Identifiant inconnu ou
// cabinet archive : page introuvable.
export default async function PortalForgotPasswordPage({ params }: { params: Params }) {
  const { slug } = await params;
  const cabinet = await getPortalCabinet(slug);
  if (!cabinet) notFound();

  return (
    <PortalAuthLayout
      cabinet={cabinet}
      slug={slug}
      title="Mot de passe oublié ?"
      description="Indiquez votre adresse email, nous vous enverrons un lien pour le réinitialiser."
    >
      <ForgotPasswordForm portal={{ slug }} />
    </PortalAuthLayout>
  );
}
