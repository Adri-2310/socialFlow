import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { Features } from '@/components/landing/features';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Fonctionnalités — SocialFlow',
  description:
    'Découvrez toutes les fonctionnalités de SocialFlow : fiches de paie automatisées, calendrier ONSS, déclarations DIMONA, portails dédiés et sécurité RGPD.',
};

export default function FonctionnalitesPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="Fonctionnalités"
        title="Tout le cycle de paie, sans friction"
        description="De la fiche de paie à la déclaration DIMONA, chaque étape est automatisée et conforme à la législation sociale belge."
      />
      <Features />
      <Footer />
    </>
  );
}
