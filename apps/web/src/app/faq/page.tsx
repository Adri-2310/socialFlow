import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { FAQ } from '@/components/landing/faq';
import { CTA } from '@/components/landing/cta';
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
      <FAQ />
      <CTA />
      <Footer />
    </>
  );
}
