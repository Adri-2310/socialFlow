import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/auth/logout-button';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { auth } from '@/lib/auth';

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
              <div className="flex justify-between pb-3">
                <dt className="text-muted-foreground">Rôle</dt>
                <dd className="font-medium text-foreground">{user.role}</dd>
              </div>
            </dl>

            <div className="mt-6">
              <TwoFactorSetup enabled={user.twoFactorEnabled ?? false} />
            </div>

            <div className="mt-8">
              <LogoutButton />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
