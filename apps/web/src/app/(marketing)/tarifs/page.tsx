import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { Pricing } from '@/components/landing/pricing';
import { Footer } from '@/components/landing/footer';
import { getPricingPlans } from '@/lib/billing/pricing';

export const metadata: Metadata = {
  title: 'Tarifs — SocialFlow',
  description:
    "Un prix simple, par cabinet. Découvrez les offres Starter, Pro et Enterprise de SocialFlow, sans engagement, avec 30 jours d'essai gratuit.",
};

// Les prix viennent de la base : rendu dynamique pour refleter un changement sans redeploiement.
export const dynamic = 'force-dynamic';

export default async function TarifsPage() {
  const plans = await getPricingPlans();

  return (
    <>
      <Navbar />
      <main>
        <PageHero
          eyebrow="Tarifs"
          title="Un prix simple, par cabinet"
          description="Sans engagement, 30 jours d'essai gratuit (carte demandée, débitée à la fin de l'essai). Choisissez la formule adaptée à la taille de votre cabinet."
        />
        <Pricing plans={plans} />
      </main>
      <Footer />
    </>
  );
}
