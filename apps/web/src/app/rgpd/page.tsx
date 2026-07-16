import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { LegalContent } from '@/components/landing/legal-content';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'RGPD — SocialFlow',
  description: 'Comment SocialFlow traite les données personnelles conformément au RGPD.',
};

const sections = [
  {
    title: '1. Responsable du traitement',
    body: [
      'SocialFlow est responsable du traitement des données personnelles collectées via la plateforme, dans le cadre de la fourniture du service de gestion de la paie et des déclarations sociales.',
    ],
  },
  {
    title: '2. Données collectées',
    body: [
      'Nous traitons les données nécessaires à la production des fiches de paie et aux déclarations sociales : identité, coordonnées, données contractuelles et rémunération des salariés, ainsi que les données de compte des utilisateurs de la plateforme (cabinets RH, gestionnaires, entreprises clientes).',
    ],
  },
  {
    title: '3. Finalités du traitement',
    body: [
      'Ces données sont utilisées pour générer les fiches de paie, effectuer les déclarations ONSS et DIMONA, assurer la facturation et la gestion des comptes, et améliorer la sécurité et la qualité du service.',
    ],
  },
  {
    title: '4. Base légale',
    body: [
      "Le traitement repose sur l'exécution du contrat qui nous lie à nos clients, sur nos obligations légales en matière sociale et fiscale, et, le cas échéant, sur votre consentement.",
    ],
  },
  {
    title: '5. Durée de conservation',
    body: [
      'Les données relatives à la paie sont conservées conformément aux obligations légales belges en matière sociale (généralement 5 ans). Les données de compte sont conservées pour la durée de la relation contractuelle, puis archivées ou supprimées selon les délais légaux applicables.',
    ],
  },
  {
    title: '6. Sous-traitants et hébergement',
    body: [
      "Les données sont hébergées au sein de l'Union européenne. Certains prestataires techniques (hébergement, paiement, envoi d'emails) peuvent avoir accès à des données dans le cadre strict de leur mission, sous contrat de sous-traitance conforme au RGPD.",
    ],
  },
  {
    title: '7. Vos droits',
    body: [
      "Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité sur vos données personnelles. Vous pouvez également introduire une réclamation auprès de l'Autorité de protection des données.",
    ],
  },
  {
    title: '8. Contact',
    body: [
      'Pour toute question relative à vos données personnelles, contactez-nous à contact@socialflow.com.',
    ],
  },
];

export default function RgpdPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="Légal"
        title="Protection des données (RGPD)"
        description="Comment SocialFlow collecte, utilise et protège les données personnelles traitées sur la plateforme."
      />
      <LegalContent updatedAt="16 juillet 2026" sections={sections} />
      <Footer />
    </>
  );
}
