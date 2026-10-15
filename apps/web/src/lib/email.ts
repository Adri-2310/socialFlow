import { Resend } from 'resend';
import { ACCOUNT_DELETION_RETENTION_DAYS } from '@/lib/account-retention';
import { getCabinetEmailBrand } from '@/lib/cabinet-email-brand';
import { emailTheme, formatFrom, type CabinetEmailBrand, type EmailTheme } from '@/lib/email-brand';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

const BRAND_GRADIENT = 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 45%, #0f766e 100%)';
const CTA_GRADIENT = 'linear-gradient(135deg, #4f46e5 0%, #00c49f 100%)';

// `theme` : identite du cabinet pour les emails envoyes en son nom (D33).
// Absent = identite SocialFlow (securite, plateforme).
function emailShell(content: string, theme?: EmailTheme | null): string {
  const headerBg = theme?.headerBg ?? '#4c1d95';
  const headerFg = theme?.headerFg ?? '#ffffff';
  const ctaBg = theme?.ctaBg ?? '#4f46e5';
  const headerBackground = theme
    ? `background-color:${headerBg};`
    : `background-color:#4c1d95; background-image:${BRAND_GRADIENT};`;
  const brandMark = theme
    ? `${
        theme.logoUrl
          ? `<img src="${escapeHtml(theme.logoUrl)}" alt="" height="36" style="display:inline-block; height:36px; width:auto; max-width:160px; vertical-align:middle; margin-right:12px; border:0;" />`
          : ''
      }<span class="email-brand" style="font-size:19px; font-weight:700; color:${headerFg}; vertical-align:middle;">${escapeHtml(theme.brandName ?? '')}</span>`
    : `<span class="email-brand" style="font-size:19px; font-weight:700; color:#ffffff;">Social<span style="color:#5eead4;">Flow</span></span>`;
  const footer = theme
    ? `© 2026 ${escapeHtml(theme.footer)}`
    : '© 2026 SocialFlow — Tous droits réservés.';

  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <style>
      /* Outlook.com (desktop + web) applique son propre mode sombre et
         reinterprete les couleurs inline, y compris quand color-scheme dit
         "light". [data-ogsc]/[data-ogsb] sont les hooks qu'Outlook ajoute
         lui-meme au DOM en mode sombre : on les cible pour reimposer nos
         couleurs de marque en !important. */
      [data-ogsc] .email-wrap, [data-ogsb] .email-wrap { background-color: #f1f0f5 !important; }
      [data-ogsc] .email-card, [data-ogsb] .email-card { background-color: #ffffff !important; }
      [data-ogsc] .email-header, [data-ogsb] .email-header { background-color: ${headerBg} !important; }
      [data-ogsc] .email-brand, [data-ogsc] .email-brand span { color: ${headerFg} !important; }
      [data-ogsc] .email-button-cell, [data-ogsb] .email-button-cell { background-color: ${ctaBg} !important; }
      [data-ogsc] .email-button-link { color: ${theme?.ctaFg ?? '#ffffff'} !important; }
      [data-ogsc] .email-otp-box, [data-ogsb] .email-otp-box { background-color: #f8f7fc !important; }
      [data-ogsc] .email-otp-code { color: #4c1d95 !important; }
      [data-ogsc] .email-body, [data-ogsb] .email-body { background-color: #ffffff !important; }
      [data-ogsc] .email-body,
      [data-ogsc] .email-body p,
      [data-ogsc] .email-body h1,
      [data-ogsc] .email-body span { color: #334155 !important; }
    </style>
  </head>
  <body class="email-wrap" style="margin:0; padding:32px 16px; background-color:#f1f0f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" class="email-card" style="max-width:480px; width:100%; background-color:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 12px 32px rgba(76,29,149,0.12);">
            <tr>
              <td bgcolor="${headerBg}" class="email-header" style="${headerBackground} padding:28px 32px;">
                ${brandMark}
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-body" style="padding:32px; background-color:#ffffff; color:#334155; font-size:14px; line-height:1.6;">
                ${content}
              </td>
            </tr>
          </table>
          <p style="margin-top:20px; font-size:12px; color:#94a3b8;">${footer}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// `name` vient de updateUser({name}) sans contrainte serveur : contrairement
// a `url`/`oldEmail`/`newEmail` (generes par better-auth ou valides comme
// adresses email), c'est du texte libre qu'un utilisateur peut definir a
// volonte - a echapper avant interpolation dans du HTML (voir audit
// securite, doc/analysis/AUDIT_SECURITE_AUTH.md, finding #6).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ctaButton(label: string, url: string, theme?: EmailTheme | null): string {
  const bg = theme?.ctaBg ?? '#4f46e5';
  const fg = theme?.ctaFg ?? '#ffffff';
  const background = theme
    ? `background-color:${bg};`
    : `background-color:#4f46e5; background-image:${CTA_GRADIENT};`;

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td bgcolor="${bg}" class="email-button-cell" style="border-radius:12px; ${background}">
                <a href="${url}" class="email-button-link" style="display:inline-block; padding:13px 28px; font-size:14px; font-weight:600; color:${fg}; text-decoration:none;">${label}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

// Contexte d'un email de COMPTE (connexion, mot de passe, double authentification,
// verification d'adresse...) : aux couleurs du cabinet de l'utilisateur quand il
// en a un (D33, D66), a celles de SocialFlow sinon (SuperAdmin, inscription en
// cours, adresse inconnue). Jamais bloquant : une erreur de lecture donne
// l'identite SocialFlow plutot qu'un email perdu.
async function accountContext(email: string) {
  let brand: CabinetEmailBrand | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { cabinetId: true, role: true },
    });
    if (user?.cabinetId && user.role !== 'SUPER_ADMIN') {
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

export async function sendMagicLinkEmail(email: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre lien de connexion</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour vous connecter à votre espace ${ctx.appHtml}. Ce lien est valable 5 minutes et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Se connecter', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre lien de connexion ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendOTPEmail(email: string, otp: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre code de connexion</h1>
    <p style="margin:0 0 24px; color:#475569;">Saisissez ce code dans ${ctx.appHtml} pour vous connecter. Il est valable 5 minutes.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" bgcolor="#f8f7fc" class="email-otp-box" style="padding:20px; border-radius:14px; background-color:#f8f7fc; border:1px solid #ede9fe;">
          <span class="email-otp-code" style="font-size:32px; font-weight:700; letter-spacing:10px; color:${ctx.accent}; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${otp}</span>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre code de connexion ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendVerificationEmail(email: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Vérification d'email</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez votre adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour confirmer cette adresse email sur votre compte ${ctx.appHtml}.</p>
    ${ctaButton('Confirmer mon email', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Confirmez votre adresse email ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendChangeEmailConfirmationEmail(
  oldEmail: string,
  newEmail: string,
  url: string,
) {
  const ctx = await accountContext(oldEmail);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez le changement d'adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Une demande de changement d'adresse email a été faite sur votre compte ${ctx.appHtml}, de <strong>${oldEmail}</strong> vers <strong>${newEmail}</strong>. Cliquez ci-dessous pour l'autoriser.</p>
    ${ctaButton('Autoriser le changement', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre adresse restera inchangée.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: oldEmail,
    subject: `Confirmez le changement d'adresse email ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendDeleteAccountVerificationEmail(email: string, name: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez la suppression de votre compte</h1>
    <p style="margin:0 0 28px; color:#475569;">Bonjour ${escapeHtml(name)}, une demande de suppression de votre compte ${ctx.appHtml} a été faite. Cliquez ci-dessous pour la confirmer. Ce lien est valable 24 heures et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Confirmer la suppression', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre compte restera intact.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Confirmez la suppression de votre compte ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendAccountDeletedEmail(email: string, name: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre compte a été supprimé</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)}, votre compte ${ctx.appHtml} vient d'être désactivé et n'est plus accessible.</p>
    <p style="margin:0; color:#475569;">Vous disposez de ${ACCOUNT_DELETION_RETENTION_DAYS} jours pour contacter notre support si vous souhaitez le récupérer. Passé ce délai, votre compte et toutes les données associées seront définitivement et irréversiblement supprimés.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette suppression, contactez notre support au plus vite.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre compte ${ctx.app} a été supprimé`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendPasswordChangedEmail(email: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre mot de passe a été modifié</h1>
    <p style="margin:0; color:#475569;">Le mot de passe de votre compte ${ctx.appHtml} vient d'être changé avec succès.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de ce changement, contactez notre support immédiatement.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Votre mot de passe ${ctx.app} a été modifié`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendTwoFactorEnabledEmail(email: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Double authentification activée</h1>
    <p style="margin:0; color:#475569;">La double authentification vient d'être activée sur votre compte ${ctx.appHtml}. Une connexion nécessitera désormais un code de votre application d'authentification.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Double authentification activée sur ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendTwoFactorDisabledEmail(email: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Double authentification désactivée</h1>
    <p style="margin:0; color:#475569;">La double authentification vient d'être désactivée sur votre compte ${ctx.appHtml}.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement et réactivez la double authentification.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Double authentification désactivée sur ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendAccountUnlinkedEmail(email: string, providerLabel: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Compte ${providerLabel} délié</h1>
    <p style="margin:0; color:#475569;">Votre compte ${providerLabel} vient d'être délié de votre compte ${ctx.appHtml}. Vous ne pourrez plus l'utiliser pour vous connecter.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Compte ${providerLabel} délié de ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendResetPasswordEmail(email: string, url: string) {
  const ctx = await accountContext(email);
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${ctx.accent};">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Réinitialisez votre mot de passe</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Réinitialiser le mot de passe', url, ctx.theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
  `, ctx.theme);

  const { error } = await resend.emails.send({
    from: ctx.from,
    to: email,
    subject: `Réinitialisez votre mot de passe ${ctx.app}`,
    html,
  });

  if (error) throw new Error(error.message);
}

// Invitation envoyee AU NOM du cabinet (D30, D33) : son nom, son logo et sa
// couleur, son nom comme expediteur et son email de contact en adresse de
// reponse. "Propulse par SocialFlow" reste affiche (D35).
export async function sendGestionnaireInvitationEmail(
  email: string,
  brand: CabinetEmailBrand,
  inviterName: string,
  url: string,
) {
  const theme = emailTheme(brand);
  const accent = theme?.headerBg ?? '#6d28d9';
  const name = escapeHtml(brand.name);
  const html = emailShell(
    `
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${accent};">Invitation</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Vous êtes invité à rejoindre ${name}</h1>
    <p style="margin:0 0 28px; color:#475569;">${escapeHtml(inviterName)} vous invite à rejoindre l'équipe de ${name} en tant que gestionnaire RH. Cliquez ci-dessous pour créer votre compte. Ce lien est valable 7 jours et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Accepter l’invitation', url, theme)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous ne connaissez pas ${name} ou n'attendiez pas cette invitation, ignorez simplement cet email.</p>
  `,
    theme,
  );

  const { error } = await resend.emails.send({
    from: formatFrom(brand.name, process.env.RESEND_FROM_EMAIL as string),
    to: email,
    subject: `${safeSubject(brand.name)} vous invite à rejoindre son équipe`,
    html,
    ...(brand.replyTo ? { replyTo: brand.replyTo } : {}),
  });

  if (error) throw new Error(error.message);
}

// Le nom du cabinet est du texte libre : pas de retour a la ligne dans un sujet.
function safeSubject(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
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

// D23, D57 : alerte de paiement echoue. `audience` choisit le texte : le
// titulaire du cabinet (qui doit regulariser) ou un SuperAdmin (qui suit).
export async function sendPaymentFailedEmail(
  email: string,
  name: string,
  cabinetName: string,
  graceDeadline: Date,
  audience: 'cabinet' | 'admin',
) {
  const deadline = graceDeadline.toLocaleDateString('fr-BE', {
    timeZone: 'Europe/Brussels',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const copy =
    audience === 'cabinet'
      ? {
          subject: 'Le paiement de votre abonnement SocialFlow a échoué',
          title: 'Le paiement de votre abonnement a échoué',
          body: `Le dernier paiement de l'abonnement de ${cabinetName} n'a pas pu être prélevé. Votre cabinet reste pleinement utilisable jusqu'au ${deadline}. Passé cette date, il passera en lecture seule : vos clients pourront toujours consulter leurs fiches, mais plus rien ne pourra être produit. Régularisez votre abonnement avant cette échéance.`,
        }
      : {
          subject: `Paiement échoué : ${cabinetName}`,
          title: 'Un paiement d\'abonnement a échoué',
          body: `Le paiement de l'abonnement du cabinet ${cabinetName} a échoué. Son délai de grâce court jusqu'au ${deadline} ; il passera ensuite en lecture seule sans régularisation.`,
        };

  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Facturation</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">${copy.title}</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0; color:#475569;">${escapeHtml(copy.body)}</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: copy.subject,
    html,
  });

  if (error) throw new Error(error.message);
}

// D23, D57 : fin du delai de grace, le cabinet passe en lecture seule.
export async function sendPaymentSuspensionEmail(
  email: string,
  name: string,
  cabinetName: string,
  audience: 'cabinet' | 'admin',
) {
  const copy =
    audience === 'cabinet'
      ? {
          subject: 'Votre cabinet SocialFlow est passé en lecture seule',
          title: 'Votre cabinet est passé en lecture seule',
          body: `Le paiement de l'abonnement de ${cabinetName} n'a pas été régularisé dans le délai de grâce. Votre cabinet est désormais en lecture seule : vous et vos clients pouvez consulter les fiches déjà envoyées, mais plus rien ne peut être produit ni modifié. Régularisez votre abonnement pour reprendre l'activité.`,
        }
      : {
          subject: `Cabinet en lecture seule pour impayé : ${cabinetName}`,
          title: 'Un cabinet est passé en lecture seule',
          body: `Le délai de grâce du cabinet ${cabinetName} est écoulé sans régularisation : il est passé en lecture seule pour impayé. Une suspension manuelle éventuelle n'est pas modifiée.`,
        };

  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Facturation</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">${copy.title}</h1>
    <p style="margin:0 0 12px; color:#475569;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0; color:#475569;">${escapeHtml(copy.body)}</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: copy.subject,
    html,
  });

  if (error) throw new Error(error.message);
}
