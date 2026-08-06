import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { LegalContent } from '@/components/landing/legal-content';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Politique de confidentialité — SocialFlow',
  description:
    'Comment SocialFlow protège la confidentialité de vos données et utilise les cookies.',
};

const sections = [
  {
    title: 'Quelles données nous collectons',
    body: [
      "Nous collectons les données que vous nous fournissez lors de la création de votre compte (nom, email, rôle), les données de paie saisies dans le cadre du service, ainsi que des données techniques liées à votre navigation (adresse IP, type d'appareil, pages consultées).",
    ],
  },
  {
    title: 'Comment nous les utilisons',
    body: [
      'Ces données servent à fournir et améliorer le service, sécuriser les comptes, assurer le support client, et respecter nos obligations légales en matière sociale et fiscale. Nous ne vendons jamais vos données à des tiers.',
    ],
  },
  {
    title: 'Cookies',
    body: [
      "Le site utilise des cookies strictement nécessaires au fonctionnement de la plateforme (session, préférence de thème) ainsi que, le cas échéant, des cookies de mesure d'audience anonymisée. Aucun cookie publicitaire n'est utilisé.",
    ],
  },
  {
    title: 'Partage avec des tiers',
    body: [
      "Certaines données transitent par des prestataires techniques nécessaires au service (hébergement, paiement, envoi d'emails transactionnels), dans le strict cadre de leur mission et sous engagement de confidentialité.",
    ],
  },
  {
    title: 'Sécurité',
    body: [
      "Les données sont chiffrées en transit et au repos. L'accès aux données de paie est restreint par un système de rôles et de permissions, avec journalisation des accès sensibles.",
    ],
  },
  {
    title: 'Vos droits',
    body: [
      'Conformément au RGPD, vous pouvez accéder, rectifier, exporter ou demander la suppression de vos données personnelles à tout moment, sous réserve des obligations légales de conservation propres à la paie.',
    ],
  },
  {
    title: 'Contact',
    body: ['Pour toute question sur cette politique, contactez-nous à contact@socialflow.com.'],
  },
];

export default function ConfidentialitePage() {
  return (
    <>
      <Navbar />
      <main>
        <PageHero
          eyebrow="Légal"
          title="Politique de confidentialité"
          description="Notre approche de la confidentialité, des cookies et de la sécurité des données."
        />
        <LegalContent updatedAt="16 juillet 2026" sections={sections} />
      </main>
      <Footer />
    </>
  );
}
