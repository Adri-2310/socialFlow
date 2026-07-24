'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

export default function LoggedOutPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
      router.refresh();
    }, 1400);

    return () => clearTimeout(timer);
  }, [router]);

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
        <h1 className="text-xl font-bold tracking-tight text-foreground">À bientôt !</h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Déconnexion en cours…
        </div>
      </div>
    </div>
  );
}
