import { contrastRatio, readableForeground } from '@/lib/color';

// Identite visuelle des emails envoyes AU NOM du cabinet (D30, D33) : ses
// invitations et ses messages a son equipe. Les emails de securite (connexion,
// mot de passe, 2FA) et ceux de la plateforme (paiement) restent aux couleurs
// de SocialFlow. Module pur : testable sans envoi.

export type CabinetEmailBrand = {
  // Nom affiche du cabinet, ou sa raison sociale.
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
  // Email de contact du cabinet : adresse de reponse (Reply-To).
  replyTo: string | null;
};

// Couleurs de SocialFlow, reprises de lib/email.ts.
export const SOCIALFLOW_HEADER = '#4c1d95';
export const SOCIALFLOW_CTA = '#4f46e5';

export type EmailTheme = {
  headerBg: string;
  headerFg: string;
  ctaBg: string;
  ctaFg: string;
  // Texte du pied de page.
  footer: string;
  // Logo a afficher dans l'en-tete, ou null.
  logoUrl: string | null;
  brandName: string | null;
};

// Les clients mail (Gmail surtout) n'affichent pas les SVG : seul un PNG est
// utilise comme logo dans un email, sinon le nom suffit.
function emailLogo(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  try {
    const url = new URL(logoUrl);
    return url.protocol === 'https:' && /\.png$/i.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function emailTheme(brand?: CabinetEmailBrand | null): EmailTheme | null {
  if (!brand) return null;
  const primary = brand.primaryColor;
  const headerBg = primary ?? SOCIALFLOW_HEADER;
  const ctaBg = primary ?? SOCIALFLOW_CTA;

  return {
    headerBg,
    headerFg: readableForeground(headerBg),
    ctaBg,
    ctaFg: readableForeground(ctaBg),
    footer: `${brand.name} — Propulsé par SocialFlow`,
    logoUrl: emailLogo(brand.logoUrl),
    brandName: brand.name,
  };
}

// Nom d'expediteur : texte du cabinet, donc nettoye avant d'entrer dans un
// en-tete. Pas de retour a la ligne (injection d'en-tetes), de guillemets ni de
// chevrons, longueur bornee.
export function safeSenderName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f"<>\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// "SocialFlow <noreply@socialflow.page>" ou "noreply@socialflow.page" -> adresse.
export function senderAddress(from: string): string {
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  return (match ? match[1] : from).trim();
}

// Expediteur au nom du cabinet : son nom en clair, sur l'adresse d'envoi de
// SocialFlow (noreply@...), celle dont la reputation est etablie. Une adresse
// propre a chaque cabinet (alicia-cabinet@...) a ete essayee puis ecartee : un
// expediteur inconnu a fini en courrier indesirable chez Outlook. Une adresse
// sur le domaine du cabinet est reservee au white-label Enterprise (D35).
// Aucune boite n'existe derriere : les reponses vont a l'email de contact
// (Reply-To).
export function formatFrom(brandName: string | null, fromEnv: string): string {
  const safe = brandName ? safeSenderName(brandName) : '';
  return safe ? `"${safe}" <${senderAddress(fromEnv)}>` : fromEnv;
}

// Garde-fou de lisibilite : le texte pose sur la couleur d'en-tete atteint
// toujours 4,5:1 (le meilleur de blanc ou texte fonce).
export function headerContrast(theme: EmailTheme): number {
  return contrastRatio(theme.headerBg, theme.headerFg);
}
