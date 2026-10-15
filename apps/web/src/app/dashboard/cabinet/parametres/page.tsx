import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BrandingForm } from '@/components/cabinet/branding-form';
import { IdentityForm } from '@/components/cabinet/identity-form';
import { LogoForm } from '@/components/cabinet/logo-form';
import { isReadOnlyBillingStatus } from '@/lib/billing';
import { requirePaidCabinet } from '@/lib/cabinet-access';
import { getCabinetBranding } from '@/lib/cabinet-branding';
import { getCabinetIdentity } from '@/lib/cabinet-identity';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/require-session';

export const metadata: Metadata = {
  title: 'Paramètres',
  description: 'Identité de votre cabinet.',
};

export default async function CabinetSettingsPage() {
  const { user } = await requireSession({ role: 'CABINET_RH' });
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');
  await requirePaidCabinet(user.cabinetId);

  const [identity, branding, cabinet] = await Promise.all([
    getCabinetIdentity(user.cabinetId),
    getCabinetBranding(user.cabinetId),
    prisma.cabinet.findUnique({
      where: { id: user.cabinetId },
      select: { billingStatus: true, logoUrl: true },
    }),
  ]);

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Paramètres</h2>
        <p className="text-sm text-muted-foreground">
          L’identité et l’apparence de votre cabinet, telles que les voient vos clients.
        </p>
      </div>
      <IdentityForm
        identity={identity}
        countries={countryOptions()}
        readOnly={isReadOnlyBillingStatus(cabinet?.billingStatus)}
      />
      <LogoForm
        logoUrl={cabinet?.logoUrl ?? null}
        cabinetName={identity.name}
        readOnly={isReadOnlyBillingStatus(cabinet?.billingStatus)}
      />
      <BrandingForm
        branding={branding}
        cabinetName={identity.name}
        readOnly={isReadOnlyBillingStatus(cabinet?.billingStatus)}
      />
    </>
  );
}
