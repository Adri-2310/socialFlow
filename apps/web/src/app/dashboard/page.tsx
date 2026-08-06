import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/app-header';
import { requireSession } from '@/lib/require-session';

export const metadata: Metadata = {
  title: 'Tableau de bord — SocialFlow',
  description: 'Espace connecté SocialFlow.',
};

export default async function DashboardPage() {
  const { user } = await requireSession();

  // Chaque role a vocation a avoir son propre tableau de bord sous
  // /dashboard/<role> (voir doc/analysis/ARCHITECTURE_SOCIALFLOW_RBAC.md
  // section 7) ; seul SuperAdmin en a un pour l'instant (/dashboard/admin,
  // voir components/admin/admin-shell.tsx). Les autres roles atterrissent
  // ici en attendant leur propre passe - le contenu compte/securite commun
  // a tous les roles vit desormais sur /profil (voir components/layout).
  if (user.role === 'SUPER_ADMIN') {
    redirect('/dashboard/admin');
  }

  return (
    <>
      <AppHeader userName={user.name} roleLabel={user.role ?? ''} />
      <main>
        <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Bienvenue, {user.name} 👋
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Le tableau de bord de votre rôle arrive bientôt. En attendant, retrouvez vos
            informations sur{' '}
            <Link href="/profil" className="font-semibold text-primary hover:underline">
              votre profil
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
