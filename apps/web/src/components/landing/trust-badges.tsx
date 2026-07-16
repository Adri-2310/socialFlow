import Image from 'next/image';
import { Quote } from 'lucide-react';
import { FadeIn } from '@/components/motion/fade-in';

// Entreprises fictives à des fins d'illustration (produit en pré-lancement, aucun client réel).
const companies = [
  {
    name: 'Cabinet Dubois & Associés',
    sector: 'Cabinet RH',
    quote: 'DIMONA en un clic, plus de demi-journées perdues.',
    logo: '/logos/dubois-associes.png',
  },
  {
    name: 'Vandermeer RH',
    sector: 'Secrétariat social',
    quote: 'Le calendrier ONSS est devenu notre filet de sécurité.',
    logo: '/logos/vandermeer-rh.png',
  },
  {
    name: 'SecoConseil',
    sector: 'PME & indépendants',
    quote: 'Nos clients suivent leur paie en temps réel, sans nous appeler.',
    logo: '/logos/seco-conseil.png',
  },
];

export function TrustBadges() {
  return (
    <section className="border-y border-border/60">
      <FadeIn>
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Utilisé par les secrétariats sociaux et cabinets RH partout en Belgique
          </p>
          <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
            {companies.map((company, i) => (
              <FadeIn key={company.name} delay={i * 0.08}>
                <div className="group flex h-full flex-col items-center gap-4 rounded-3xl border border-border/60 bg-gradient-to-br from-card/80 to-card/40 p-8 text-center shadow-sm backdrop-blur-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                  <div className="flex h-28 w-full items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
                    <Image
                      src={company.logo}
                      alt={company.name}
                      width={200}
                      height={110}
                      className="h-full w-auto object-contain"
                    />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {company.sector}
                  </p>
                  <div className="flex flex-1 flex-col items-center gap-2 border-t border-border/60 pt-4">
                    <Quote className="h-4 w-4 text-primary/40" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{company.quote}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
