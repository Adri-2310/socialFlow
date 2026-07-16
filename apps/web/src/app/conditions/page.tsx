import type { Metadata } from 'next';
import { Navbar } from '@/components/landing/navbar';
import { PageHero } from '@/components/landing/page-hero';
import { LegalContent } from '@/components/landing/legal-content';
import { Footer } from '@/components/landing/footer';

export const metadata: Metadata = {
  title: 'Conditions générales — SocialFlow',
  description: "Conditions générales d'utilisation et de vente du service SocialFlow.",
};

const sections = [
  {
    title: '1. Objet',
    body: [
      "Les présentes conditions régissent l'accès et l'utilisation de la plateforme SocialFlow, service SaaS de gestion de la paie et des déclarations sociales destiné aux secrétariats sociaux, cabinets RH, entreprises clientes et à leurs salariés.",
    ],
  },
  {
    title: '2. Accès au service',
    body: [
      "L'accès à SocialFlow nécessite la création d'un compte et, selon le rôle, une invitation par un cabinet ou une entreprise cliente déjà abonnée. Chaque utilisateur est responsable de la confidentialité de ses identifiants.",
    ],
  },
  {
    title: '3. Abonnement et facturation',
    body: [
      "L'abonnement est souscrit par le cabinet RH ou l'entreprise cliente, selon la formule choisie (voir la page Tarifs). La facturation est mensuelle ou annuelle, sans engagement de durée sauf mention contraire lors de la souscription. Un essai de 30 jours est proposé sans carte bancaire.",
    ],
  },
  {
    title: "4. Obligations de l'utilisateur",
    body: [
      "L'utilisateur s'engage à fournir des informations exactes, à ne pas détourner le service de son usage prévu et à respecter la réglementation applicable à la gestion de la paie et des données sociales.",
    ],
  },
  {
    title: '5. Propriété intellectuelle',
    body: [
      'La plateforme, son code, son design et sa marque restent la propriété exclusive de SocialFlow. Les données saisies par les clients (fiches de paie, informations salariés) restent la propriété du client.',
    ],
  },
  {
    title: '6. Disponibilité et responsabilité',
    body: [
      "SocialFlow met en œuvre les moyens raisonnables pour assurer la disponibilité et la fiabilité du service, sans garantie d'absence totale d'interruption. La responsabilité de SocialFlow ne saurait être engagée pour des dommages indirects résultant de l'utilisation du service.",
    ],
  },
  {
    title: '7. Résiliation',
    body: [
      "Chaque partie peut résilier l'abonnement selon les modalités décrites lors de la souscription. En cas de résiliation, les données du client restent accessibles pour export pendant une durée raisonnable avant suppression définitive.",
    ],
  },
  {
    title: '8. Droit applicable',
    body: [
      'Les présentes conditions sont soumises au droit belge. Tout litige relève de la compétence exclusive des tribunaux belges.',
    ],
  },
];

export default function ConditionsPage() {
  return (
    <>
      <Navbar />
      <PageHero
        eyebrow="Légal"
        title="Conditions générales d'utilisation"
        description="Les règles qui encadrent l'accès et l'utilisation de la plateforme SocialFlow."
      />
      <LegalContent updatedAt="16 juillet 2026" sections={sections} />
      <Footer />
    </>
  );
}
