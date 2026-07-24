import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { AuthBrandPanel } from '@/components/auth/auth-brand-panel';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — SocialFlow',
  description: 'Réinitialisez votre mot de passe SocialFlow.',
};

export default function ForgotPasswordPage() {
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
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Connexion
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-8 w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Mot de passe oublié ?
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Indiquez votre adresse email, nous vous enverrons un lien pour le réinitialiser.
          </p>

          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          © 2026 SocialFlow — Tous droits réservés.
        </p>
      </main>
    </div>
  );
}
