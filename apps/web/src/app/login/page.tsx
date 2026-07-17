import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { Footer } from '@/components/landing/footer';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Connexion — SocialFlow',
  description: 'Connectez-vous à votre espace SocialFlow.',
};

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="mx-auto max-w-md px-4 py-20 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-xl backdrop-blur-xl">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Connexion</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Accédez à votre espace SocialFlow.
            </p>
            <div className="mt-6">
              <LoginForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
