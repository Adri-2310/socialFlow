'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { authClient, useSession } from '@/lib/auth-client';
import { isPlanId, type BillingPeriod } from '@/lib/plans';

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const finalized = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 1400);

    return () => clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    const plan = searchParams.get('plan');
    const billing = searchParams.get('billing');

    // Un compte cree via OAuth n'a pas encore de formule : on la finalise ici,
    // apres coup, car elle ne peut pas transiter par la redirection OAuth elle-meme.
    if (finalized.current || !session?.user || session.user.plan || !isPlanId(plan) || plan === 'enterprise') {
      return;
    }

    finalized.current = true;
    authClient.updateUser({
      plan,
      billingPeriod: (billing === 'yearly' ? 'yearly' : 'monthly') satisfies BillingPeriod,
    });
  }, [searchParams, session]);

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
