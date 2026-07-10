import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { FAQ } from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'FAQ — SocialFlow',
  description:
    'Toutes les réponses à vos questions sur SocialFlow : conformité, migration de données, hébergement et sécurité.',
};

export default function FAQPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="FAQ"
        title="Questions fréquentes"
        description="Toutes les réponses à vos questions sur la conformité, la migration de données et la sécurité."
      />
      <FAQ />
      <Footer />
    </>
  );
}
