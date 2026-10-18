'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { isPlanId, type BillingPeriod } from '@/lib/plans';

// Delai minimal d'affichage de l'ecran de bienvenue.
const MIN_DISPLAY_MS = 1400;

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const finalized = useRef(false);

  useEffect(() => {
    // Attend la session : sans elle on ne sait pas encore s'il faut finaliser.
    if (isPending || finalized.current) return;
    finalized.current = true;

    const plan = searchParams.get('plan');
    const billing = searchParams.get('billing');
    const startedAt = Date.now();

    (async () => {
      // Finalise l'inscription du titulaire (D55) : cree son cabinet s'il n'existe
      // pas encore (inscription Google/Microsoft) et y pose le plan choisi, une
      // seule fois. Le plan ne peut pas transiter par la redirection OAuth elle-meme.
      if (session?.user && (isPlanId(plan) || !session.user.cabinetId)) {
        await fetch('/api/register/finalize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(isPlanId(plan) ? { plan } : {}),
            billingPeriod: (billing === 'yearly' ? 'yearly' : 'monthly') satisfies BillingPeriod,
          }),
        }).catch(() => undefined);
      }
      const remaining = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt));
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, remaining);
    })();
  }, [isPending, session, searchParams, router]);

  const firstName = session?.user.name?.split(' ')[0];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Image
        src="/logo-simple.png"
        alt="SocialFlow"
        width={56}
        height={56}
        className="rounded-2xl"
      />

      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          {firstName ? `Bienvenue, ${firstName} !` : 'Bienvenue sur SocialFlow !'}
        </h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Préparation de votre espace…
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeContent />
    </Suspense>
  );
}
