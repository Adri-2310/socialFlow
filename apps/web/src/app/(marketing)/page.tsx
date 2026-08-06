import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { TrustBadges } from '@/components/landing/trust-badges';
import { Stats } from '@/components/landing/stats';
import { FeaturesTeaser } from '@/components/landing/features-teaser';
import { PricingTeaser } from '@/components/landing/pricing-teaser';
import { Footer } from '@/components/landing/footer';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustBadges />
        <Stats />
        <FeaturesTeaser />
        <PricingTeaser />
      </main>
      <Footer />
    </>
  );
}
