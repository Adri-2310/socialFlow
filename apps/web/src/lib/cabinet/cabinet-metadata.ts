import type { Metadata } from 'next';

// Metadonnees de l'espace Cabinet RH (D33) : l'onglet du navigateur porte le
// nom du cabinet, et son logo sert d'icone, a la place de l'identite
// SocialFlow. Module pur : testable sans base ni session.
//
// Le titre de chaque page est son seul libelle ("Mon abonnement") ; le
// modele y ajoute le nom du cabinet.
export function cabinetMetadata(input: {
  displayName: string | null;
  name: string;
  logoUrl: string | null;
}): Metadata {
  // Nom affiche s'il existe, sinon la raison sociale : jamais "SocialFlow".
  const brand = input.displayName?.trim() || input.name;

  return {
    title: { default: brand, template: `%s — ${brand}` },
    applicationName: brand,
    description: `Espace de gestion de ${brand}.`,
    // Pas d'indexation : espace prive, derriere une connexion.
    robots: { index: false, follow: false },
    ...(input.logoUrl
      ? { icons: { icon: input.logoUrl, shortcut: input.logoUrl, apple: input.logoUrl } }
      : {}),
  };
}
