import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Connexion — SocialFlow',
  description: 'Connectez-vous à votre espace SocialFlow.',
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <AuthBrandPanel
        title={
          <>
            Gérez la paie de vos clients
            <br />
            en toute sérénité.
          </>
        }
        description="Fiches de paie conformes, échéances ONSS maîtrisées et déclarations DIMONA automatisées — le tout depuis un espace unique."
        quote="« Nous avons divisé par deux le temps de traitement de nos paies. » — Payroll BXL"
      />

      <main className="flex w-full flex-col items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2">
        <div className="flex w-full max-w-md items-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Accueil
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-8 w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Bon retour parmi nous
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous à votre espace SocialFlow.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">© 2026 SocialFlow — Tous droits réservés.</p>
      </main>
    </div>
  );
}
