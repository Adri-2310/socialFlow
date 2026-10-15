import Image from 'next/image';
import Link from 'next/link';
import { Clock, Lock, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { darken } from '@/lib/color';

// Identite d'un cabinet (D33) : remplace celle de SocialFlow dans le panneau.
export type PanelBrand = {
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
};

const features = [
  { icon: ShieldCheck, label: 'Conforme ONSS, DIMONA & RGPD' },
  { icon: Lock, label: 'Authentification sécurisée & audit complet' },
  { icon: Clock, label: 'Support belge en FR & NL' },
];

export function AuthBrandPanel({
  title,
  description,
  quote,
  brand,
}: {
  title: ReactNode;
  description: string;
  quote?: string;
  // Page d'un cabinet (invitation) : son nom, son logo et sa couleur. Sans
  // lui, identite SocialFlow.
  brand?: PanelBrand;
}) {
  // Degrade du cabinet : sa couleur principale, assombrie sur un bord. Elle a
  // deja ete validee a 4,5:1 contre le blanc, donc le texte blanc reste lisible.
  const background = brand?.primaryColor
    ? `linear-gradient(150deg, ${darken(brand.primaryColor, 0.45)} 0%, ${brand.primaryColor} 100%)`
    : undefined;

  return (
    <aside
      style={background ? { background } : undefined}
      className={`relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex ${
        background ? '' : 'bg-[linear-gradient(150deg,#4c1d95_0%,#6d28d9_45%,#0f766e_100%)]'
      }`}
    >
      <div className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

      {brand ? (
        <div className="flex items-center gap-3">
          {brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL externe (Blob), taille fixe
            <img
              src={brand.logoUrl}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl bg-white/90 object-contain p-1"
            />
          )}
          <span className="text-xl font-bold">{brand.name}</span>
        </div>
      ) : (
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
      )}

      <div>
        <h2 className="text-3xl font-bold leading-tight">{title}</h2>
        <p className="mt-4 max-w-md text-white/80">{description}</p>
        <div className="mt-8 space-y-3">
          {(brand ? [] : features).map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm text-white/90">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {brand ? (
        <p className="text-sm text-white/70">Propulsé par SocialFlow</p>
      ) : (
        quote && <p className="text-sm text-white/60">{quote}</p>
      )}
    </aside>
  );
}
