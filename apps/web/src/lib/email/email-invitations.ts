import { resend, safeSubject } from '@/lib/email/email-core';
import { emailTheme, formatFrom, type CabinetEmailBrand } from '@/lib/email/email-brand';
import {
  buildAdminReplaced,
  buildEntrepriseInvitation,
  buildGestionnaireInvitation,
  buildWelcomeAccount,
  emailShell,
  escapeHtml,
} from '@/lib/email/email-layout';

// Emails envoyés AU NOM du cabinet : invitations, bienvenue, administrateur remplacé,
// changement d'accès d'un gestionnaire.
// Invitation envoyee AU NOM du cabinet (D30, D33) : son nom, son logo et sa
// couleur, son nom comme expediteur et son email de contact en adresse de
// reponse. "Propulse par SocialFlow" reste affiche (D35).
// `template` : modele personnalise du cabinet (D68), sinon celui par defaut. Le
// titre, le bouton et la mention de securite restent fixes.
export async function sendGestionnaireInvitationEmail(
  email: string,
  brand: CabinetEmailBrand,
  inviterName: string,
  url: string,
  template?: { subject: string; body: string } | null,
  options?: { subjectPrefix?: string; portalUrl?: string },
) {
  // Le meme constructeur sert a l'apercu des modeles (lib/email/email-layout.ts) :
  // l'apercu est exactement l'email recu.
  const { subject, html } = buildGestionnaireInvitation({
    brand,
    inviterName,
    url,
    template,
    subjectPrefix: options?.subjectPrefix,
    portalUrl: options?.portalUrl,
  });

  const { error } = await resend.emails.send({
    from: formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string),
    to: email,
    subject,
    html,
    ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
  });

  if (error) throw new Error(error.message);
}

// Invitation de l'administrateur d'une entreprise cliente (D4, D5), envoyee au
// nom du cabinet comme celle d'un gestionnaire.
export async function sendEntrepriseInvitationEmail(
  email: string,
  brand: CabinetEmailBrand,
  inviterName: string,
  entrepriseName: string,
  url: string,
  template?: { subject: string; body: string } | null,
  options?: { subjectPrefix?: string; portalUrl?: string },
) {
  const { subject, html } = buildEntrepriseInvitation({
    brand,
    inviterName,
    entrepriseName,
    url,
    template,
    subjectPrefix: options?.subjectPrefix,
    portalUrl: options?.portalUrl,
  });

  const { error } = await resend.emails.send({
    from: formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string),
    to: email,
    subject,
    html,
    ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
  });

  if (error) throw new Error(error.message);
}

// D76 : bienvenue apres l'acceptation d'une invitation, avec le portail du cabinet.
export async function sendWelcomeAccountEmail(
  email: string,
  brand: CabinetEmailBrand,
  name: string,
  portalUrl: string,
  entrepriseName?: string | null,
) {
  const { subject, html } = buildWelcomeAccount({ brand, name, portalUrl, entrepriseName });

  const { error } = await resend.emails.send({
    from: formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string),
    to: email,
    subject: safeSubject(subject),
    html,
    ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
  });

  if (error) throw new Error(error.message);
}

// D78 : prevenu l'ancien administrateur d'une entreprise que son acces a ete remplace.
export async function sendAdminReplacedEmail(
  email: string,
  brand: CabinetEmailBrand,
  name: string,
  entrepriseName: string,
) {
  const { subject, html } = buildAdminReplaced({ brand, name, entrepriseName });

  const { error } = await resend.emails.send({
    from: formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string),
    to: email,
    subject: safeSubject(subject),
    html,
    ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
  });

  if (error) throw new Error(error.message);
}

export type GestionnaireAccessChange =
  | 'suspended'
  | 'reactivated'
  | 'archived'
  | 'restored'
  | 'email_changed';

const ACCESS_CHANGE_COPY: Record<
  GestionnaireAccessChange,
  { subject: (cabinet: string) => string; title: string; body: (cabinet: string) => string }
> = {
  suspended: {
    subject: (cabinet) => `Votre accès à ${cabinet} a été suspendu`,
    title: 'Votre accès a été suspendu',
    body: (cabinet) =>
      `${cabinet} a suspendu votre accès. Vous ne pouvez plus vous connecter pour le moment. Pour le réactiver, contactez le responsable de votre cabinet.`,
  },
  reactivated: {
    subject: (cabinet) => `Votre accès à ${cabinet} a été réactivé`,
    title: 'Votre accès a été réactivé',
    body: (cabinet) =>
      `${cabinet} a réactivé votre accès. Vous pouvez de nouveau vous connecter avec vos identifiants habituels.`,
  },
  archived: {
    subject: (cabinet) => `Votre accès à ${cabinet} a été retiré`,
    title: 'Votre accès a été retiré',
    body: (cabinet) =>
      `${cabinet} a retiré votre accès. Si vous pensez qu'il s'agit d'une erreur, contactez le responsable de votre cabinet.`,
  },
  restored: {
    subject: (cabinet) => `Votre accès à ${cabinet} a été rétabli`,
    title: 'Votre accès a été rétabli',
    body: (cabinet) =>
      `${cabinet} a rétabli votre compte. Vous pouvez de nouveau vous connecter, sauf si votre accès a été suspendu par ailleurs.`,
  },
  // Envoye a l'ANCIENNE adresse (D53) : c'est elle qui doit etre prevenue.
  email_changed: {
    subject: () => "L'adresse email de votre compte a été modifiée",
    title: "L'adresse de votre compte a été modifiée",
    body: (cabinet) =>
      `${cabinet} a modifié l'adresse email de connexion de votre compte. Vous devez désormais vous connecter avec la nouvelle adresse, que vous allez devoir confirmer par email. Si vous pensez qu'il s'agit d'une erreur, contactez le responsable de votre cabinet.`,
  },
};

// D52 : informe un gestionnaire d'un changement d'acces decide par son cabinet.
export async function sendGestionnaireAccessChangedEmail(
  email: string,
  name: string,
  brand: CabinetEmailBrand,
  change: GestionnaireAccessChange,
) {
  const copy = ACCESS_CHANGE_COPY[change];
  const theme = emailTheme(brand);
  const accent = theme?.headerBg ?? '#6d28d9';
  const html = emailShell(
    `
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${accent};">Accès au compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">${copy.title}</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0; color:#475569;">${escapeHtml(copy.body(brand.name))}</p>
  `,
    theme,
  );

  const { error } = await resend.emails.send({
    from: formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string),
    to: email,
    subject: safeSubject(copy.subject(brand.name)),
    html,
    ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
  });

  if (error) throw new Error(error.message);
}
