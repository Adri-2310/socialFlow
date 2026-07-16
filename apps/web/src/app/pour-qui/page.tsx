import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { Roles } from '@/components/landing/roles';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Pour qui ? — SocialFlow',
  description:
    "SocialFlow s'adapte à chaque rôle : Cabinet RH, Gestionnaire, Entreprise cliente et Salarié. Découvrez une plateforme, quatre expériences.",
};

export default function PourQuiPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="Pour qui ?"
        title="Une plateforme, quatre expériences"
        description="Chaque acteur de la chaîne de paie dispose d'un espace pensé pour son rôle, du cabinet RH au suivi de sa propre fiche de paie."
      />
      <Roles />
      <Footer />
    </>
  );
}
