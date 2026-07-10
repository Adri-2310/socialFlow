import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { Features } from '@/components/landing/features';
import { CTA } from '@/components/landing/cta';
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
      <Features />
      <CTA />
      <Footer />
    </>
  );
}
