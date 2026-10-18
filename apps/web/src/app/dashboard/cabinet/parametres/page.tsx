import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BrandingForm } from '@/components/cabinet/branding-form';
import { ExportCard } from '@/components/cabinet/export-card';
import { PortalForm } from '@/components/cabinet/portal-form';
import { ensureCabinetSlug } from '@/lib/cabinet-portal';
import { EmailTemplateEditor } from '@/components/cabinet/email-template-editor';
import { IdentityForm } from '@/components/cabinet/identity-form';
import { LogoForm } from '@/components/cabinet/logo-form';
import { SettingsTabs, type SettingsTab } from '@/components/cabinet/settings-tabs';
import { isCabinetReadOnly } from '@/lib/cabinet-suspension';
import { requirePaidCabinet } from '@/lib/cabinet-access';
import { getCabinetBranding } from '@/lib/cabinet-branding';
import { getCabinetEmailBrand } from '@/lib/cabinet-email-brand';
import { formatFrom } from '@/lib/email-brand';
import { listEmailTemplates } from '@/lib/cabinet-email-templates';
import { getCabinetIdentity } from '@/lib/cabinet-identity';
import { countryOptions } from '@/lib/countries';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/require-session';

export const metadata: Metadata = {
  title: 'Paramètres',
  description: 'Identité de votre cabinet.',
};

const TAB_IDS = ['cabinet', 'apparence', 'emails', 'donnees'] as const;

export default async function CabinetSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { user } = await requireSession({ role: 'CABINET_RH' });
  // Le cabinetId vient de la session, jamais de l'URL (isolation
  // multi-tenant, FONCTIONNEMENT.md § 4).
  if (!user.cabinetId) redirect('/dashboard');
  await requirePaidCabinet(user.cabinetId);

  // L'onglet est une simple preference d'affichage (?onglet=) : une valeur
  // inconnue retombe sur le premier onglet.
  const { onglet } = await searchParams;
  const initialTab = (TAB_IDS as readonly string[]).includes(onglet ?? '') ? (onglet as string) : 'cabinet';

  const [identity, branding, templates, emailBrand, cabinet, portalSlug] = await Promise.all([
    getCabinetIdentity(user.cabinetId),
    getCabinetBranding(user.cabinetId),
    listEmailTemplates(user.cabinetId),
    getCabinetEmailBrand(user.cabinetId),
    prisma.cabinet.findUnique({
      where: { id: user.cabinetId },
      select: { billingStatus: true, status: true, suspensionType: true, logoUrl: true },
    }),
    // D76 : cree a la premiere visite pour un cabinet qui n'en a pas encore.
    ensureCabinetSlug(user.cabinetId),
  ]);
  const readOnly = cabinet ? isCabinetReadOnly(cabinet) : false;

  const tabs: SettingsTab[] = [
    {
      id: 'cabinet',
      label: 'Cabinet',
      content: <IdentityForm identity={identity} countries={countryOptions()} readOnly={readOnly} />,
    },
    {
      id: 'apparence',
      label: 'Apparence',
      content: (
        <>
          <LogoForm logoUrl={cabinet?.logoUrl ?? null} cabinetName={identity.name} readOnly={readOnly} />
          <BrandingForm branding={branding} cabinetName={identity.name} readOnly={readOnly} />
          <PortalForm
            slug={portalSlug}
            baseUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
            readOnly={readOnly}
          />
        </>
      ),
    },
    {
      id: 'emails',
      label: 'Emails',
      content: (
        <>
          <p className="text-sm text-muted-foreground">
            Le sujet et le message des emails envoyés à votre équipe. Les emails de sécurité
            (connexion, mot de passe…) prennent vos couleurs, mais leur texte n’est pas modifiable.
          </p>
          {templates.map((template) => (
            <EmailTemplateEditor
              key={template.type}
              type={template.type}
              initial={{ subject: template.subject, body: template.body, custom: template.custom }}
              brand={emailBrand}
              fromLabel={formatFrom(
                emailBrand.name,
                process.env.RESEND_FROM_EMAIL ?? 'SocialFlow <noreply@socialflow.page>',
              )}
              readOnly={readOnly}
            />
          ))}
        </>
      ),
    },
    {
      id: 'donnees',
      label: 'Données',
      // Disponible en lecture seule : on peut toujours emporter ses données (D28).
      content: <ExportCard readOnly={readOnly} />,
    },
  ];

  return (
    <>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Paramètres</h2>
        <p className="text-sm text-muted-foreground">
          L’identité, l’apparence et les emails de votre cabinet, tels que les voient vos clients, et l’export de vos données.
        </p>
      </div>
      <SettingsTabs tabs={tabs} initialTab={initialTab} />
    </>
  );
}
