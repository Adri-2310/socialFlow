import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { TrustBadges } from '@/components/landing/trust-badges';
import { Stats } from '@/components/landing/stats';
import { FeaturesTeaser } from '@/components/landing/features-teaser';
import { PricingTeaser } from '@/components/landing/pricing-teaser';
import { CTA } from '@/components/landing/cta';
import { Footer } from '@/components/landing/footer';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <TrustBadges />
      <Stats />
      <FeaturesTeaser />
      <PricingTeaser />
      <CTA />
      <Footer />
    </>
  );
}
