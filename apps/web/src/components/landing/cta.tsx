import Link from 'next/link';

export function CTA() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-secondary px-8 py-14 text-center shadow-xl sm:px-16">
        <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
          Prêt à fluidifier votre paie ?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-primary-foreground/85">
          Rejoignez les cabinets belges qui gèrent leur paie sereinement. 30 jours d&apos;essai, sans
          engagement.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="rounded-xl bg-card px-6 py-3 text-sm font-semibold text-primary transition hover:bg-card/90"
          >
            Créer mon cabinet
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-primary-foreground/40 px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-card/10"
          >
            Se connecter
          </Link>
        </div>
      </div>
    </section>
  );
}
