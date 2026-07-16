import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { About } from '@/components/landing/about';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'À propos — SocialFlow',
  description:
    'La mission de SocialFlow : simplifier la gestion de la paie belge pour les secrétariats sociaux, cabinets RH, entreprises et salariés.',
};

export default function AProposPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="À propos"
        title="Simplifier la paie belge, pour de vrai"
        description="Née de la complexité administrative belge, SocialFlow réunit tous les acteurs de la paie sur une seule plateforme conforme et simple à utiliser."
      />
      <About />
      <Footer />
    </>
  );
}
