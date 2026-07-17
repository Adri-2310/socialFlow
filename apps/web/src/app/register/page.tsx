import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = {
  title: 'Créer un compte — SocialFlow',
  description: "Créez votre compte SocialFlow et démarrez l'essai de 30 jours.",
};

export default function RegisterPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="mx-auto max-w-md px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur-xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Créer un compte</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Essai de 30 jours, sans carte bancaire.
            </p>
            <div className="mt-6">
              <RegisterForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
