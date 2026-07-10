import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { Pricing } from '@/components/landing/pricing';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Tarifs — SocialFlow',
  description:
    'Un prix simple, par cabinet. Découvrez les offres Starter, Pro et Enterprise de SocialFlow, sans engagement et sans carte bancaire pour l\'essai.',
};

export default function TarifsPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="Tarifs"
        title="Un prix simple, par cabinet"
        description="Sans engagement, sans carte bancaire pour l'essai. Choisissez la formule adaptée à la taille de votre cabinet."
      />
      <Pricing />
      <Footer />
    </>
  );
}
