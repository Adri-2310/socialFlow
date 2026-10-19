import type { Metadata } from 'next';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { LinkedAccounts } from '@/components/auth/linked-accounts';
import { AccountSettings } from '@/components/auth/account-settings';
import { DeleteAccount } from '@/components/auth/delete-account';
import { InviteGestionnaire } from '@/components/dashboard/invite-gestionnaire';
import { AppHeader } from '@/components/layout/app-header';
import { requireSession } from '@/lib/require-session';
import { roleDisplayLabel } from '@/lib/role-labels';
import { prisma } from '@/lib/prisma';
import { isSubscriptionBlockingDeletion } from '@/lib/account-deletion-guard';
import { getCabinetClientBrand } from '@/lib/cabinet-client-brand';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

const BILLING_LABELS: Record<string, string> = {
  monthly: 'Mensuelle',
  yearly: 'Annuelle',
};

const DEFAULT_METADATA: Metadata = {
  title: 'Mon profil — SocialFlow',
  description: 'Gérez vos informations et paramètres de compte.',
};

// D33, D76 : l'onglet d'un compte de cabinet client porte le nom de son cabinet.
export async function generateMetadata(): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  const brand = session ? await getCabinetClientBrand(session.user) : null;
  return brand ? brand.metadata('Mon profil') : DEFAULT_METADATA;
}

// Page commune a tous les roles (pas de requireSession({role}) : accessible
// a n'importe quel utilisateur connecte, y compris SuperAdmin).
export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ '2fa'?: string }>;
}) {
  const { '2fa': twoFactorParam } = await searchParams;
  const { user } = await requireSession();
  const brand = await getCabinetClientBrand(user);

  // D55 : la formule et la periode appartiennent au cabinet, pas a la personne.
  const cabinet = user.cabinetId
    ? await prisma.cabinet.findUnique({ where: { id: user.cabinetId } })
    : null;
  const plan = cabinet?.planId
    ? await prisma.pricingPlan.findUnique({ where: { planId: cabinet.planId } })
    : null;

  const memberSince = new Intl.DateTimeFormat('fr-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(user.createdAt));

  return (
    <>
      {brand?.theme && <style dangerouslySetInnerHTML={{ __html: brand.theme }} />}
      <AppHeader
        userName={user.name}
        roleLabel={roleDisplayLabel(user.role)}
        brand={brand && { name: brand.brandName, logoUrl: brand.logoUrl, logoutHref: brand.logoutHref }}
      />
      <main>
        <section className="mx-auto max-w-2xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur-xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mon profil</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {brand
                ? `Vos informations et paramètres de compte ${brand.brandName}.`
                : 'Vos informations et paramètres de compte SocialFlow.'}
            </p>

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between border-b border-border/60 pb-3">
                <dt className="text-muted-foreground">Nom</dt>
                <dd className="font-medium text-foreground">{user.name}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium text-foreground">{user.email}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-3">
                <dt className="text-muted-foreground">Rôle</dt>
                <dd className="font-medium text-foreground">{roleDisplayLabel(user.role)}</dd>
              </div>
              {cabinet && (
                <div className="flex justify-between border-b border-border/60 pb-3">
                  <dt className="text-muted-foreground">Cabinet</dt>
                  <dd className="font-medium text-foreground">{cabinet.name}</dd>
                </div>
              )}
              <div className="flex justify-between border-b border-border/60 pb-3">
                <dt className="text-muted-foreground">Email vérifié</dt>
                <dd className="font-medium text-foreground">
                  {user.emailVerified ? 'Oui' : 'Non'}
                </dd>
              </div>
              {/* D55 : formule et facturation sont l'affaire du cabinet, pas de ses clients. */}
              {!brand && (
                <>
                  <div className="flex justify-between border-b border-border/60 pb-3">
                    <dt className="text-muted-foreground">Formule</dt>
                    <dd className="font-medium text-foreground">{plan?.name ?? 'Aucune'}</dd>
                  </div>
                  <div className="flex justify-between border-b border-border/60 pb-3">
                    <dt className="text-muted-foreground">Facturation</dt>
                    <dd className="font-medium text-foreground">
                      {cabinet?.billingPeriod
                        ? (BILLING_LABELS[cabinet.billingPeriod] ?? cabinet.billingPeriod)
                        : '—'}
                    </dd>
                  </div>
                </>
              )}
              <div className="flex justify-between pb-3">
                <dt className="text-muted-foreground">Membre depuis</dt>
                <dd className="font-medium text-foreground">{memberSince}</dd>
              </div>
            </dl>

            <div className="mt-6 space-y-4">
              <AccountSettings
                name={user.name}
                email={user.email}
                emailVerified={user.emailVerified ?? false}
              />
              <LinkedAccounts />
              {/* D20 : redirection depuis la console SuperAdmin (voir requireSession). */}
              {twoFactorParam === 'requise' && user.role === 'SUPER_ADMIN' && !user.twoFactorEnabled && (
                <p role="alert" className="rounded-lg border border-border/60 bg-muted/50 p-4 text-sm text-foreground">
                  La double authentification est obligatoire pour accéder à la console d’administration.
                  Activez-la ci-dessous pour continuer.
                </p>
              )}
              <TwoFactorSetup enabled={user.twoFactorEnabled ?? false} />
              {user.role === 'CABINET_RH' && <InviteGestionnaire />}
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <DeleteAccount
                blockedBySubscription={
                  user.role === 'CABINET_RH' && isSubscriptionBlockingDeletion(cabinet?.billingStatus)
                }
              />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
