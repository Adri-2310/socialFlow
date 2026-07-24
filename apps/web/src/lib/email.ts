import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const BRAND_GRADIENT = 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 45%, #0f766e 100%)';
const CTA_GRADIENT = 'linear-gradient(135deg, #4f46e5 0%, #00c49f 100%)';

function emailShell(content: string): string {
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
      [data-ogsc] .email-header, [data-ogsb] .email-header { background-color: #4c1d95 !important; }
      [data-ogsc] .email-brand, [data-ogsc] .email-brand span { color: #ffffff !important; }
      [data-ogsc] .email-button-cell, [data-ogsb] .email-button-cell { background-color: #4f46e5 !important; }
      [data-ogsc] .email-button-link { color: #ffffff !important; }
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
              <td bgcolor="#4c1d95" class="email-header" style="background-color:#4c1d95; background-image:${BRAND_GRADIENT}; padding:28px 32px;">
                <span class="email-brand" style="font-size:19px; font-weight:700; color:#ffffff;">Social<span style="color:#5eead4;">Flow</span></span>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-body" style="padding:32px; background-color:#ffffff; color:#334155; font-size:14px; line-height:1.6;">
                ${content}
              </td>
            </tr>
          </table>
          <p style="margin-top:20px; font-size:12px; color:#94a3b8;">© 2026 SocialFlow — Tous droits réservés.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td bgcolor="#4f46e5" class="email-button-cell" style="border-radius:12px; background-color:#4f46e5; background-image:${CTA_GRADIENT};">
                <a href="${url}" class="email-button-link" style="display:inline-block; padding:13px 28px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${label}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export async function sendMagicLinkEmail(email: string, url: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre lien de connexion</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour vous connecter à votre espace SocialFlow. Ce lien est valable 5 minutes et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Se connecter', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Votre lien de connexion SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendOTPEmail(email: string, otp: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Connexion sans mot de passe</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre code de connexion</h1>
    <p style="margin:0 0 24px; color:#475569;">Saisissez ce code dans SocialFlow pour vous connecter. Il est valable 5 minutes.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" bgcolor="#f8f7fc" class="email-otp-box" style="padding:20px; border-radius:14px; background-color:#f8f7fc; border:1px solid #ede9fe;">
          <span class="email-otp-code" style="font-size:32px; font-weight:700; letter-spacing:10px; color:#4c1d95; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${otp}</span>
        </td>
      </tr>
    </table>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — aucun compte ne sera modifié.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Votre code de connexion SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendVerificationEmail(email: string, url: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Vérification d'email</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez votre adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour confirmer cette adresse email sur votre compte SocialFlow.</p>
    ${ctaButton('Confirmer mon email', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Confirmez votre adresse email SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendChangeEmailConfirmationEmail(
  oldEmail: string,
  newEmail: string,
  url: string,
) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Confirmez le changement d'adresse email</h1>
    <p style="margin:0 0 28px; color:#475569;">Une demande de changement d'adresse email a été faite sur votre compte SocialFlow, de <strong>${oldEmail}</strong> vers <strong>${newEmail}</strong>. Cliquez ci-dessous pour l'autoriser.</p>
    ${ctaButton('Autoriser le changement', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre adresse restera inchangée.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: oldEmail,
    subject: "Confirmez le changement d'adresse email SocialFlow",
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendAccountDeletedEmail(email: string, name: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre compte a été supprimé</h1>
    <p style="margin:0; color:#475569;">Bonjour ${name}, votre compte SocialFlow et toutes les données associées viennent d'être définitivement supprimés.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette suppression, contactez notre support au plus vite.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Votre compte SocialFlow a été supprimé',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendPasswordChangedEmail(email: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Votre mot de passe a été modifié</h1>
    <p style="margin:0; color:#475569;">Le mot de passe de votre compte SocialFlow vient d'être changé avec succès.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de ce changement, contactez notre support immédiatement.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Votre mot de passe SocialFlow a été modifié',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendTwoFactorEnabledEmail(email: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Double authentification activée</h1>
    <p style="margin:0; color:#475569;">La double authentification vient d'être activée sur votre compte SocialFlow. Une connexion nécessitera désormais un code de votre application d'authentification.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Double authentification activée sur SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendTwoFactorDisabledEmail(email: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Double authentification désactivée</h1>
    <p style="margin:0; color:#475569;">La double authentification vient d'être désactivée sur votre compte SocialFlow.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement et réactivez la double authentification.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Double authentification désactivée sur SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendAccountUnlinkedEmail(email: string, providerLabel: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Compte ${providerLabel} délié</h1>
    <p style="margin:0; color:#475569;">Votre compte ${providerLabel} vient d'être délié de votre compte SocialFlow. Vous ne pourrez plus l'utiliser pour vous connecter.</p>
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette action, contactez notre support immédiatement.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: `Compte ${providerLabel} délié de SocialFlow`,
    html,
  });

  if (error) throw new Error(error.message);
}

export async function sendResetPasswordEmail(email: string, url: string) {
  const html = emailShell(`
    <p style="margin:0 0 8px; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:#6d28d9;">Sécurité du compte</p>
    <h1 style="margin:0 0 12px; font-size:21px; font-weight:700; color:#0f172a;">Réinitialisez votre mot de passe</h1>
    <p style="margin:0 0 28px; color:#475569;">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.</p>
    ${ctaButton('Réinitialiser le mot de passe', url)}
    <p style="margin:28px 0 0; padding-top:20px; border-top:1px solid #e5e7eb; font-size:12px; color:#94a3b8;">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
  `);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL as string,
    to: email,
    subject: 'Réinitialisez votre mot de passe SocialFlow',
    html,
  });

  if (error) throw new Error(error.message);
}
