import Image from 'next/image';
import Link from 'next/link';
import { Clock, Lock, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

const features = [
  { icon: ShieldCheck, label: 'Conforme ONSS, DIMONA & RGPD' },
  { icon: Lock, label: 'Authentification sécurisée & audit complet' },
  { icon: Clock, label: 'Support belge en FR & NL' },
];

export function AuthBrandPanel({
  title,
  description,
  quote,
}: {
  title: ReactNode;
  description: string;
  quote?: string;
}) {
  return (
    <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#4c1d95_0%,#6d28d9_45%,#0f766e_100%)] p-12 text-white lg:flex">
      <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

      <Link href="/" className="flex items-center gap-2">
        <Image
          src="/logo-simple.png"
          alt="SocialFlow"
          width={40}
          height={40}
          className="rounded-xl"
        />
        <span className="text-xl font-bold">SocialFlow</span>
      </Link>

      <div>
        <h2 className="text-3xl font-bold leading-tight">{title}</h2>
        <p className="mt-4 max-w-md text-white/80">{description}</p>
        <div className="mt-8 space-y-3">
          {features.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm text-white/90">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {quote && <p className="text-sm text-white/60">{quote}</p>}
    </aside>
  );
}
