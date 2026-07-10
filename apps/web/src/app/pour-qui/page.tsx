import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { Roles } from '@/components/landing/roles';
import { CTA } from '@/components/landing/cta';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Pour qui ? — SocialFlow',
  description:
    'SocialFlow s\'adapte à chaque rôle : SuperAdmin, Cabinet RH, Gestionnaire, Entreprise cliente et Salarié. Découvrez une plateforme, cinq expériences.',
};

export default function PourQuiPage() {
  return (
    <>
      <Navbar />
      <Roles />
      <CTA />
      <Footer />
    </>
  );
}
