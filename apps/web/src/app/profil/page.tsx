import type { Metadata } from 'next';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { LinkedAccounts } from '@/components/auth/linked-accounts';
import { AccountSettings } from '@/components/auth/account-settings';
import { DeleteAccount } from '@/components/auth/delete-account';
import { InviteGestionnaire } from '@/components/dashboard/invite-gestionnaire';
import { AppHeader } from '@/components/layout/app-header';
import { requireSession } from '@/lib/require-session';
import { prisma } from '@/lib/prisma';

const BILLING_LABELS: Record<string, string> = {
  monthly: 'Mensuelle',
  yearly: 'Annuelle',
};

export const metadata: Metadata = {
  title: 'Mon profil — SocialFlow',
  description: 'Gérez vos informations et paramètres de compte.',
};

// Page commune a tous les roles (pas de requireSession({role}) : accessible
// a n'importe quel utilisateur connecte, y compris SuperAdmin).
export default async function ProfilPage() {
  const { user } = await requireSession();

  const [plan, cabinet] = await Promise.all([
    user.plan ? prisma.pricingPlan.findUnique({ where: { planId: user.plan } }) : null,
    user.cabinetId ? prisma.cabinet.findUnique({ where: { id: user.cabinetId } }) : null,
  ]);

  const memberSince = new Intl.DateTimeFormat('fr-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(user.createdAt));

  return (
    <>
      <AppHeader userName={user.name} roleLabel={user.role ?? ''} />
      <main>
        <section className="mx-auto max-w-2xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur-xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Mon profil</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Vos informations et paramètres de compte SocialFlow.
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
                <dd className="font-medium text-foreground">{user.role}</dd>
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
              <div className="flex justify-between border-b border-border/60 pb-3">
                <dt className="text-muted-foreground">Formule</dt>
                <dd className="font-medium text-foreground">{plan?.name ?? 'Aucune'}</dd>
              </div>
              <div className="flex justify-between border-b border-border/60 pb-3">
                <dt className="text-muted-foreground">Facturation</dt>
                <dd className="font-medium text-foreground">
                  {user.billingPeriod
                    ? (BILLING_LABELS[user.billingPeriod] ?? user.billingPeriod)
                    : '—'}
                </dd>
              </div>
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
              <TwoFactorSetup enabled={user.twoFactorEnabled ?? false} />
              {user.role === 'CABINET_RH' && <InviteGestionnaire />}
            </div>

            <div className="mt-8 border-t border-border/60 pt-6">
              <DeleteAccount />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
