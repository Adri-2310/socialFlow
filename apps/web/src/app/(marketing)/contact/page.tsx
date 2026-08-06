import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { Contact } from '@/components/landing/contact';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Contact — SocialFlow',
  description:
    "Contactez l'équipe SocialFlow pour une question commerciale, une démo ou une assistance technique.",
};

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero
          eyebrow="Contact"
          title="Parlons de vos besoins"
          description="Une question commerciale ou besoin d'aide ? Notre équipe vous répond rapidement."
        />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
