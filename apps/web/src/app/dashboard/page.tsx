import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/auth/logout-button';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { LinkedAccounts } from '@/components/auth/linked-accounts';
import { AccountSettings } from '@/components/auth/account-settings';
import { DeleteAccount } from '@/components/auth/delete-account';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const BILLING_LABELS: Record<string, string> = {
  monthly: 'Mensuelle',
  yearly: 'Annuelle',
};

export const metadata: Metadata = {
  title: 'Tableau de bord — SocialFlow',
  description: 'Espace connecté SocialFlow.',
};

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  const { user } = session;

  const plan = user.plan
    ? await prisma.pricingPlan.findUnique({ where: { planId: user.plan } })
    : null;

  const memberSince = new Intl.DateTimeFormat('fr-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(user.createdAt));

  return (
    <>
      <main>
        <section className="mx-auto max-w-2xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur-xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Bienvenue, {user.name} 👋
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Vous êtes connecté à votre espace SocialFlow.
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
            </div>

            <div className="mt-8 flex items-center justify-between">
              <LogoutButton />
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
