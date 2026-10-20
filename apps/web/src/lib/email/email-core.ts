import { Resend } from 'resend';
import { getCabinetEmailBrand } from '@/lib/email/cabinet-email-brand';
import { emailTheme, formatFrom, type CabinetEmailBrand } from '@/lib/email/email-brand';
import { prisma } from '@/lib/prisma';
import { escapeHtml } from '@/lib/email/email-layout';

// Éléments communs aux envois d'emails (voir email.ts, qui reste la façade que le
// reste de l'application importe) : client Resend, identité d'un email de compte,
// sujet sans retour à la ligne.
export const resend = new Resend(process.env.RESEND_API_KEY);

// Roles dont les emails de compte prennent l'identite du cabinet (D33, D72) :
// l'equipe et les clients du cabinet. Le Cabinet RH (titulaire), client de
// SocialFlow, et le SuperAdmin recoivent des emails SocialFlow.
const CABINET_BRANDED_ROLES = ['GESTIONNAIRE_RH', 'ENTREPRISE_CLIENTE', 'COLLABORATEUR'];

// Contexte d'un email de COMPTE (connexion, mot de passe, double authentification,
// verification d'adresse...) : aux couleurs du cabinet pour un gestionnaire, un
// administrateur d'entreprise ou un collaborateur (D33, D72), a celles de
// SocialFlow sinon (titulaire, SuperAdmin, inscription en cours, adresse
// inconnue). Jamais bloquant : une erreur de lecture donne l'identite SocialFlow
// plutot qu'un email perdu.
export async function accountContext(email: string) {
  let brand: CabinetEmailBrand | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { cabinetId: true, role: true },
    });
    if (user?.cabinetId && CABINET_BRANDED_ROLES.includes(user.role ?? '')) {
      brand = await getCabinetEmailBrand(user.cabinetId);
    }
  } catch (error) {
    console.error("Echec de la lecture de l'identite du cabinet pour un email", error);
  }

  const theme = emailTheme(brand);
  const app = brand ? safeSubject(brand.name) : 'SocialFlow';
  return {
    theme,
    app,
    appHtml: escapeHtml(brand ? brand.name : 'SocialFlow'),
    accent: theme?.headerBg ?? '#6d28d9',
    from: brand
      ? formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string)
      : (process.env.RESEND_FROM_EMAIL as string),
  };
}

// Le nom du cabinet est du texte libre : pas de retour a la ligne dans un sujet.
export function safeSubject(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
