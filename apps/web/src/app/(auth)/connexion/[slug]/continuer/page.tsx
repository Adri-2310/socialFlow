import { redirect } from 'next/navigation';

// Retour d'une connexion par le portail (lien magique, Google, Microsoft) : la
// session est ouverte, on entre dans l'espace. L'adresse de retour sous
// /connexion/<identifiant> est ce qui annonce le portail au serveur (D76).
export default function PortalContinuePage() {
  redirect('/dashboard');
}
