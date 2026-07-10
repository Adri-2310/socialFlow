import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { TrustBadges } from '@/components/landing/trust-badges';
import { Features } from '@/components/landing/features';
import { Roles } from '@/components/landing/roles';
import { Pricing } from '@/components/landing/pricing';
import { FAQ } from '@/components/landing/faq';
import { CTA } from '@/components/landing/cta';
import { Footer } from '@/components/landing/footer';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <TrustBadges />
      <Features />
      <Roles />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </>
  );
}
