'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/lib/auth-client';

export default function WelcomePage() {
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 1400);

    return () => clearTimeout(timer);
  }, [router]);

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
